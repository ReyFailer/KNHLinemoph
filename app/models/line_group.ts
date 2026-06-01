import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class LineGroup extends BaseModel {
  public static table = 'line_groups'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'group_name' })
  declare groupName: string

  @column({ columnName: 'client_key' })
  declare clientKey: string

  @column({ columnName: 'secret_key' })
  declare secretKey: string

  @column({ columnName: 'api_url' })
  declare apiUrl: string

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
