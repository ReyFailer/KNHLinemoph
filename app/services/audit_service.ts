import type { HttpContext } from '@adonisjs/core/http'
import AuditLog, { type AuditAction, type AuditTargetType } from '#models/audit_log'
import logger from '@adonisjs/core/services/logger'

export interface AuditEntry {
  action: AuditAction
  targetType?: AuditTargetType | null
  targetId?: number | null
  description?: string | null
  beforeData?: unknown
  afterData?: unknown
}

/**
 * AuditService — central helper for writing rows into audit_log.
 *
 * Always best-effort: failures are logged but never bubble up to
 * abort the parent transaction (mirrors PHP behaviour).
 */
export default class AuditService {
  static async record(ctx: HttpContext | null, entry: AuditEntry): Promise<void> {
    try {
      const row = new AuditLog()
      row.userId = ctx?.auth?.user?.id ?? null
      row.username = (ctx?.auth?.user as any)?.username ?? null
      row.action = entry.action
      row.targetType = entry.targetType ?? null
      row.targetId = entry.targetId ?? null
      row.description = entry.description ?? null
      row.beforeData = entry.beforeData ?? null
      row.afterData = entry.afterData ?? null
      row.ipAddress = ctx?.request.ip() ?? null
      row.userAgent = ctx?.request.header('user-agent')?.slice(0, 255) ?? null
      await row.save()
    } catch (err) {
      logger.warn({ err, entry }, 'AuditService.record failed')
    }
  }

  static recordCreate(ctx: HttpContext, targetType: AuditTargetType, targetId: number, after: unknown, description: string) {
    return this.record(ctx, { action: 'create', targetType, targetId, afterData: after, description })
  }

  static recordUpdate(ctx: HttpContext, targetType: AuditTargetType, targetId: number, before: unknown, after: unknown, description: string) {
    return this.record(ctx, { action: 'update', targetType, targetId, beforeData: before, afterData: after, description })
  }

  static recordDelete(ctx: HttpContext, targetType: AuditTargetType, targetId: number, before: unknown, description: string) {
    return this.record(ctx, { action: 'delete', targetType, targetId, beforeData: before, description })
  }
}
