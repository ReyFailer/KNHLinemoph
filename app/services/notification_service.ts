import { DateTime } from 'luxon'
import NotificationSchedule from '#models/notification_schedule'
import NotificationTemplate from '#models/notification_template'
import NotificationItem from '#models/notification_item'
import NotificationLog from '#models/notification_log'
import LineGroup from '#models/line_group'
import LineApiService, { type LineApiResult } from '#services/line_api_service'
import HisManager from '#services/his_manager'
import ScheduleCalculator from '#services/schedule_calculator'
import SettingsService from '#services/settings_service'
import logger from '@adonisjs/core/services/logger'

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
// Luxon isoWeekday: 1=Mon … 7=Sun
const THAI_WEEKDAY = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์']

function buildSystemPlaceholders(now: DateTime): Record<string, string> {
  const m = now.month - 1
  const w = now.weekday - 1
  return {
    date:     now.toFormat('yyyy-MM-dd'),
    time:     now.toFormat('HH:mm:ss'),
    date_th:  `${now.day} ${THAI_MONTHS[m]} ${now.year + 543}`,
    weekday:  `วัน${THAI_WEEKDAY[w]}`,
  }
}

export interface ItemData {
  itemName: string
  itemKey: string
  data: Record<string, unknown>
  error?: string
}

export interface SendResult {
  success: boolean
  message: string
  itemsData: ItemData[]
  results: Array<{
    groupId: number
    groupName: string
    line: LineApiResult
  }>
}

/**
 * NotificationService — port of app/controllers/NotificationController.php.
 *
 * Loads a schedule, fetches each item's data from HIS, substitutes
 * placeholders into the template, then pushes the message to every
 * configured LINE group and writes one notification_logs row per send.
 */
export default class NotificationService {
  static TZ = ScheduleCalculator.TZ

  /**
   * Fetch a single item's row by running its SQL on the configured
   * HIS connection with `{date}` substituted.
   */
  static async fetchItemData(itemId: number, date?: string): Promise<ItemData | null> {
    const item = await NotificationItem.find(itemId)
    if (!item || !item.isActive) return null

    const targetDate = date ?? DateTime.now().setZone(this.TZ).toFormat('yyyy-MM-dd')

    try {
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : ''
      if (!safeDate) throw new Error(`Invalid date: ${targetDate}`)

      const sql = item.sqlQuery.replace(/\{date\}/g, safeDate)
      const row = await HisManager.queryFirst(item.hisDatabase || 'hos', sql, [])
      return {
        itemName: item.itemName,
        itemKey: item.itemKey,
        data: row ?? {},
      }
    } catch (err: any) {
      logger.warn({ err, itemId }, 'fetchItemData failed')
      return {
        itemName: item.itemName,
        itemKey: item.itemKey,
        data: {},
        error: err?.message ?? String(err),
      }
    }
  }

  static async buildMessage(templateId: number, itemsData: ItemData[]): Promise<string> {
    const template = await NotificationTemplate.find(templateId)
    if (!template) throw new Error('Template not found')

    const now = DateTime.now().setZone(this.TZ)
    const [orgName, siteTitle, siteFooter] = await Promise.all([
      SettingsService.get('org_name', ''),
      SettingsService.get('site_title', ''),
      SettingsService.get('site_footer', ''),
    ])

    let message = template.templateContent

    // System placeholders
    const sys = buildSystemPlaceholders(now)
    sys['org_name']    = orgName
    sys['site_title']  = siteTitle
    sys['site_footer'] = siteFooter
    for (const [k, v] of Object.entries(sys)) {
      message = message.replace(new RegExp(`\\{${escapeRe(k)}\\}`, 'g'), v)
    }

    // Item placeholders
    for (const item of itemsData) {
      if (item.error) {
        const re = new RegExp(`\\{${escapeRe(item.itemKey)}\\}`, 'g')
        message = message.replace(re, 'ERROR')
        continue
      }
      for (const [k, v] of Object.entries(item.data)) {
        const re = new RegExp(`\\{${escapeRe(k)}\\}`, 'g')
        message = message.replace(re, v == null ? '0' : String(v))
      }
      // Fallback: {item_key} → single-column value
      const vals = Object.values(item.data)
      if (vals.length === 1) {
        const re = new RegExp(`\\{${escapeRe(item.itemKey)}\\}`, 'g')
        message = message.replace(re, vals[0] == null ? '0' : String(vals[0]))
      }
    }

    return message
  }

