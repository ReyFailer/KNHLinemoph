import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

const jsonArrayCol = {
  prepare: (v: unknown[] | null | undefined) => (v == null ? null : JSON.stringify(v)),
  consume: (v: unknown) => {
    if (v == null) return []
    if (Array.isArray(v)) return v
    try {
      return JSON.parse(String(v))
    } catch {
      return []
    }
  },
}

export default class NotificationSchedule extends BaseModel {
  public static table = 'notification_schedules'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'schedule_name' })
  declare scheduleName: string

  @column({ columnName: 'template_id' })
  declare templateId: number | null

  @column({ columnName: 'group_ids', ...jsonArrayCol })
  declare groupIds: number[]

  @column({ columnName: 'item_ids', ...jsonArrayCol })
  declare itemIds: number[]

  @column({ columnName: 'send_time' })
  declare sendTime: string

  @column({
    columnName: 'repeat_enabled',
    consume: (v) => v === 1 || v === true,
    prepare: (v: boolean) => (v ? 1 : 0),
  })
  declare repeatEnabled: boolean

  @column({ columnName: 'repeat_interval' })
  declare repeatInterval: number | null

  @column({ columnName: 'repeat_unit' })
  declare repeatUnit: 'minutes' | 'hours' | null

  @column({ columnName: 'repeat_end_time' })
  declare repeatEndTime: string | null

  @column.dateTime({ columnName: 'next_send_time' })
  declare nextSendTime: DateTime | null

  @column({ columnName: 'days_of_week' })
  declare daysOfWeek: string

  @column({ columnName: 'schedule_mode' })
  declare scheduleMode: 'weekly' | 'specific'

  @column({ columnName: 'specific_dates', ...jsonArrayCol })
  declare specificDates: string[]

  @column({
    columnName: 'is_active',
    consume: (v) => v === 1 || v === true,
    prepare: (v: boolean) => (v ? 1 : 0),
  })
  declare isActive: boolean

  @column.date({ columnName: 'last_sent_date' })
  declare lastSentDate: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime
}
