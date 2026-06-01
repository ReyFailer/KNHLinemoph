import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'mysql',
  connections: {
    /*
    |----------------------------------------------------------
    | APP database — maps the existing PHP schema_app.sql
    | tables exactly. We never run migrations against this
    | DB; the database/migrations/ folder is documentation
    | of the schema, not a source of truth.
    |----------------------------------------------------------
    */
    mysql: {
      client: 'mysql2',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
        charset: 'utf8mb4',
        timezone: '+07:00',
        dateStrings: true,
      },
      pool: {
        min: 0,
        max: 10,
        afterCreate: (conn: any, done: Function) => {
          conn.query("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'", done)
        },
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },

    /*
    |----------------------------------------------------------
    | Default HIS connection (bootstrap).
    |
    | At runtime, HisManager registers additional connections
    | dynamically from the his_databases table — see
    | app/services/his_manager.ts.
    |----------------------------------------------------------
    */
    his_default: {
      client: 'mysql2',
      connection: {
        host: env.get('HIS_DB_HOST', '127.0.0.1'),
        port: Number(env.get('HIS_DB_PORT', 3306)),
        user: env.get('HIS_DB_USER', ''),
        password: env.get('HIS_DB_PASSWORD', ''),
        database: env.get('HIS_DB_DATABASE', ''),
        timezone: '+07:00',
        dateStrings: true,
      },
      pool: {
        min: 0,
        max: 3,
        acquireTimeoutMillis: 10_000,
      },
    },
  },
})

export default dbConfig
