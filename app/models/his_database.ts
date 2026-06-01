import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class HisDatabase extends BaseModel {
  public static table = 'his_databases'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare host: string

  @column()
  declare port: number

  @column()
  declare username: string

  @column({ serializeAs: null })
  declare password: string

  @column({ columnName: 'database_name' })
  declare databaseName: string

  @column()
  declare description: string | null

  @column({
    columnName: 'is_active',
    consume: (v) => v === 1 || v === true,
    prepare: (v: boolean) => (v ? 1 : 0),
  })
  declare isActive: boolean

  @column({
    columnName: 'is_default',
    consume: (v) => v === 1 || v === true,
    prepare: (v: boolean) => (v ? 1 : 0),
  })
  declare isDefault: boolean

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime
}
