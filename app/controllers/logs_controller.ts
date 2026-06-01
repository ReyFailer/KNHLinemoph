import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import NotificationSchedule from '#models/notification_schedule'
import NotificationLog from '#models/notification_log'
import LineGroup from '#models/line_group'
import LineApiService from '#services/line_api_service'
import AuditService from '#services/audit_service'

const TZ = 'Asia/Bangkok'

export default class LogsController {
  async index({ request, view }: HttpContext) {
    const today = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')
    const weekAgo = DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd')

    const start = (request.input('start_date', weekAgo) as string) || weekAgo
    const end = (request.input('end_date', today) as string) || today
    const scheduleId = request.input('schedule_id', '')
    const status = request.input('status', '')

    const q = db
      .from('notification_logs as l')
      .leftJoin('notification_schedules as s', 'l.schedule_id', 's.id')
      .leftJoin('line_groups as g', 'l.group_id', 'g.id')
      .leftJoin('notification_templates as t', 'l.template_id', 't.id')
      .whereRaw('DATE(l.sent_at) BETWEEN ? AND ?', [start, end])
      .orderBy('l.sent_at', 'desc')
      .select(
        'l.id',
        'l.status_code',
        'l.sent_at',
        'l.response_text',
        'l.message_content',
        'l.group_id',
        's.schedule_name',
        'g.group_name',
        't.template_name'
      )

    if (scheduleId !== '' && !Number.isNaN(Number(scheduleId))) {
      q.where('l.schedule_id', Number(scheduleId))
    }
    if (status !== '' && !Number.isNaN(Number(status))) {
      q.where('l.status_code', Number(status))
    }

    const [logs, schedules] = await Promise.all([
      q,
      NotificationSchedule.query().orderBy('schedule_name', 'asc'),
    ])

    const total = logs.length
    const success = logs.filter((l: any) => Number(l.status_code) === 200).length

    return view.render('pages/logs', {
      title: 'ประวัติการส่ง',
      logs,
      schedules: schedules.map((s) => ({
        id: s.id,
        name: s.scheduleName,
        mode: s.scheduleMode ?? 'weekly',
      })),
      filters: { start, end, schedule_id: String(scheduleId), status: String(status) },
      stats: { total, success, failed: total - success },
    })
  }

  /**
   * POST /logs/clear — delete logs older than X days (default 30) or
   * before a specific date.
   */
  async clear(ctx: HttpContext) {
    const { request, response } = ctx
    const before = String(request.input('before_date', ''))
    const safe = /^\d{4}-\d{2}-\d{2}$/.test(before)
      ? before
      : DateTime.now().setZone(TZ).minus({ days: 30 }).toFormat('yyyy-MM-dd')

    try {
      const result = await db.from('notification_logs').whereRaw('DATE(sent_at) < ?', [safe]).delete()
      await AuditService.record(ctx, {
        action: 'delete',
        targetType: 'log',
        description: `Cleared logs before ${safe} (${result} rows)`,
      })
      return response.json({ success: true, message: `ลบประวัติก่อน ${safe} แล้ว (${result} รายการ)` })
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
  }

  /**
   * POST /logs/export — stream filtered logs as CSV with UTF-8 BOM
   * so Excel reads Thai text correctly.
   */
  async export(ctx: HttpContext) {
    const { request, response } = ctx
    const start = String(request.input('start_date', ''))
    const end = String(request.input('end_date', ''))

    const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(start)
      ? start
      : DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd')
    const safeEnd = /^\d{4}-\d{2}-\d{2}$/.test(end)
      ? end
      : DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')

    const EXPORT_LIMIT = 5_000
    const rows = await db
      .from('notification_logs as l')
      .leftJoin('notification_schedules as s', 'l.schedule_id', 's.id')
      .leftJoin('line_groups as g', 'l.group_id', 'g.id')
      .leftJoin('notification_templates as t', 'l.template_id', 't.id')
      .whereRaw('DATE(l.sent_at) BETWEEN ? AND ?', [safeStart, safeEnd])
      .orderBy('l.sent_at', 'desc')
      .limit(EXPORT_LIMIT)
      .select(
        'l.id',
        'l.sent_at',
        's.schedule_name',
        'g.group_name',
        't.template_name',
        'l.status_code',
        'l.message_content',
        'l.response_text'
      )

    const escape = (v: unknown): string => {
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    }
    const header = ['id', 'sent_at', 'schedule_name', 'group_name', 'template_name', 'status_code', 'message', 'response']
    const lines = [header.map(escape).join(',')]
    for (const r of rows as any[]) {
      lines.push([
        r.id,
        r.sent_at,
        r.schedule_name,
        r.group_name,
        r.template_name,
        r.status_code,
        r.message_content,
        r.response_text,
      ].map(escape).join(','))
    }
    const csv = '﻿' + lines.join('\r\n')

    const limited = rows.length >= EXPORT_LIMIT
    await AuditService.record(ctx, {
      action: 'export',
      targetType: 'log',
      description: `Exported ${rows.length} logs ${safeStart} → ${safeEnd}${limited ? ' (capped at 5000)' : ''}`,
    })

    return response
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="notification_logs_${safeStart}_${safeEnd}.csv"`
      )
      .send(csv)
  }

  /**
   * POST /logs/resend — re-send the message_content from a failed log
   * to its original group.
   */
  async resend(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid log ID' })

    const log = await NotificationLog.find(id)
    if (!log) return response.json({ success: false, message: 'ไม่พบประวัติ' })
    if (!log.groupId) return response.json({ success: false, message: 'ประวัตินี้ไม่มี group_id' })
    if (!log.messageContent) return response.json({ success: false, message: 'ประวัตินี้ไม่มีเนื้อหา' })

    const group = await LineGroup.find(log.groupId)
    if (!group || !group.isActive) return response.json({ success: false, message: 'กลุ่ม LINE ไม่พร้อมใช้งาน' })

    const result = await LineApiService.sendMessage(
      { apiUrl: group.apiUrl, clientKey: group.clientKey, secretKey: group.secretKey },
      log.messageContent
    )

    try {
      const newLog = new NotificationLog()
      newLog.scheduleId = log.scheduleId
      newLog.groupId = group.id
      newLog.templateId = log.templateId
      newLog.statusCode = result.code
      newLog.responseText = result.response?.slice(0, 65_535) ?? null
      newLog.messageContent = `[RESEND #${id}] ${log.messageContent}`
      await newLog.save()
    } catch {
      /* best-effort */
    }

    await AuditService.record(ctx, {
      action: 'resend',
      targetType: 'log',
      targetId: id,
      description: `Resent log #${id} → group #${group.id} (HTTP ${result.code})`,
    })

    return response.json({
      success: result.success,
      message: result.success ? 'ส่งซ้ำสำเร็จ' : `ส่งซ้ำไม่สำเร็จ (HTTP ${result.code})`,
    })
  }
}
