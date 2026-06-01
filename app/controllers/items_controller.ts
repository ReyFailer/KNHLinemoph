import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import NotificationItem from '#models/notification_item'
import HisDatabase from '#models/his_database'
import HisManager from '#services/his_manager'
import AuditService from '#services/audit_service'
import { itemSaveValidator } from '#validators/item'

export default class ItemsController {
  async index({ view }: HttpContext) {
    const [items, hisDbs] = await Promise.all([
      NotificationItem.query().orderBy('id', 'desc'),
      HisDatabase.query().where('is_active', 1).orderBy('name'),
    ])
    return view.render('pages/items', {
      title: 'รายการข้อมูล',
      items: items.map((i) => ({
        id: i.id,
        name: i.itemName,
        key: i.itemKey,
        sql: i.sqlQuery,
        his: i.hisDatabase,
        description: i.description,
        is_active: !!i.isActive,
      })),
      hisDbs: hisDbs.map((d) => ({ name: d.name, label: `${d.name} — ${d.databaseName}` })),
    })
  }

  async save(ctx: HttpContext) {
    const { request, response } = ctx
    let payload
    try {
      payload = await request.validateUsing(itemSaveValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const idRaw = request.input('id', null)
    const id = idRaw && Number(idRaw) > 0 ? Number(idRaw) : null
    const isUpdate = id !== null

    const item = isUpdate ? (await NotificationItem.find(id!)) ?? new NotificationItem() : new NotificationItem()
    const before = isUpdate && item.$isPersisted ? item.toJSON() : null

    item.itemName = payload.item_name.trim()
    item.itemKey = payload.item_key.trim()
    item.sqlQuery = payload.sql_query
    item.hisDatabase = (payload.his_database ?? 'hos').trim() || 'hos'
    item.description = payload.description?.trim() ?? null
    item.isActive = !!payload.is_active

    try {
      await item.save()
    } catch (err: any) {
      const message = /Duplicate entry/i.test(err?.message ?? '')
        ? 'item_key ซ้ำกับรายการที่มีอยู่'
        : 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '')
      return response.json({ success: false, message })
    }

    const desc = `Item '${item.itemName}' ${isUpdate ? 'updated' : 'created'}`
    if (isUpdate) await AuditService.recordUpdate(ctx, 'item', item.id, before, item.toJSON(), desc)
    else await AuditService.recordCreate(ctx, 'item', item.id, item.toJSON(), desc)

    return response.json({ success: true, message: 'บันทึกรายการสำเร็จ', data: { id: item.id } })
  }

  async delete(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const item = await NotificationItem.find(id)
    if (!item) return response.json({ success: false, message: 'ไม่พบรายการ' })

    const snapshot = item.toJSON()
    const name = item.itemName
    try {
      await item.delete()
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
    await AuditService.recordDelete(ctx, 'item', id, snapshot, `Deleted '${name}'`)
    return response.json({ success: true, message: 'ลบสำเร็จ' })
  }

  /**
   * POST /items/test — execute the item's SQL against HIS with {date}
   * replaced by today.
   */
  async test(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const item = await NotificationItem.find(id)
    if (!item) return response.json({ success: false, message: 'ไม่พบรายการ' })

    const today = DateTime.now().setZone('Asia/Bangkok').toFormat('yyyy-MM-dd')
    try {
      const sql = item.sqlQuery.replace(/\{date\}/g, today)
      const row = await HisManager.queryFirst(item.hisDatabase || 'hos', sql, [])
      await AuditService.record(ctx, {
        action: 'test_send',
        targetType: 'item',
        targetId: id,
        description: `Test query item '${item.itemName}'`,
      })
      return response.json({ success: true, message: 'ทดสอบสำเร็จ', data: { result: row } })
    } catch (err: any) {
      return response.json({ success: false, message: 'ทดสอบไม่สำเร็จ: ' + (err?.message ?? String(err)) })
    }
  }
}
