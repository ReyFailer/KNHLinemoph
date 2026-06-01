import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * SystemSetting — key/value store with composite primary key on
 * `setting_key` (no integer id column). We override Lucid's
 * default primary-key behaviour to use the string PK.
 */
export default class SystemSetting extends BaseModel {
  public static table = 'system_settings'
  public static primaryKey = 'settingKey'

  // The DB column is the PK, but Lucid still wants `id`-style
  // semantics — declare it as string here.
  @column({ isPrimary: true, columnName: 'setting_key' })
  declare settingKey: string

  @column({ columnName: 'setting_value' })
  declare settingValue: string | null

  @column({ columnName: 'updated_by' })
  declare updatedBy: number | null

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime
}
