import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import LineGroup from '#models/line_group'
import NotificationService from '#services/notification_service'
import AuditService from '#services/audit_service'
import { groupSaveValidator } from '#validators/group'

const DEFAULT_MOPH_API_URL = env.get('DEFAULT_MOPH_API_URL') as string

function maskSecrets(row: any) {
  const cloned = { ...row }
  for (const f of ['clientKey', 'secretKey', 'client_key', 'secret_key', 'passwordHash', 'password_hash']) {
    if (typeof cloned[f] === 'string' && cloned[f].length > 8) {
      cloned[f] = cloned[f].slice(0, 4) + '****'
    }
  }
  return cloned
}

export default class GroupsController {
  /**
   * GET /groups — admin-only management page.
   */
  async index({ view }: HttpContext) {
    const groups = await LineGroup.query().orderBy('id', 'desc')
    return view.render('pages/groups', {
      title: 'กลุ่ม LINE',
      defaultApiUrl: DEFAULT_MOPH_API_URL,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.groupName,
        client_key_masked: g.clientKey.slice(0, 12) + (g.clientKey.length > 12 ? '…' : ''),
        api_url: g.apiUrl,
        is_active: !!g.isActive,
      })),
    })
  }

  /**
   * POST /groups/list — minimal listing for the test-send modal
   * (any operator+ can read). Returns only id+name.
   */
  async list({ response }: HttpContext) {
    const groups = await LineGroup.query().where('is_active', 1).orderBy('group_name', 'asc')
    return response.json({
      success: true,
      data: { groups: groups.map((g) => ({ id: g.id, group_name: g.groupName })) },
    })
  }

  /**
   * POST /groups/get — return one group (for edit modal). Keys
   * are not masked since admin needs to see/edit them.
   */
  async get({ request, response }: HttpContext) {
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })
    const group = await LineGroup.find(id)
    if (!group) return response.json({ success: false, message: 'ไม่พบกลุ่ม' })
    return response.json({
      success: true,
      data: {
        id: group.id,
        group_name: group.groupName,
        client_key: group.clientKey,
        secret_key: group.secretKey,
        api_url: group.apiUrl,
        is_active: !!group.isActive,
      },
    })
  }

  async save(ctx: HttpContext) {
    const { request, response } = ctx
    let payload
    try {
      payload = await request.validateUsing(groupSaveValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const idRaw = request.input('id', null)
    const id = idRaw && Number(idRaw) > 0 ? Number(idRaw) : null
    const isUpdate = id !== null

    const group = isUpdate ? (await LineGroup.find(id!)) ?? new LineGroup() : new LineGroup()
    const before = isUpdate && group.$isPersisted ? maskSecrets(group.toJSON()) : null

    group.groupName = payload.group_name.trim()
    group.clientKey = payload.client_key.trim()
    group.secretKey = payload.secret_key.trim()
    group.apiUrl = payload.api_url?.trim() || DEFAULT_MOPH_API_URL
    group.isActive = !!payload.is_active

    try {
      await group.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    const after = maskSecrets(group.toJSON())
    const desc = `Group '${group.groupName}' ${isUpdate ? 'updated' : 'created'}`
    if (isUpdate) await AuditService.recordUpdate(ctx, 'group', group.id, before, after, desc)
    else await AuditService.recordCreate(ctx, 'group', group.id, after, desc)

    return response.json({ success: true, message: 'บันทึกกลุ่มสำเร็จ', data: { id: group.id } })
  }

  async delete(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    const group = await LineGroup.find(id)
    if (!group) return response.json({ success: false, message: 'ไม่พบกลุ่ม' })

    const snapshot = maskSecrets(group.toJSON())
    const name = group.groupName
    try {
      await group.delete()
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
    await AuditService.recordDelete(ctx, 'group', id, snapshot, `Deleted '${name}'`)
    return response.json({ success: true, message: 'ลบสำเร็จ' })
  }

  /**
   * POST /groups/test — send a default test message to the group.
   */
  async test(ctx: HttpContext) {
    const { request, response } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    try {
      const result = await NotificationService.sendTest(id)
      await AuditService.record(ctx, {
        action: 'test_send',
        targetType: 'group',
        targetId: id,
        description: `Test send to group #${id}`,
      })
      return response.json({
        success: result.success,
        message: result.success ? 'ส่งทดสอบสำเร็จ' : `ส่งไม่สำเร็จ (HTTP ${result.line.code})`,
        data: { line_code: result.line.code },
      })
    } catch (err: any) {
      return response.json({ success: false, message: 'ส่งทดสอบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
  }

  /**
   * POST /test/send — sender used by the topbar quick-send modal.
   * Accepts group_id + message and sends via NotificationService.
   */
  async sendTest(ctx: HttpContext) {
    const { request, response } = ctx
    const groupId = Number(request.input('group_id', 0))
    const message = String(request.input('message', '')).trim()
    if (!groupId) return response.json({ success: false, message: 'กรุณาเลือกกลุ่ม' })
    if (!message) return response.json({ success: false, message: 'กรุณากรอกข้อความ' })

    try {
      const result = await NotificationService.sendTest(groupId, message)
      return response.json({
        success: result.success,
        message: result.success ? 'ส่งทดสอบสำเร็จ' : `ส่งไม่สำเร็จ (HTTP ${result.line.code})`,
      })
    } catch (err: any) {
      return response.json({ success: false, message: 'ส่งทดสอบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
  }
}
