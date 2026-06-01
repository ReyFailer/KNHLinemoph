import type { ApplicationService } from '@adonisjs/core/types'
import cron from 'node-cron'
import logger from '@adonisjs/core/services/logger'

/**
 * SchedulerProvider — in-process scheduler for the cron pipeline.
 *
 * Boots a node-cron task that ticks every minute and calls
 * `CronService.runOnce()`. Only runs in the `web` environment so
 * that ace commands (including `cron:run`) and tests don't spawn
 * a duplicate scheduler.
 */
export default class SchedulerProvider {
  task: cron.ScheduledTask | null = null

  constructor(protected app: ApplicationService) {}

  register() {}
  async boot() {}
  async start() {}

  async ready() {
    if (this.app.getEnvironment() !== 'web') return

    const { default: CronService } = await import('#services/cron_service')

    this.task = cron.schedule(
      '* * * * *',
      async () => {
        try {
          const result = await CronService.runOnce()
          if (result.skipped) {
            logger.info({ reason: result.reason }, 'cron tick skipped (already running)')
          } else if (result.processed > 0) {
            logger.info(
              { ms: result.durationMs, processed: result.processed },
              'cron tick completed'
            )
          }
        } catch (err) {
          logger.error({ err }, 'cron tick failed')
        }
      },
      { timezone: 'Asia/Bangkok' }
    )
    logger.info('SchedulerProvider: in-process cron tick started (every minute, TZ=Asia/Bangkok)')
  }

  async shutdown() {
    if (this.task) {
      this.task.stop()
      this.task = null
    }
  }
}
