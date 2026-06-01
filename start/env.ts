/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  APP_NAME: Env.schema.string.optional(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum([
    'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent',
  ] as const),

  /*
  |----------------------------------------------------------
  | Session
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),
  SESSION_COOKIE_SECURE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | APP database (existing PHP schema)
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | HIS database — bootstrap default (overridden per request
  | by his_databases table when a logical name is given)
  |----------------------------------------------------------
  */
  HIS_DB_HOST: Env.schema.string.optional({ format: 'host' }),
  HIS_DB_PORT: Env.schema.number.optional(),
  HIS_DB_USER: Env.schema.string.optional(),
  HIS_DB_PASSWORD: Env.schema.string.optional(),
  HIS_DB_DATABASE: Env.schema.string.optional(),
  HIS_DB_CHARSET: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | LINE / MOPH API
  |----------------------------------------------------------
  */
  DEFAULT_MOPH_API_URL: Env.schema.string(),
  LINE_API_TIMEOUT: Env.schema.number(),

  /*
  |----------------------------------------------------------
  | Cron + operations
  |----------------------------------------------------------
  */
  CRON_TOKEN: Env.schema.string(),
  MAX_LOG_DAYS: Env.schema.number(),
})
