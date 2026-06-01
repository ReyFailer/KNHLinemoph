import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import NotificationSchedule from '#models/notification_schedule'
import NotificationTemplate from '#models/notification_template'
import LineGroup from '#models/line_group'
import ScheduleCalculator from '#services/schedule_calculator'
import NotificationService from '#services/notification_service'
import AuditService from '#services/audit_service'
import { scheduleSaveValidator } from '#validators/schedule'

export default class SchedulesController {
  /**
   * GET /schedules — render list page with all schedules + their
   * related entities (loaded server-side for the modal selectors).
   */
  async index({ view }: HttpContext) {
    const [schedules, templates, groups] = await Promise.all([
      NotificationSchedule.query().orderBy('send_time', 'asc'),
      NotificationTemplate.all(),
      LineGroup.all(),
    ])

    const templateMap = new Map(templates.map((t) => [t.id, t]))
    const todayDow = ScheduleCalculator.todayDow()
    const today = DateTime.now().setZone(ScheduleCalculator.TZ).toFormat('yyyy-MM-dd')

    const rows = schedules.map((s) => ({
      id: s.id,
      name: s.scheduleName,
      template_name: s.templateId ? templateMap.get(s.templateId)?.templateName ?? null : null,
      send_time: (s.sendTime ?? '').slice(0, 5),
      mode: s.scheduleMode ?? 'weekly',
      days: String(s.daysOfWeek ?? '')
        .split(',')
        .map((n) => parseInt(n.trim(), 10))
        .filter(Boolean),
      specific_dates: s.specificDates ?? [],
      repeat_enabled: !!s.repeatEnabled,
      repeat_interval: s.repeatInterval ?? null,
      repeat_unit: s.repeatUnit,
      is_active: !!s.isActive,
      last_sent_date: s.lastSentDate?.toFormat('yyyy-MM-dd') ?? null,
    }))

    return view.render('pages/schedules', {
      title: 'ตารางเวลา',
      schedules: rows,
      templates: templates.map((t) => ({ id: t.id, name: t.templateName, vars: t.variables ?? [] })),
      groups: groups.map((g) => ({ id: g.id, name: g.groupName })),
      todayDow,
      today,
    })
  }

  /**
   * POST /schedules/get — return display payload for the edit modal.
   */
  async get({ request, response }: HttpContext) {
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid schedule ID' })

    const schedule = await NotificationSchedule.find(id)
    if (!schedule) return response.json({ success: false, message: 'ไม่พบตารางเวลา' })

    const [template, groups] = await Promise.all([
      schedule.templateId ? NotificationTemplate.find(schedule.templateId) : null,
      LineGroup.query().whereIn('id', (schedule.groupIds ?? []).map(Number)),
    ])

    return response.json({
      success: true,
      data: {
        id: schedule.id,
        schedule_name: schedule.scheduleName,
        template_id: schedule.templateId,
        template_name: template?.templateName ?? null,
        send_time: schedule.sendTime,
        schedule_mode: schedule.scheduleMode ?? 'weekly',
        days_of_week: schedule.daysOfWeek,
        days_of_week_array: String(schedule.daysOfWeek ?? '')
          .split(',')
          .map((n) => parseInt(n.trim(), 10))
          .filter(Boolean),
        specific_dates: schedule.specificDates ?? [],
        is_active: !!schedule.isActive,
        repeat_enabled: !!schedule.repeatEnabled,
        repeat_interval: schedule.repeatInterval ?? 30,
        repeat_unit: schedule.repeatUnit ?? 'minutes',
        repeat_end_time: schedule.repeatEndTime,
        next_send_time: schedule.nextSendTime?.toISO() ?? null,
        last_sent_date: schedule.lastSentDate?.toFormat('yyyy-MM-dd') ?? null,
        group_ids: (schedule.groupIds ?? []).map(Number),
        group_ids_array: (schedule.groupIds ?? []).map(Number),
        group_names: groups.map((g) => g.groupName),
      },
    })
  }

