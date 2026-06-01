import { DateTime } from 'luxon'
import bcrypt from 'bcryptjs'
import { BaseModel, beforeSave, column } from '@adonisjs/lucid/orm'

/**
 * User — maps the existing PHP `users` table.
 *
 * Why we hand-roll instead of @adonisjs/auth's `withAuthFinder`:
 *   1. PHP's password_hash() emits $2y$-prefixed bcrypt hashes;
 *      the npm `bcrypt` package (used by Adonis's bcrypt driver)
 *      refuses to verify them. `bcryptjs` (pure JS) accepts
 *      $2a / $2b / $2y, so we use it directly for verify + rehash.
 *   2. We need an `is_active === 1` gate.
 *   3. We need a role-hierarchy string field, not a boolean.
 */
export default class User extends BaseModel {
  public static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare username: string

  @column({ columnName: 'display_name' })
  declare displayName: string

  @column({ columnName: 'password_hash', serializeAs: null })
  declare passwordHash: string

  @column()
  declare role: 'admin' | 'operator' | 'viewer'

  @column({
    columnName: 'is_active',
    consume: (v) => v === 1 || v === true,
    prepare: (v: boolean) => (v ? 1 : 0),
  })
  declare isActive: boolean

  @column.dateTime({ columnName: 'last_login_at' })
  declare lastLoginAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime

  get isAdmin(): boolean {
    return this.role === 'admin'
  }

  /**
   * Auto-hash on save when the raw column has been assigned a
   * non-bcrypt value (e.g. from the admin user form).
   */
  @beforeSave()
  static async hashPassword(user: User) {
    if (user.$dirty.passwordHash && !/^\$2[aby]\$/.test(user.passwordHash)) {
      user.passwordHash = await bcrypt.hash(user.passwordHash, 10)
    }
  }

  /**
   * Look up a user by username and verify the password.
   * Accepts $2y$ (PHP) / $2a$ / $2b$ hashes — bcryptjs handles
   * all three identically.
   *
   * Auto-rehash on successful login if the stored cost is below
   * our current target (10), so legacy PHP hashes upgrade
   * transparently the next time the user logs in.
   */
  static async verifyCredentials(username: string, password: string): Promise<User> {
    const user = await this.findBy('username', username)
    if (!user) throw new Error('Invalid credentials')

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw new Error('Invalid credentials')

    return user
  }
}
