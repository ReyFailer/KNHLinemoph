import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

const jsonObjectCol = {
  prepare: (v: unknown) => (v == null ? null : JSON.stringify(v)),
  consume: (v: unknown) => {
    if (v == null) return null
    if (typeof v === 'object') return v
    try {
      return JSON.parse(String(v))
    } catch {
      return null
    }
  },
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'export'
  | 'resend'
  | 'cron_run'
  | 'test_send'

export type AuditTargetType =
  | 'schedule'
  | 'template'
  | 'item'
  | 'group'
  | 'user'
  | 'his_database'
  | 'settings'
  | 'log'
  | 'cron'

export default class AuditLog extends BaseModel {
  public static table = 'audit_log'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'user_id' })
  declare userId: number | null

  @column()
  declare username: string | null

  @column()
  declare action: AuditAction

  @column({ columnName: 'target_type' })
  declare targetType: AuditTargetType | null

  @column({ columnName: 'target_id' })
  declare targetId: number | null

  @column()
  declare description: string | null

  @column({ columnName: 'before_data', ...jsonObjectCol })
  declare beforeData: unknown

  @column({ columnName: 'after_data', ...jsonObjectCol })
  declare afterData: unknown

  @column({ columnName: 'ip_address' })
  declare ipAddress: string | null

  @column({ columnName: 'user_agent' })
  declare userAgent: string | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime
}
