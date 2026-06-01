import { defineConfig } from '@adonisjs/shield'

const shieldConfig = defineConfig({
  csp: {
    enabled: false,
    directives: {},
    reportOnly: false,
  },

  /*
  |----------------------------------------------------------
  | CSRF
  |
  | Legacy PHP app.js posts the token under the field name
  | `csrf_token`. @adonisjs/shield reads `_csrf` by default
  | OR an `X-CSRF-TOKEN` header. We patch app.js to send the
  | header form, which is cleaner than custom field aliasing.
  |----------------------------------------------------------
  */
  csrf: {
    enabled: true,
    exceptRoutes: ['/health', '/cron/run'],
    enableXsrfCookie: false,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },

  xFrame: {
    enabled: true,
    action: 'DENY',
  },

  hsts: {
    enabled: true,
    maxAge: '180 days',
  },

  contentTypeSniffing: {
    enabled: true,
  },
})

export default shieldConfig
