import type { HttpContext } from '@adonisjs/core/http'
import NotificationTemplate from '#models/notification_template'
import NotificationItem from '#models/notification_item'
import AuditService from '#services/audit_service'
import { templateSaveValidator } from '#validators/template'

export default class TemplatesController {
  async index({ view }: HttpContext) {
    const [templates, items] = await Promise.all([
      NotificationTemplate.query().orderBy('id', 'desc'),
      NotificationItem.query().where('is_active', 1),
    ])
    return view.render('pages/templates', {
      title: 'เทมเพลตข้อความ',
      templates: templates.map((t) => ({
        id: t.id,
        name: t.templateName,
        content: t.templateContent,
        variables: t.variables ?? [],
        is_active: !!t.isActive,
      })),
      knownVars: ['date', 'time', 'date_th', 'weekday', 'org_name', 'site_title', 'site_footer', ...items.map((i) => i.itemKey)],
      itemVars: items.map((i) => ({ key: i.itemKey, name: i.itemName })),
    })
  }

  async save(ctx: HttpContext) {
    const { request, response } = ctx
    let payload
    try {
      payload = await request.validateUsing(templateSaveValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const content = payload.template_content
    const matches = [...content.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
    const vars = [...new Set(matches.map((m) => m[1]))]

    const items = await NotificationItem.query().select('item_key').where('is_active', 1)
    const known = new Set(['date', 'time', 'date_th', 'weekday', 'org_name', 'site_title', 'site_footer', ...items.map((i) => i.itemKey)])
    const unknown = vars.filter((v) => !known.has(v))

    const idRaw = request.input('id', null)
    const id = idRaw && Number(idRaw) > 0 ? Number(idRaw) : null
    const isUpdate = id !== null

    const tpl = isUpdate ? (await NotificationTemplate.find(id!)) ?? new NotificationTemplate() : new NotificationTemplate()
    const before = isUpdate && tpl.$isPersisted ? tpl.toJSON() : null

    tpl.templateName = payload.template_name.trim()
    tpl.templateContent = content
    tpl.variables = vars
    tpl.isActive = !!payload.is_active

    try {
      await tpl.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    const desc = `Template '${tpl.templateName}' ${isUpdate ? 'updated' : 'created'}`
    if (isUpdate) await AuditService.recordUpdate(ctx, 'template', tpl.id, before, tpl.toJSON(), desc)
    else await AuditService.recordCreate(ctx, 'template', tpl.id, tpl.toJSON(), desc)

    let message = 'บันทึกเทมเพลตสำเร็จ'
    if (unknown.length > 0) {
      message += ` — ⚠ มีตัวแปรที่ไม่ตรงกับรายการข้อมูล: {${unknown.join('}, {')}}`
    }
    return response.json({ success: true, message, data: { id: tpl.id, unknown_vars: unknown } })
  }

  async delete(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const tpl = await NotificationTemplate.find(id)
    if (!tpl) return response.json({ success: false, message: 'ไม่พบเทมเพลต' })

    const snapshot = tpl.toJSON()
    const name = tpl.templateName
    try {
      await tpl.delete()
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
    await AuditService.recordDelete(ctx, 'template', id, snapshot, `Deleted '${name}'`)
    return response.json({ success: true, message: 'ลบสำเร็จ' })
  }
}
