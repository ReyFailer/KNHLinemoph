import type { HttpContext } from '@adonisjs/core/http'
import mysql from 'mysql2/promise'
import HisDatabase from '#models/his_database'
import NotificationItem from '#models/notification_item'
import AuditService from '#services/audit_service'
import { hisDatabaseSaveValidator } from '#validators/his_database'

function mask(row: any) {
  const c = { ...row }
  if (typeof c.password === 'string' && c.password.length > 0) {
    c.password = '********'
  }
  return c
}

export default class HisDatabasesController {
  async save(ctx: HttpContext) {
    const { request, response } = ctx
    let payload
    try {
      payload = await request.validateUsing(hisDatabaseSaveValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const idRaw = request.input('id', null)
    const id = idRaw && Number(idRaw) > 0 ? Number(idRaw) : null
    const isUpdate = id !== null

    const row = isUpdate ? (await HisDatabase.find(id!)) ?? new HisDatabase() : new HisDatabase()
    const before = isUpdate && row.$isPersisted ? mask(row.toJSON()) : null

    // Name uniqueness check
    const dup = await HisDatabase.query()
      .where('name', payload.name)
      .if(isUpdate, (q) => q.whereNot('id', id!))
      .first()
    if (dup) return response.json({ success: false, message: 'name นี้มีอยู่แล้ว' })

    row.name = payload.name
    row.host = payload.host
    row.port = payload.port ?? 3306
    row.username = payload.username
    if (payload.password && payload.password.length > 0) {
      row.password = payload.password
    }
    row.databaseName = payload.database_name
    row.description = payload.description ?? null
    row.isActive = !!payload.is_active

    const wantDefault = !!payload.is_default

    try {
      if (wantDefault) {
        // Demote any existing default first (atomic enough for our use)
        await HisDatabase.query().where('is_default', 1).update({ is_default: 0 })
        row.isDefault = true
      } else {
        row.isDefault = false
      }
      await row.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    const desc = `HIS '${row.name}' ${isUpdate ? 'updated' : 'created'}`
    if (isUpdate) await AuditService.recordUpdate(ctx, 'his_database', row.id, before, mask(row.toJSON()), desc)
    else await AuditService.recordCreate(ctx, 'his_database', row.id, mask(row.toJSON()), desc)

    return response.json({ success: true, message: 'บันทึกสำเร็จ', data: { id: row.id } })
  }

  async delete(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const row = await HisDatabase.find(id)
    if (!row) return response.json({ success: false, message: 'ไม่พบ HIS Database' })

    // Block deletion if items reference this name
    const itemCount = await NotificationItem.query().where('his_database', row.name).count('* as c').first()
    const c = Number((itemCount as any)?.$extras?.c ?? (itemCount as any)?.c ?? 0)
    if (c > 0) {
      return response.json({ success: false, message: `ไม่สามารถลบได้ — มี ${c} รายการที่ใช้ HIS นี้อยู่` })
    }

    const snapshot = mask(row.toJSON())
    const name = row.name
    try {
      await row.delete()
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
    await AuditService.recordDelete(ctx, 'his_database', id, snapshot, `Deleted HIS '${name}'`)
    return response.json({ success: true, message: 'ลบสำเร็จ' })
  }

  async test({ request, response }: HttpContext) {
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const row = await HisDatabase.find(id)
    if (!row) return response.json({ success: false, message: 'ไม่พบ HIS Database' })

    let conn: mysql.Connection | null = null
    try {
      conn = await mysql.createConnection({
        host: row.host,
        port: row.port,
        user: row.username,
        password: row.password,
        database: row.databaseName,
        connectTimeout: 5_000,
      })
      const [rows] = await conn.execute('SELECT VERSION() as version, DATABASE() as db')
      const list = rows as any[]
      const [tablesRow] = await conn.execute(
        'SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = ?',
        [row.databaseName]
      )
      const tableCount = (tablesRow as any[])[0]?.c ?? 0

      return response.json({
        success: true,
        message: 'เชื่อมต่อสำเร็จ',
        data: {
          server: `MySQL ${list[0]?.version ?? '?'} · ${list[0]?.db ?? '?'}`,
          tables_count: Number(tableCount),
        },
      })
    } catch (err: any) {
      return response.json({ success: false, message: 'เชื่อมต่อไม่สำเร็จ: ' + (err?.message ?? String(err)) })
    } finally {
      if (conn) try { await conn.end() } catch { /* ignore */ }
    }
  }

  async setDefault(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const row = await HisDatabase.find(id)
    if (!row) return response.json({ success: false, message: 'ไม่พบ HIS Database' })

    try {
      await HisDatabase.query().where('is_default', 1).update({ is_default: 0 })
      row.isDefault = true
      await row.save()
      await AuditService.record(ctx, {
        action: 'update',
        targetType: 'his_database',
        targetId: row.id,
        description: `Set '${row.name}' as default HIS`,
      })
      return response.json({ success: true, message: `ตั้ง '${row.name}' เป็น default แล้ว` })
    } catch (err: any) {
      return response.json({ success: false, message: 'ตั้งค่าไม่สำเร็จ: ' + (err?.message ?? '') })
    }
  }
}
