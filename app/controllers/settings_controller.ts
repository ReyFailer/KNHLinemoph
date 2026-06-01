import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import HisDatabase from '#models/his_database'
import SettingsService from '#services/settings_service'
import AuditService from '#services/audit_service'
import { settingsSaveValidator } from '#validators/settings'

export default class SettingsController {
  async index({ view, auth }: HttpContext) {
    const isAdmin = (auth.user as any)?.role === 'admin'

    const [siteTitle, orgName, siteFooter, defaultApiUrl, hisDbs] = await Promise.all([
      SettingsService.get('site_title', 'LINE Notify'),
      SettingsService.get('org_name', 'โรงพยาบาลแก้งสนามนาง'),
      SettingsService.get('site_footer', '🏥 จาก: โรงพยาบาลแก้งสนามนาง'),
      SettingsService.get('default_api_url', env.get('DEFAULT_MOPH_API_URL') as string),
      HisDatabase.query().orderBy('id', 'asc'),
    ])

    let appDbOk = false
    try {
      await db.connection('mysql').rawQuery('SELECT 1')
      appDbOk = true
    } catch {
      /* down */
    }

    const cronToken = env.get('CRON_TOKEN') as string
    const tokenWeak = !cronToken || /change-me/i.test(cronToken)

    return view.render('pages/settings', {
      title: 'ตั้งค่า',
      isAdmin,
      settings: {
        site_title: siteTitle,
        org_name: orgName,
        site_footer: siteFooter,
        default_api_url: defaultApiUrl,
      },
      appDb: {
        ok: appDbOk,
        host: env.get('DB_HOST') as string,
        database: env.get('DB_DATABASE') as string,
        user: env.get('DB_USER') as string,
      },
      hisDbs: hisDbs.map((h) => ({
        id: h.id,
        name: h.name,
        host: h.host,
        port: h.port,
        username: h.username,
        database_name: h.databaseName,
        description: h.description,
        is_active: !!h.isActive,
        is_default: !!h.isDefault,
      })),
      security: {
        debug: env.get('NODE_ENV') !== 'production',
        envExists: true,
        cronTokenWeak: tokenWeak,
      },
      meta: {
        version: '2.2.2',
        node_env: env.get('NODE_ENV'),
        timezone: 'Asia/Bangkok',
        node_version: process.version,
        now: DateTime.now().setZone('Asia/Bangkok').toFormat('yyyy-MM-dd HH:mm:ss'),
      },
    })
  }

  async save(ctx: HttpContext) {
    const { request, response, auth } = ctx
    let payload
    try {
      payload = await request.validateUsing(settingsSaveValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const userId = auth.user?.id ?? null
    const changed: string[] = []
    for (const [key, value] of Object.entries(payload)) {
      if (value == null) continue
      const current = await SettingsService.get(key)
      if (current !== String(value)) {
        await SettingsService.set(key, String(value), userId)
        changed.push(key)
      }
    }

    if (changed.length > 0) {
      await AuditService.record(ctx, {
        action: 'update',
        targetType: 'settings',
        description: `Updated settings: ${changed.join(', ')}`,
        afterData: payload,
      })
    }

    return response.json({
      success: true,
      message: changed.length === 0 ? 'ไม่มีการเปลี่ยนแปลง' : `บันทึก ${changed.length} รายการแล้ว`,
      data: { changed },
    })
  }
}