  /**
   * POST /schedules/save — create or update.
   */
  async save(ctx: HttpContext) {
    const { request, response } = ctx

    let payload: any
    try {
      payload = await request.validateUsing(scheduleSaveValidator)
    } catch (err: any) {
      const msg = err?.messages?.map((m: any) => m.message).join(', ') ?? 'ข้อมูลไม่ถูกต้อง'
      return response.json({ success: false, message: msg })
    }

    const mode = payload.schedule_mode === 'specific' ? 'specific' : 'weekly'
    const daysOfWeek: number[] = Array.isArray(payload.days_of_week) ? payload.days_of_week : []
    const specificDates: string[] = Array.isArray(payload.specific_dates) ? payload.specific_dates : []

    if (mode === 'weekly' && daysOfWeek.length === 0) {
      return response.json({ success: false, message: 'กรุณาเลือกวันในสัปดาห์' })
    }
    if (mode === 'specific' && specificDates.length === 0) {
      return response.json({ success: false, message: 'กรุณาเลือกวันที่อย่างน้อย 1 วัน' })
    }

    const idRaw = request.input('id', null)
    const id = idRaw && !Number.isNaN(Number(idRaw)) && Number(idRaw) > 0 ? Number(idRaw) : null
    const isUpdate = id !== null

    const schedule = isUpdate ? (await NotificationSchedule.find(id!)) ?? new NotificationSchedule() : new NotificationSchedule()
    const before = isUpdate && schedule.$isPersisted ? schedule.toJSON() : null

    schedule.scheduleName = payload.schedule_name.trim()
    schedule.templateId = payload.template_id
    schedule.groupIds = payload.group_ids
    schedule.sendTime = ScheduleCalculator.normalizeTime(payload.send_time)
    schedule.scheduleMode = mode
    schedule.daysOfWeek = mode === 'weekly' ? daysOfWeek.join(',') : schedule.daysOfWeek || '2,3,4,5,6'
    schedule.specificDates = mode === 'specific' ? specificDates : []
    schedule.isActive = !!payload.is_active

    schedule.repeatEnabled = !!payload.repeat_enabled
    if (schedule.repeatEnabled) {
      schedule.repeatInterval = payload.repeat_interval ?? 30
      schedule.repeatUnit = payload.repeat_unit ?? 'minutes'
      schedule.repeatEndTime = payload.repeat_end_time
        ? ScheduleCalculator.normalizeTime(payload.repeat_end_time)
        : '17:00:00'
      const next = ScheduleCalculator.calculateNextSendTime(schedule)
      schedule.nextSendTime = next
    } else {
      schedule.repeatInterval = null
      schedule.repeatUnit = null
      schedule.repeatEndTime = null
      schedule.nextSendTime = null
    }

    try {
      await schedule.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    const desc = `Schedule '${schedule.scheduleName}' ${isUpdate ? 'updated' : 'created'}`
    if (isUpdate) {
      await AuditService.recordUpdate(ctx, 'schedule', schedule.id, before, schedule.toJSON(), desc)
    } else {
      await AuditService.recordCreate(ctx, 'schedule', schedule.id, schedule.toJSON(), desc)
    }

    return response.json({
      success: true,
      message: 'บันทึกตารางเวลาสำเร็จ',
      data: { id: schedule.id },
    })
  }

  /**
   * POST /schedules/delete
   */
  async delete(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid schedule ID' })

    const schedule = await NotificationSchedule.find(id)
    if (!schedule) return response.json({ success: false, message: 'ไม่พบตารางเวลา' })

    const snapshot = schedule.toJSON()
    const name = schedule.scheduleName
    try {
      await schedule.delete()
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    await AuditService.recordDelete(ctx, 'schedule', id, snapshot, `Deleted '${name}'`)
    return response.json({ success: true, message: 'ลบตารางเวลาสำเร็จ' })
  }

  /**
   * POST /schedules/clone — duplicate as inactive copy.
   */
  async clone(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid schedule ID' })

    const src = await NotificationSchedule.find(id)
    if (!src) return response.json({ success: false, message: 'ไม่พบตารางเวลา' })

    const copy = new NotificationSchedule()
    const skip = new Set(['id', 'lastSentDate', 'nextSendTime', 'createdAt', 'updatedAt'])
    const srcData = src.toJSON() as Record<string, unknown>
    for (const [k, v] of Object.entries(srcData)) {
      if (skip.has(k)) continue
      ;(copy as any)[k] = v
    }
    copy.scheduleName = `${src.scheduleName} (สำเนา)`
    copy.isActive = false

    try {
      await copy.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'ทำสำเนาไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    await AuditService.recordCreate(ctx, 'schedule', copy.id, copy.toJSON(), `Cloned from #${id}`)
    return response.json({ success: true, message: 'สร้างสำเนาแล้ว (ปิดใช้งานไว้)', data: { id: copy.id } })
  }

  /**
   * POST /schedules/test — force-send a schedule for verification.
   */
  async test(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('schedule_id', 0))
    if (!id) return response.json({ success: false, message: 'กรุณาระบุ schedule_id' })

    try {
      const result = await NotificationService.sendNotification(id, true)
      await AuditService.record(ctx, {
        action: 'test_send',
        targetType: 'schedule',
        targetId: id,
        description: `Test send to ${result.results.length} group(s)`,
      })
      return response.json({
        success: result.success,
        message: result.success ? 'ทดสอบส่งสำเร็จ' : 'ทดสอบส่งไม่สำเร็จ',
        data: {
          message_preview: result.message.slice(0, 500),
          groups_sent: result.results.length,
        },
      })
    } catch (err: any) {
      return response.json({ success: false, message: 'ทดสอบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
  }
}
