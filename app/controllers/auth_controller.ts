import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { DateTime } from 'luxon'
import User from '#models/user'

const loginValidator = vine.compile(
  vine.object({
    username: vine.string().trim().minLength(1),
    password: vine.string().minLength(1),
  })
)

// Simple in-memory rate limiter: 5 failed attempts per 5 minutes per IP.
// Resets on server restart; sufficient for single-process deployment.
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
interface RateEntry { count: number; resetAt: number }
const loginAttempts = new Map<string, RateEntry>()

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now()
  let entry = loginAttempts.get(ip)
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    loginAttempts.set(ip, entry)
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip)
}

export default class AuthController {
  async showLogin({ view, request }: HttpContext) {
    return view.render('pages/login', {
      username: request.input('username', ''),
    })
  }

  async login({ request, auth, response, view, session }: HttpContext) {
    const ip = request.ip()

    if (!checkLoginRateLimit(ip)) {
      return view.render('pages/login', {
        error: 'พยายามเข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอ 5 นาทีแล้วลองใหม่',
        username: request.input('username', ''),
      })
    }

    let payload
    try {
      payload = await request.validateUsing(loginValidator)
    } catch {
      return view.render('pages/login', {
        error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
        username: request.input('username', ''),
      })
    }

    let user: User
    try {
      user = await User.verifyCredentials(payload.username, payload.password)
    } catch {
      return view.render('pages/login', {
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
        username: payload.username,
      })
    }

    if (!user.isActive) {
      return view.render('pages/login', {
        error: 'บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ',
        username: payload.username,
      })
    }

    resetLoginRateLimit(ip)
    await auth.use('web').login(user)
    session.regenerate()

    user.lastLoginAt = DateTime.now()
    try {
      await user.save()
    } catch {
      /* best-effort */
    }

    return response.redirect('/dashboard')
  }

  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect('/login')
  }
}
