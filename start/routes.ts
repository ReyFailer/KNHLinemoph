import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const HealthController = () => import('#controllers/health_controller')
const DashboardController = () => import('#controllers/dashboard_controller')
const SchedulesController = () => import('#controllers/schedules_controller')
const TemplatesController = () => import('#controllers/templates_controller')
const ItemsController = () => import('#controllers/items_controller')
const GroupsController = () => import('#controllers/groups_controller')
const LogsController = () => import('#controllers/logs_controller')
const AuditController = () => import('#controllers/audit_controller')
const UsersController = () => import('#controllers/users_controller')
const SettingsController = () => import('#controllers/settings_controller')
const HisDatabasesController = () => import('#controllers/his_databases_controller')
const CronController = () => import('#controllers/cron_controller')

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/
router.get('/health', [HealthController, 'show']).as('health')

router.get('/', async ({ response }) => response.redirect('/dashboard'))

router
  .group(() => {
    router.get('/login', [AuthController, 'showLogin']).as('auth.showLogin')
    router.post('/login', [AuthController, 'login']).as('auth.login')
  })
  .use(middleware.guest())

router.post('/logout', [AuthController, 'logout']).as('auth.logout').use(middleware.auth())
router.get('/logout', [AuthController, 'logout']).use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Legacy redirects from PHP ?page=X URLs
|--------------------------------------------------------------------------
*/
router.get('/index.php', ({ request, response }) => {
  const allowed = new Set([
    'dashboard', 'schedules', 'logs', 'templates', 'items',
    'groups', 'cron', 'audit', 'users', 'settings', 'login',
  ])
  const page = String(request.qs().page ?? 'dashboard')
  return response.redirect(`/${allowed.has(page) ? page : 'dashboard'}`)
})

/*
|--------------------------------------------------------------------------
| Authenticated — viewer+ (read-only browsing)
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.get('/dashboard', [DashboardController, 'index']).as('dashboard')

    router.get('/schedules', [SchedulesController, 'index']).as('schedules.index')
    router.post('/schedules/get', [SchedulesController, 'get']).as('schedules.get')

    router.get('/templates', [TemplatesController, 'index']).as('templates.index')

    router.post('/groups/list', [GroupsController, 'list']).as('groups.list')

    router.get('/logs', [LogsController, 'index']).as('logs.index')

    router.get('/users/profile', [UsersController, 'profile']).as('users.profile')
    router.post('/users/password', [UsersController, 'changePassword']).as('users.password')

    router.get('/settings', [SettingsController, 'index']).as('settings.index')
  })
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Authenticated — operator+ (CUD operations)
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.post('/schedules/save', [SchedulesController, 'save']).as('schedules.save')
    router.post('/schedules/delete', [SchedulesController, 'delete']).as('schedules.delete')
    router.post('/schedules/clone', [SchedulesController, 'clone']).as('schedules.clone')
    router.post('/schedules/test', [SchedulesController, 'test']).as('schedules.test')

    router.post('/templates/save', [TemplatesController, 'save']).as('templates.save')
    router.post('/templates/delete', [TemplatesController, 'delete']).as('templates.delete')

    router.get('/items', [ItemsController, 'index']).as('items.index')
    router.post('/items/save', [ItemsController, 'save']).as('items.save')
    router.post('/items/delete', [ItemsController, 'delete']).as('items.delete')
    router.post('/items/test', [ItemsController, 'test']).as('items.test')

    router.post('/logs/clear', [LogsController, 'clear']).as('logs.clear')
    router.post('/logs/export', [LogsController, 'export']).as('logs.export')
    router.post('/logs/resend', [LogsController, 'resend']).as('logs.resend')

    router.post('/test/send', [GroupsController, 'sendTest']).as('test.send')

    router.get('/cron', [CronController, 'index']).as('cron.index')
    router.post('/cron/status', [CronController, 'status']).as('cron.status')
    router.post('/cron/log', [CronController, 'log']).as('cron.log')
    router.post('/cron/run', [CronController, 'run']).as('cron.run')
  })
  .use([middleware.auth(), middleware.role(['operator'])])

/*
|--------------------------------------------------------------------------
| Authenticated — admin only
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.get('/users', [UsersController, 'index']).as('users.index')
    router.post('/users/get', [UsersController, 'get']).as('users.get')
    router.post('/users/save', [UsersController, 'save']).as('users.save')
    router.post('/users/delete', [UsersController, 'delete']).as('users.delete')

    router.get('/audit', [AuditController, 'index']).as('audit.index')

    router.get('/groups', [GroupsController, 'index']).as('groups.index')
    router.post('/groups/get', [GroupsController, 'get']).as('groups.get')
    router.post('/groups/save', [GroupsController, 'save']).as('groups.save')
    router.post('/groups/delete', [GroupsController, 'delete']).as('groups.delete')
    router.post('/groups/test', [GroupsController, 'test']).as('groups.test')

    router.post('/settings/save', [SettingsController, 'save']).as('settings.save')

    router.post('/hisdb/save', [HisDatabasesController, 'save']).as('hisdb.save')
    router.post('/hisdb/delete', [HisDatabasesController, 'delete']).as('hisdb.delete')
    router.post('/hisdb/test', [HisDatabasesController, 'test']).as('hisdb.test')
    router.post('/hisdb/setDefault', [HisDatabasesController, 'setDefault']).as('hisdb.setDefault')
  })
  .use([middleware.auth(), middleware.role(['admin'])])
