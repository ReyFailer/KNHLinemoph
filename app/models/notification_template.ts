import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class NotificationTemplate extends BaseModel {
  public static table = 'notification_templates'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'template_name' })
  declare templateName: string

  @column({ columnName: 'template_content' })
  declare templateContent: string

  @column({
    prepare: (v: string[] | null) => (v == null ? null : JSON.stringify(v)),
    consume: (v) => {
      if (v == null) return []
      if (Array.isArray(v)) return v
      try {
        return JSON.parse(String(v))
      } catch {
        return []
      }
    },
  })
  declare variables: string[]

  @column({
    columnName: 'is_active',
    consume: (v) => v === 1 || v === true,
    prepare: (v: boolean) => (v ? 1 : 0),
  })
  declare isActive: boolean

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime
}