  /**
   * Send a single schedule. Mirrors PHP NotificationController::sendNotification.
   * When `force=true`, all day/time gates are bypassed (used by test send).
   */
  static async sendNotification(scheduleId: number, force = false): Promise<SendResult> {
    const schedule = await NotificationSchedule.find(scheduleId)
    if (!schedule || !schedule.isActive) {
      throw new Error('Schedule not found or inactive')
    }

    const now = DateTime.now().setZone(this.TZ)
    const today = now.toFormat('yyyy-MM-dd')
    const currentTime = now.toFormat('HH:mm:ss')
    const isRepeat = schedule.repeatEnabled

    if (!force && !isRepeat && schedule.lastSentDate?.toFormat('yyyy-MM-dd') === today) {
      throw new Error('Already sent today')
    }

    if (!force) {
      const mode = schedule.scheduleMode || 'weekly'
      if (mode === 'specific') {
        if (!schedule.specificDates?.includes(today)) {
          throw new Error('Today not in specific_dates list')
        }
      } else {
        const dow = ScheduleCalculator.todayDow()
        const allowed = String(schedule.daysOfWeek ?? '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
        if (!allowed.includes(dow)) {
          throw new Error('Not scheduled for today')
        }
      }

      if (!isRepeat && currentTime < schedule.sendTime) {
        throw new Error('Not yet time to send')
      }
      if (isRepeat && schedule.repeatEndTime && currentTime > schedule.repeatEndTime) {
        throw new Error('Past repeat_end_time for today')
      }
    }

    // ---- Load template & auto-detect items from its variables ----
    if (!schedule.templateId) throw new Error('Schedule has no template')
    const tpl = await NotificationTemplate.find(schedule.templateId)
    if (!tpl) throw new Error('Template not found')

    const itemsData: ItemData[] = []
    const tplVars: string[] = tpl.variables ?? []
    if (tplVars.length > 0) {
      const matchingItems = await NotificationItem.query()
        .whereIn('item_key', tplVars)
        .where('is_active', 1)
      for (const item of matchingItems) {
        const data = await this.fetchItemData(item.id, today)
        if (data) itemsData.push(data)
      }
    }
    const message = await this.buildMessage(schedule.templateId, itemsData)

    // ---- Send to each active group ----
    const groupIds = (schedule.groupIds ?? []).map(Number)
    const groups = groupIds.length === 0
      ? []
      : await LineGroup.query().whereIn('id', groupIds).where('is_active', 1)

    const results: SendResult['results'] = []
    for (const group of groups) {
      const line = await LineApiService.sendMessage(
        { apiUrl: group.apiUrl, clientKey: group.clientKey, secretKey: group.secretKey },
        message
      )

      try {
        const log = new NotificationLog()
        log.scheduleId = scheduleId
        log.groupId = group.id
        log.templateId = schedule.templateId
        log.statusCode = line.code
        log.responseText = line.response?.slice(0, 65_535) ?? null
        log.messageContent = message
        await log.save()
      } catch (err) {
        logger.warn({ err }, 'failed to write notification_log row')
      }

      results.push({ groupId: group.id, groupName: group.groupName, line })
    }

    if (results.length > 0 && !force) {
      schedule.lastSentDate = now.startOf('day')
      try { await schedule.save() } catch (err) { logger.warn({ err }, 'failed to update last_sent_date') }
    }

    return {
      success: results.length > 0 && results.some((r) => r.line.success),
      message,
      itemsData,
      results,
    }
  }

  /**
   * Manual test-send to a specific group with a custom message.
   * Always force=true (skips schedule gating).
   */
  static async sendTest(groupId: number, message?: string): Promise<{ success: boolean; message: string; line: LineApiResult }> {
    const group = await LineGroup.find(groupId)
    if (!group || !group.isActive) throw new Error('Group not found or inactive')

    const now = DateTime.now().setZone(this.TZ)
    const finalMsg = message?.trim() || [
      'ทดสอบการส่งข้อความ',
      `วันที่: ${now.toFormat('yyyy-MM-dd')}`,
      `เวลา: ${now.toFormat('HH:mm:ss')}`,
      'จากระบบ Line Notification',
    ].join('\n')

    const line = await LineApiService.sendMessage(
      { apiUrl: group.apiUrl, clientKey: group.clientKey, secretKey: group.secretKey },
      finalMsg
    )

    try {
      const log = new NotificationLog()
      log.groupId = group.id
      log.statusCode = line.code
      log.responseText = line.response?.slice(0, 65_535) ?? null
      log.messageContent = finalMsg
      await log.save()
    } catch (err) {
      logger.warn({ err }, 'failed to write test-send notification_log row')
    }

    return { success: line.success, message: finalMsg, line }
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
