import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import User from '#models/user'

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
}

/**
 * Role-hierarchy gate. Usage: middleware.role('operator')
 *
 * Ranks: viewer(1) < operator(2) < admin(3). Mirrors PHP
 * Auth::hasRole($required) numerical compare.
 *
 * Must run AFTER auth middleware so ctx.auth.user is populated.
 */
export default class RoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: string[] = []) {
    const required = options[0] ?? 'viewer'
    const user = ctx.auth.user as User | undefined
    const userRank = ROLE_RANK[user?.role ?? 'guest'] ?? 0
    const requiredRank = ROLE_RANK[required] ?? 99

    if (userRank < requiredRank) {
      if (ctx.request.accepts(['json']) === 'json' || ctx.request.method() !== 'GET') {
        return ctx.response.status(403).json({
          success: false,
          message: 'สิทธิ์ไม่เพียงพอสำหรับการกระทำนี้',
        })
      }
      ctx.session.flash('warning', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้')
      return ctx.response.redirect('/dashboard')
    }
    return next()
  }
}
