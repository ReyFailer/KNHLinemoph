import env from '#start/env'
import { defineConfig, stores } from '@adonisjs/session'

const sessionConfig = defineConfig({
  enabled: true,
  cookieName: 'line-notify-session',

  clearWithBrowser: false,
  age: '8h',

  cookie: {
    path: '/',
    httpOnly: true,
    secure: env.get('SESSION_COOKIE_SECURE') === 'true',
    sameSite: 'lax',
  },

  store: env.get('SESSION_DRIVER'),

  stores: {
    cookie: stores.cookie(),
  },
})

export default sessionConfig
