import type { HttpContext } from '@adonisjs/core/http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import CronService from '#services/cron_service'
import AuditService from '#services/audit_service'

const TZ = 'Asia/Bangkok'
const LOG_DIR = path.join(process.cwd(), 'logs')

export default class CronController {
  async index({ view }: HttpContext) {
    const today = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')
    return view.render('pages/cron', {
      title: 'การทำงาน Cron',
      cronToken: env.get('CRON_TOKEN'),
      today,
      cliCommand: 'node ace cron:run',
    })
  }

  /**
   * POST /cron/run — execute the pipeline (admin/operator from UI,
   * or anyone with the CRON_TOKEN for external triggers).
   */
  async run(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const token = String(request.input('token', ''))

    const validToken = !!token && token === env.get('CRON_TOKEN')
    const userOk = !!auth.user && ['admin', 'operator'].includes((auth.user as any).role)
    if (!validToken && !userOk) {
      return response.status(403).json({ success: false, message: 'Unauthorized' })
    }

    const result = await CronService.runOnce()

    await AuditService.record(ctx, {
      action: 'cron_run',
      targetType: 'cron',
      description: result.skipped
        ? `Cron run skipped: ${result.reason}`
        : `Cron run finished in ${result.durationMs}ms — ${result.processed} sent`,
    })

    if (result.skipped) {
      return response.json({ success: true, message: result.reason, data: { skipped: true } })
    }
    const output = result.entries.map((e) => `[${e.time}] [${e.level}] ${e.message}`).join('\n')
    return response.json({
      success: true,
      message: `รัน cron สำเร็จ (${(result.durationMs / 1000).toFixed(2)}s)`,
      data: { output, processed: result.processed },
    })
  }

  /**
   * POST /cron/status — quick stats for the cron page widgets.
   */
  async status({ response }: HttpContext) {
    const today = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')
    const todayLogStat = await db
      .from('notification_logs')
      .whereRaw('DATE(sent_at) = ?', [today])
      .select(db.raw('COUNT(*) as total'))
      .select(db.raw('SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success'))
      .select(db.raw('SUM(CASE WHEN status_code != 200 THEN 1 ELSE 0 END) as failed'))
      .first()
    const active = await db
      .from('notification_schedules')
      .where('is_active', 1)
      .count('* as c')
      .first()

    let lastTick: string | null = null
    let lastTickAgeSec: number | null = null
    try {
      const file = path.join(LOG_DIR, `cron_${today}.log`)
      const stat = await fs.stat(file)
      lastTick = DateTime.fromJSDate(stat.mtime).setZone(TZ).toFormat('yyyy-MM-dd HH:mm:ss')
      lastTickAgeSec = Math.round((Date.now() - stat.mtimeMs) / 1000)
    } catch {
      /* no log yet */
    }

    return response.json({
      success: true,
      data: {
        last_tick: lastTick,
        last_tick_age_sec: lastTickAgeSec,
        sent_today: Number((todayLogStat as any)?.success ?? 0),
        failed_today: Number((todayLogStat as any)?.failed ?? 0),
        active_schedules: Number((active as any)?.c ?? 0),
      },
    })
  }

  /**
   * POST /cron/log — return tail of today's (or a given day's) cron log.
   */
  async log({ request, response }: HttpContext) {
    const date = String(request.input('date', DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')))
    const type = String(request.input('type', 'info'))
    const lines = Math.max(20, Math.min(2000, Number(request.input('lines', 200)) || 200))

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return response.json({ success: false, message: 'Invalid date' })
    }
    const file = path.join(LOG_DIR, type === 'error' ? `cron_error_${date}.log` : `cron_${date}.log`)

    try {
      const content = await fs.readFile(file, 'utf8')
      const all = content.split(/\r?\n/).filter(Boolean)
      const tail = all.slice(-lines)
      const stat = await fs.stat(file)
      return response.json({
        success: true,
        data: {
          lines: tail,
          total: all.length,
          mtime: DateTime.fromJSDate(stat.mtime).setZone(TZ).toFormat('yyyy-MM-dd HH:mm:ss'),
          size: stat.size,
          exists: true,
          date,
        },
      })
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return response.json({
          success: true,
          data: { lines: [], total: 0, mtime: null, size: 0, exists: false, date },
        })
      }
      return response.json({ success: false, message: 'อ่าน log ไม่ได้: ' + (err?.message ?? '') })
    }
  }
}
