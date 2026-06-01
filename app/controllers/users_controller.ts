import type { HttpContext } from '@adonisjs/core/http'
import bcrypt from 'bcryptjs'
import User from '#models/user'
import AuditService from '#services/audit_service'
import { userSaveValidator, userPasswordValidator } from '#validators/user'

export default class UsersController {
  /**
   * GET /users — admin-only management page (router gated).
   */
  async index({ view }: HttpContext) {
    const users = await User.query().orderBy('id', 'asc')
    return view.render('pages/users', {
      title: 'ผู้ใช้งาน',
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.displayName,
        role: u.role,
        is_active: u.isActive,
        last_login_at: u.lastLoginAt?.toFormat('yyyy-MM-dd HH:mm') ?? null,
      })),
    })
  }

  /**
   * GET /users/profile — own profile (any logged-in user).
   */
  async profile({ view }: HttpContext) {
    return view.render('pages/users_profile', { title: 'โปรไฟล์' })
  }

  /**
   * POST /users/get — return single user for edit modal (admin).
   */
  async get({ request, response }: HttpContext) {
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })
    const u = await User.find(id)
    if (!u) return response.json({ success: false, message: 'ไม่พบผู้ใช้' })
    return response.json({
      success: true,
      data: {
        id: u.id,
        username: u.username,
        display_name: u.displayName,
        role: u.role,
        is_active: u.isActive,
      },
    })
  }

  async save(ctx: HttpContext) {
    const { request, response } = ctx
    let payload
    try {
      payload = await request.validateUsing(userSaveValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const idRaw = request.input('id', null)
    const id = idRaw && Number(idRaw) > 0 ? Number(idRaw) : null
    const isUpdate = id !== null

    if (!isUpdate && (!payload.password || payload.password.length === 0)) {
      return response.json({ success: false, message: 'กรุณากรอกรหัสผ่านสำหรับผู้ใช้ใหม่' })
    }

    const user = isUpdate ? (await User.find(id!)) ?? new User() : new User()
    const before = isUpdate && user.$isPersisted ? { ...user.toJSON(), passwordHash: undefined } : null

    // Check username uniqueness (excluding self)
    const dup = await User.query()
      .where('username', payload.username)
      .if(isUpdate, (q) => q.whereNot('id', id!))
      .first()
    if (dup) return response.json({ success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' })

    user.username = payload.username.trim()
    user.displayName = payload.display_name.trim()
    user.role = payload.role
    user.isActive = !!payload.is_active

    if (payload.password && payload.password.length > 0) {
      user.passwordHash = payload.password // beforeSave hook will bcrypt
    }

    try {
      await user.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    const after = { ...user.toJSON(), passwordHash: undefined }
    const desc = `User '${user.username}' ${isUpdate ? 'updated' : 'created'}`
    if (isUpdate) await AuditService.recordUpdate(ctx, 'user', user.id, before, after, desc)
    else await AuditService.recordCreate(ctx, 'user', user.id, after, desc)

    return response.json({
      success: true,
      message: isUpdate ? 'บันทึกผู้ใช้สำเร็จ' : 'เพิ่มผู้ใช้สำเร็จ',
      data: { id: user.id },
    })
  }

  async delete(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const id = Number(request.input('id', 0))
    if (!id) return response.json({ success: false, message: 'Invalid ID' })

    if (id === auth.user?.id) {
      return response.json({ success: false, message: 'ไม่สามารถลบบัญชีตัวเองได้' })
    }

    const user = await User.find(id)
    if (!user) return response.json({ success: false, message: 'ไม่พบผู้ใช้' })

    const snapshot = { ...user.toJSON(), passwordHash: undefined }
    const name = user.username
    try {
      await user.delete()
    } catch (err: any) {
      return response.json({ success: false, message: 'ลบไม่สำเร็จ: ' + (err?.message ?? '') })
    }
    await AuditService.recordDelete(ctx, 'user', id, snapshot, `Deleted user '${name}'`)
    return response.json({ success: true, message: 'ลบผู้ใช้สำเร็จ' })
  }

  /**
   * POST /users/password — change own password.
   */
  async changePassword(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const user = auth.user as User | undefined
    if (!user) return response.json({ success: false, message: 'กรุณาเข้าสู่ระบบใหม่' })

    let payload
    try {
      payload = await request.validateUsing(userPasswordValidator)
    } catch (err: any) {
      return response.json({
        success: false,
        message: err?.messages?.[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
      })
    }

    const ok = await bcrypt.compare(payload.current_password, user.passwordHash)
    if (!ok) return response.json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })

    user.passwordHash = payload.new_password // beforeSave hook will bcrypt
    try {
      await user.save()
    } catch (err: any) {
      return response.json({ success: false, message: 'บันทึกไม่สำเร็จ: ' + (err?.message ?? '') })
    }

    await AuditService.record(ctx, {
      action: 'update',
      targetType: 'user',
      targetId: user.id,
      description: 'Changed own password',
    })
    return response.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' })
  }
}
