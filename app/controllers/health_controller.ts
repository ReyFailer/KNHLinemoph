import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export default class HealthController {
  async show({ response }: HttpContext) {
    const checks: Record<string, unknown> = {
      app: true,
      time: DateTime.now().toISO(),
    }

    try {
      await db.connection('mysql').rawQuery('SELECT 1')
      checks.app_db = true
    } catch (err: any) {
      checks.app_db = false
      checks.app_db_error = err?.message ?? String(err)
    }

    const ok = checks.app_db === true
    return response.status(ok ? 200 : 503).json({ ok, checks })
  }
}
