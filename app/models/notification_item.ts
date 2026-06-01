import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class NotificationItem extends BaseModel {
  public static table = 'notification_items'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'item_name' })
  declare itemName: string

  @column({ columnName: 'item_key' })
  declare itemKey: string

  @column({ columnName: 'sql_query' })
  declare sqlQuery: string

  @column({ columnName: 'his_database' })
  declare hisDatabase: string

  @column()
  declare description: string | null

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
