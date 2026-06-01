import mysql from 'mysql2/promise'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import HisDatabase from '#models/his_database'

interface Pool {
  pool: mysql.Pool
  signature: string
}

/**
 * HisManager — keeps a connection pool per logical HIS name.
 *
 * Connections are configured in the `his_databases` table (UI-managed).
 * If a name is missing, falls back to the .env HIS_DB_* defaults.
 *
 * The `signature` lets us detect when a row was updated in the UI and
 * lazily rebuild the pool the next time the name is requested.
 */
class HisManagerImpl {
  private pools = new Map<string, Pool>()

  /**
   * Run a parameterised SELECT against the named HIS database and
   * return the first row as a plain object, or null if empty.
   */
  async queryFirst(name: string, sql: string, params: any[] = []): Promise<Record<string, unknown> | null> {
    const pool = await this.acquire(name)
    const [rows] = await pool.execute(sql, params)
    const list = rows as Array<Record<string, unknown>>
    return list[0] ?? null
  }

  /**
   * Run a parameterised SELECT and return all rows.
   */
  async query(name: string, sql: string, params: any[] = []): Promise<Array<Record<string, unknown>>> {
    const pool = await this.acquire(name)
    const [rows] = await pool.execute(sql, params)
    return rows as Array<Record<string, unknown>>
  }

  /**
   * Acquire (or lazily create) the pool for a logical name.
   *
   * Resolution order:
   *   1. his_databases row WHERE name=? AND is_active=1
   *   2. The .env HIS_DB_* values (when name='hos' or no DB row found)
   */
  private async acquire(name: string): Promise<mysql.Pool> {
    const config = await this.resolveConfig(name)
    const signature = JSON.stringify(config)

    const cached = this.pools.get(name)
    if (cached && cached.signature === signature) return cached.pool

    if (cached) {
      try { await cached.pool.end() } catch { /* ignore */ }
    }

    const pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      charset: config.charset,
      connectionLimit: 3,
      connectTimeout: 3_000,
      timezone: '+07:00',
      dateStrings: true,
    })
    pool.on('connection', (conn) => {
      conn.query("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
    })
    this.pools.set(name, { pool, signature })
    return pool
  }

  private async resolveConfig(name: string): Promise<{
    host: string
    port: number
    user: string
    password: string
    database: string
    charset: string
  }> {
    const defaultCharset = env.get('HIS_DB_CHARSET', 'tis620') ?? 'tis620'

    if (name === '__app__') {
      return {
        host: env.get('DB_HOST', '127.0.0.1'),
        port: Number(env.get('DB_PORT', 3306)),
        user: env.get('DB_USER', 'root'),
        password: env.get('DB_PASSWORD', ''),
        database: env.get('DB_DATABASE', ''),
        charset: 'utf8mb4',
      }
    }

    try {
      const row = await HisDatabase.query().where('name', name).where('is_active', 1).first()
      if (row) {
        return {
          host: row.host,
          port: row.port,
          user: row.username,
          password: row.password,
          database: row.databaseName,
          charset: defaultCharset,
        }
      }
    } catch (err) {
      logger.warn({ err, name }, 'HisManager: failed to read his_databases')
    }
    return {
      host: env.get('HIS_DB_HOST', '127.0.0.1'),
      port: Number(env.get('HIS_DB_PORT', 3306)),
      user: env.get('HIS_DB_USER', ''),
      password: env.get('HIS_DB_PASSWORD', ''),
      database: env.get('HIS_DB_DATABASE', 'hos'),
      charset: defaultCharset,
    }
  }

  async closeAll() {
    for (const { pool } of this.pools.values()) {
      try { await pool.end() } catch { /* ignore */ }
    }
    this.pools.clear()
  }
}

const HisManager = new HisManagerImpl()
export default HisManager
