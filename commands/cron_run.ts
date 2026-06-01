import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace cron:run` — execute the cron pipeline once and exit.
 *
 * Use this from the system scheduler (Windows Task Scheduler / cron)
 * if you prefer external scheduling over the in-process node-cron
 * scheduler.
 */
export default class CronRun extends BaseCommand {
  static commandName = 'cron:run'
  static description = 'Run the notification cron pipeline once'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: CronService } = await import('#services/cron_service')
    const result = await CronService.runOnce()

    if (result.skipped) {
      this.logger.warning(`Skipped: ${result.reason}`)
      return
    }

    for (const e of result.entries) {
      const fn =
        e.level === 'error'
          ? this.logger.error.bind(this.logger)
          : e.level === 'warning'
            ? this.logger.warning.bind(this.logger)
            : this.logger.info.bind(this.logger)
      fn(`[${e.time}] ${e.message}`)
    }

    this.logger.success(
      `Finished in ${(result.durationMs / 1000).toFixed(2)}s — processed ${result.processed} schedule(s)`
    )
  }
}
