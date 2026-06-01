import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import AuditLog from '#models/audit_log'

const TZ = 'Asia/Bangkok'

export default class AuditController {
  async index({ request, view }: HttpContext) {
    const today = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')
    const weekAgo = DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd')

    const start = (request.input('start_date', weekAgo) as string) || weekAgo
    const end = (request.input('end_date', today) as string) || today
    const action = (request.input('action_filter', '') as string) || ''
    const target = (request.input('target_filter', '') as string) || ''
    const limitRaw = Number(request.input('limit', 200))
    const limit = Math.max(20, Math.min(2000, Number.isFinite(limitRaw) ? limitRaw : 200))

    const q = AuditLog.query()
      .whereRaw('DATE(created_at) BETWEEN ? AND ?', [start, end])
      .orderBy('id', 'desc')
      .limit(limit)

    if (/^[a-z_]+$/.test(action)) q.where('action', action)
    if (/^[a-z_]+$/.test(target)) q.where('target_type', target)

    const logs = await q

    return view.render('pages/audit', {
      title: 'ประวัติการแก้ไข',
      logs: logs.map((l) => ({
        id: l.id,
        created_at: l.createdAt?.toFormat('yyyy-MM-dd HH:mm:ss') ?? '',
        username: l.username,
        action: l.action,
        target_type: l.targetType,
        target_id: l.targetId,
        description: l.description,
        ip_address: l.ipAddress,
      })),
      filters: { start, end, action, target, limit },
    })
  }
}
