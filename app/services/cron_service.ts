import fs from 'node:fs/promises'
import path from 'node:path'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import NotificationSchedule from '#models/notification_schedule'
import NotificationService from '#services/notification_service'
import ScheduleCalculator from '#services/schedule_calculator'
import logger from '@adonisjs/core/services/logger'

const TZ = 'Asia/Bangkok'
const LOG_DIR = path.join(process.cwd(), 'logs')
const BACKUP_DIR = path.join(process.cwd(), 'backups')

export interface CronLogEntry {
  time: string
  level: 'info' | 'warning' | 'error'
  message: string
}

export interface CronRunResult {
  skipped?: boolean
  reason?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  entries: CronLogEntry[]
  processed: number
}

/**
 * CronService — port of cron.php (8-step pipeline). Used by:
 *   1. `node ace cron:run` (CLI)
 *   2. SchedulerProvider (in-process node-cron, ticks every minute)
 *   3. HTTP POST /cron/run (UI "Run now" button + token-protected)
 *
 * In-process lock prevents two ticks overlapping (e.g. a slow LINE API
 * causes the previous run to still be active when the next minute tick
 * fires). HTTP and CLI hits during a run get a `{skipped: true}`.
 */
class CronServiceImpl {
  private isRunning = false

  /**
   * Execute the full pipeline once. Returns log entries collected
   * during the run for the UI to display.
   */
  async runOnce(): Promise<CronRunResult> {
    if (this.isRunning) {
      const now = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd HH:mm:ss')
      return {
        skipped: true,
        reason: 'A cron run is already in progress',
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        entries: [],
        processed: 0,
      }
    }

    this.isRunning = true
    const started = DateTime.now().setZone(TZ)
    const entries: CronLogEntry[] = []
    let processed = 0

    const log = async (message: string, level: CronLogEntry['level'] = 'info') => {
      const time = DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd HH:mm:ss')
      entries.push({ time, level, message })
      await this.appendLogFile(started, `[${time}] [${level}] ${message}\n`, level === 'error')
    }

    try {
      await fs.mkdir(LOG_DIR, { recursive: true })
      await log('=== Cron Job Started ===')

      const today = started.toFormat('yyyy-MM-dd')
      const currentTime = started.toFormat('HH:mm:00')
      const currentDatetime = started.toFormat('yyyy-MM-dd HH:mm:ss')
      const currentDay = ScheduleCalculator.todayDow()

      await log(`Current time: ${currentTime}, Day: ${currentDay}, Date: ${today}`)

      await this.step0_deactivateExpired(log, today)
      await this.step1_resetRepeatForNewDay(log, today, currentDay)
      await this.step2_initRepeatForToday(log, currentDay, today)
      processed = await this.step3and4_processDue(log, currentTime, today, currentDay, currentDatetime)
      await this.step5_catchMissed(log, currentDatetime, currentDay, today)
      await this.step6_cleanOldLogs(log)
      await this.step7_performanceStats(log, today)
      await this.step8_autoBackup(log, started)

      await log('=== Cron Job Completed Successfully ===')
    } catch (err: any) {
      await log(`System Error: ${err?.message ?? String(err)}`, 'error')
      await log('=== Cron Job Failed ===', 'error')
      logger.error({ err }, 'cron run failed')
    } finally {
      this.isRunning = false
    }

    const finished = DateTime.now().setZone(TZ)
    return {
      startedAt: started.toFormat('yyyy-MM-dd HH:mm:ss'),
      finishedAt: finished.toFormat('yyyy-MM-dd HH:mm:ss'),
      durationMs: finished.toMillis() - started.toMillis(),
      entries,
      processed,
    }
  }

  // ============================================================
  // STEP 0 — deactivate specific-mode schedules with all dates past
  // ============================================================
  private async step0_deactivateExpired(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    today: string
  ) {
    await log('STEP 0: Auto-deactivating expired specific schedules...')
    try {
      const candidates = await NotificationSchedule.query()
        .where('schedule_mode', 'specific')
        .where('is_active', 1)
        .whereNotNull('specific_dates')
      let deactivated = 0
      for (const s of candidates) {
        const futures = (s.specificDates ?? []).filter((d) => typeof d === 'string' && d >= today)
        if (futures.length === 0) {
          s.isActive = false
          await s.save()
          await log(`  ⚠ Deactivated '${s.scheduleName}' (ID: ${s.id}) — all specific dates have passed`)
          deactivated++
        }
      }
      await log(
        deactivated === 0
          ? '✓ No expired specific schedules'
          : `✓ Deactivated ${deactivated} expired specific schedules`
      )
    } catch (err: any) {
      await log(`Error in auto-deactivate: ${err?.message ?? err}`, 'error')
    }
  }

  // ============================================================
  // STEP 1 — reset repeat schedules whose next_send_time is stale
  // ============================================================
  private async step1_resetRepeatForNewDay(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    today: string,
    currentDay: number
  ) {
    await log('STEP 1: Checking and resetting repeat schedules for new day...')
    try {
      const candidates = await NotificationSchedule.query()
        .where('repeat_enabled', 1)
        .where('is_active', 1)
        .whereNotNull('next_send_time')
      let resetCount = 0
      for (const s of candidates) {
        if (!s.nextSendTime) continue
        const nextDate = s.nextSendTime.setZone(TZ).toFormat('yyyy-MM-dd')
        const mode = s.scheduleMode || 'weekly'
        let needsReset = false
        let newNext: DateTime | null = null
        let reason = ''

        if (mode === 'specific') {
          const dates = (s.specificDates ?? [])
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort()
          if (nextDate < today || !dates.includes(nextDate)) {
            for (const d of dates) {
              if (d >= today) {
                newNext = DateTime.fromFormat(
                  `${d} ${ScheduleCalculator.normalizeTime(s.sendTime)}`,
                  'yyyy-MM-dd HH:mm:ss',
                  { zone: TZ }
                )
                break
              }
            }
            needsReset = true
            reason = newNext ? 'rolling to next date in specific_dates' : 'no future specific dates'
          }
        } else {
          const days = String(s.daysOfWeek ?? '')
            .split(',')
            .map((n) => parseInt(n.trim(), 10))
            .filter((n) => n >= 1 && n <= 7)
          if (nextDate < today) {
            needsReset = true
            reason = 'next_send_time is in the past'
          } else if (!days.includes(currentDay)) {
            needsReset = true
            reason = 'today is not in allowed days'
          }
          if (needsReset) {
            // find next available day
            days.sort()
            let addDays: number | null = null
            for (const d of days) {
              if (d > currentDay) {
                addDays = d - currentDay
                break
              }
            }
            if (addDays === null && days.length > 0) {
              addDays = 7 - currentDay + days[0]
            }
            if (addDays === null) addDays = 1
            const target = DateTime.now()
              .setZone(TZ)
              .plus({ days: addDays })
              .toFormat('yyyy-MM-dd')
            newNext = DateTime.fromFormat(
              `${target} ${ScheduleCalculator.normalizeTime(s.sendTime)}`,
              'yyyy-MM-dd HH:mm:ss',
              { zone: TZ }
            )
          }
        }

        if (needsReset) {
          const old = s.nextSendTime.toFormat('yyyy-MM-dd HH:mm:ss')
          const newStr = newNext?.toFormat('yyyy-MM-dd HH:mm:ss') ?? 'NULL'
          // Skip write if the value hasn't actually changed (happens every minute
          // on non-schedule days — avoids ~60 pointless DB writes per hour)
          if (newStr === old) continue
          s.nextSendTime = newNext
          await s.save()
          await log(
            `Reset schedule: ${s.scheduleName} (ID: ${s.id}) - Reason: ${reason}`
          )
          await log(`  Old: ${old} → New: ${newStr}`)
          resetCount++
        }
      }
      await log(resetCount > 0
        ? `✓ Reset ${resetCount} repeat schedules for new day`
        : '✓ No schedules needed reset')
    } catch (err: any) {
      await log(`Error resetting schedules for new day: ${err?.message ?? err}`, 'error')
    }
  }

  // ============================================================
  // STEP 2 — initialise next_send_time for new repeat schedules
  // ============================================================
  private async step2_initRepeatForToday(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    currentDay: number,
    today: string
  ) {
    await log('STEP 2: Initializing new repeat schedules for today...')
    try {
      const candidates = await NotificationSchedule.query()
        .where('repeat_enabled', 1)
        .where('is_active', 1)
        .whereNull('next_send_time')
      let initialised = 0
      for (const s of candidates) {
        const mode = s.scheduleMode || 'weekly'
        let eligible = false
        if (mode === 'weekly') {
          const days = String(s.daysOfWeek ?? '')
            .split(',')
            .map((n) => parseInt(n.trim(), 10))
          eligible = days.includes(currentDay)
        } else {
          eligible = (s.specificDates ?? []).includes(today)
        }
        if (eligible) {
          s.nextSendTime = DateTime.fromFormat(
            `${today} ${ScheduleCalculator.normalizeTime(s.sendTime)}`,
            'yyyy-MM-dd HH:mm:ss',
            { zone: TZ }
          )
          await s.save()
          initialised++
        }
      }
      if (initialised > 0) await log(`✓ Initialized ${initialised} new repeat schedules for today`)
    } catch (err: any) {
      await log(`Error initializing repeat schedules: ${err?.message ?? err}`, 'error')
    }
  }

  // ============================================================
  // STEP 3+4 — find due schedules + process each
  // ============================================================
  private async step3and4_processDue(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    currentTime: string,
    today: string,
    currentDay: number,
    currentDatetime: string
  ): Promise<number> {
    await log('STEP 3: Finding schedules due to send...')
    const todayPattern = `%"${today}"%`

    const rows = await db
      .from('notification_schedules')
      .where('is_active', 1)
      .where((q) => {
        // NORMAL
        q.orWhere((q2) => {
          q2.where('repeat_enabled', 0)
            .where('send_time', '<=', currentTime)
            .where((q3) => q3.whereNull('last_sent_date').orWhereRaw('last_sent_date != ?', [today]))
            .where((q3) => {
              q3.orWhere((q4) =>
                q4.whereRaw("COALESCE(schedule_mode, 'weekly') = 'weekly'")
                  .whereRaw('FIND_IN_SET(?, days_of_week) > 0', [currentDay])
              )
              q3.orWhere((q4) =>
                q4.where('schedule_mode', 'specific').where('specific_dates', 'like', todayPattern)
              )
            })
        })
        // REPEAT
        q.orWhere((q2) => {
          q2.where('repeat_enabled', 1)
            .where((q3) => {
              q3.orWhere((q4) => q4.whereNull('next_send_time').where('send_time', '<=', currentTime))
              q3.orWhere('next_send_time', '<=', currentDatetime)
            })
            .where((q3) => {
              q3.orWhere((q4) =>
                q4.whereRaw("COALESCE(schedule_mode, 'weekly') = 'weekly'")
                  .whereRaw('FIND_IN_SET(?, days_of_week) > 0', [currentDay])
              )
              q3.orWhere((q4) =>
                q4.where('schedule_mode', 'specific').where('specific_dates', 'like', todayPattern)
              )
            })
            .where((q3) =>
              q3.whereNull('repeat_end_time').orWhere('repeat_end_time', '>=', currentTime)
            )
        })
      })
      .orderByRaw('CASE WHEN repeat_enabled = 1 THEN 0 ELSE 1 END')
      .orderBy('send_time', 'asc')

    const total = rows.length
    const repeatCount = rows.filter((s: any) => Number(s.repeat_enabled) === 1).length
    const normalCount = total - repeatCount
    await log(`Found ${total} schedules to process:`)
    await log(`  - Repeat schedules: ${repeatCount}`)
    await log(`  - Normal schedules: ${normalCount}`)

    await log('STEP 4: Processing schedules...')
    if (total === 0) {
      await log('✓ No schedules to process at this time')
      return 0
    }

    let processed = 0
    for (const row of rows as any[]) {
      const isRepeat = Number(row.repeat_enabled) === 1
      const tag = isRepeat ? 'REPEAT' : 'NORMAL'
      await log(`Processing [${tag}] schedule: ${row.schedule_name} (ID: ${row.id})`)

      try {
        const result = await NotificationService.sendNotification(row.id, false)
        const schedule = await NotificationSchedule.find(row.id)
        if (!schedule) continue

        if (result.success) {
          await log(`  ✓ Sent successfully to ${result.results.length} groups`)
          if (!isRepeat) {
            schedule.lastSentDate = DateTime.fromISO(today, { zone: TZ })
            await schedule.save()
            await log(`  ✓ Marked as sent today (last_sent_date = ${today})`)
          } else {
            const next = ScheduleCalculator.calculateRepeatNextTime(schedule)
            schedule.nextSendTime = next
            schedule.lastSentDate = DateTime.fromISO(today, { zone: TZ })
            await schedule.save()
            if (next === null) {
              await log('  ✓ Sent — no further fires scheduled')
            } else {
              const fmt = next.toFormat('yyyy-MM-dd HH:mm:ss')
              const rolledOver = !!schedule.repeatEndTime && next.toFormat('yyyy-MM-dd') > today
              if (rolledOver) {
                await log(`  ⏰ Past repeat_end_time (${schedule.repeatEndTime}) — rolled to ${fmt}`)
              } else {
                await log(`  ✓ Next fire: ${fmt}`)
              }
            }
          }
          const preview = result.message.slice(0, 100) + (result.message.length > 100 ? '...' : '')
          await log(`  Message: ${preview}`)
          processed++
        } else {
          await log('  ✗ No groups to send or all failed', 'warning')
          if (isRepeat) {
            const next = ScheduleCalculator.calculateRepeatNextTime(schedule)
            schedule.nextSendTime = next
            await schedule.save()
            await log(`  ⏭️  Skipped to next: ${next?.toFormat('yyyy-MM-dd HH:mm:ss') ?? 'NULL'}`)
          }
        }
      } catch (err: any) {
        await log(`Error processing schedule ID ${row.id}: ${err?.message ?? err}`, 'error')
        if (isRepeat) {
          try {
            const schedule = await NotificationSchedule.find(row.id)
            if (schedule) {
              const next = ScheduleCalculator.calculateRepeatNextTime(schedule)
              schedule.nextSendTime = next
              await schedule.save()
              await log(`  ⏭️  Error recovery: next fire ${next?.toFormat('yyyy-MM-dd HH:mm:ss') ?? 'NULL'}`)
            }
          } catch (ex: any) {
            await log(`  ✗ Failed to recover from error: ${ex?.message ?? ex}`, 'error')
          }
        }
      }

      await log('  ' + '-'.repeat(50))
      await new Promise((r) => setTimeout(r, 100))
    }

    await log(`✓ Completed processing ${total} schedules`)
    return processed
  }

  // ============================================================
  // STEP 5 — catch missed repeat windows
  // ============================================================
  private async step5_catchMissed(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    currentDatetime: string,
    currentDay: number,
    today: string
  ) {
    await log('STEP 5: Checking for missed repeat schedules...')
    try {
      const todayPattern = `%"${today}"%`
      const rows = await db
        .from('notification_schedules')
        .where('repeat_enabled', 1)
        .where('is_active', 1)
        .whereNotNull('next_send_time')
        .where('next_send_time', '<', currentDatetime)
        .where((q) => {
          q.orWhere((q2) =>
            q2.whereRaw("COALESCE(schedule_mode, 'weekly') = 'weekly'")
              .whereRaw('FIND_IN_SET(?, days_of_week) > 0', [currentDay])
          )
          q.orWhere((q2) =>
            q2.where('schedule_mode', 'specific').where('specific_dates', 'like', todayPattern)
          )
        })
        .where((q) =>
          q.whereNull('repeat_end_time').orWhereRaw('TIME(next_send_time) <= repeat_end_time')
        )

      if (rows.length === 0) {
        await log('✓ No missed repeat schedules')
        return
      }
      await log(`⚠️  Found ${rows.length} missed repeat schedules:`, 'warning')
      for (const row of rows as any[]) {
        const lateMin = Math.round(
          (DateTime.fromFormat(currentDatetime, 'yyyy-MM-dd HH:mm:ss', { zone: TZ }).toMillis() -
            DateTime.fromSQL(row.next_send_time, { zone: TZ }).toMillis()) /
            60_000
        )
        await log(
          `  - ${row.schedule_name}: Missed by ${lateMin} minutes (was: ${row.next_send_time})`,
          'warning'
        )
        const schedule = await NotificationSchedule.find(row.id)
        if (!schedule) continue
        const next = ScheduleCalculator.calculateRepeatNextTime(schedule)
        schedule.nextSendTime = next
        await schedule.save()
        await log(`    Updated to: ${next?.toFormat('yyyy-MM-dd HH:mm:ss') ?? 'NULL'}`)
      }
    } catch (err: any) {
      await log(`Error checking missed schedules: ${err?.message ?? err}`, 'error')
    }
  }

  // ============================================================
  // STEP 6 — clean old logs (DB + files)
  // ============================================================
  private async step6_cleanOldLogs(log: (m: string, l?: CronLogEntry['level']) => Promise<void>) {
    await log('STEP 6: Cleaning old logs...')
    try {
      const cleanDate = DateTime.now()
        .setZone(TZ)
        .minus({ days: Number(env.get('MAX_LOG_DAYS')) })
        .toFormat('yyyy-MM-dd')
      const deleted = (await db
        .from('notification_logs')
        .whereRaw('DATE(sent_at) < ?', [cleanDate])
        .delete()) as unknown as number
      if (Number(deleted) > 0) {
        await log(`✓ Cleaned up ${deleted} old log records (older than ${cleanDate})`)
      }

      // Delete cron_*.log files older than 7 days
      try {
        const files = await fs.readdir(LOG_DIR)
        const sevenDaysAgo = DateTime.now().setZone(TZ).minus({ days: 7 })
        let deletedFiles = 0
        for (const f of files) {
          const m = f.match(/^cron(?:_error)?_(\d{4}-\d{2}-\d{2})\.log$/)
          if (!m) continue
          const dt = DateTime.fromISO(m[1], { zone: TZ })
          if (dt.isValid && dt < sevenDaysAgo) {
            await fs.unlink(path.join(LOG_DIR, f))
            deletedFiles++
          }
        }
        if (deletedFiles > 0) await log(`✓ Cleaned up ${deletedFiles} old cron log files`)
      } catch (err: any) {
        await log(`Warning: could not scan log dir: ${err?.message ?? err}`, 'warning')
      }
    } catch (err: any) {
      await log(`Error cleaning old logs: ${err?.message ?? err}`, 'error')
    }
  }

  // ============================================================
  // STEP 7 — performance / today stats
  // ============================================================
  private async step7_performanceStats(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    today: string
  ) {
    await log('STEP 7: Performance monitoring...')
    try {
      const stats = await db
        .from('notification_logs')
        .whereRaw('DATE(sent_at) = ?', [today])
        .select(db.raw('COUNT(*) as total'))
        .select(db.raw('SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success'))
        .select(db.raw('SUM(CASE WHEN status_code != 200 THEN 1 ELSE 0 END) as failed'))
        .first()
      await log("Today's Statistics:")
      await log(`  - Total sends: ${(stats as any)?.total ?? 0}`)
      await log(`  - Successful: ${(stats as any)?.success ?? 0}`)
      await log(`  - Failed: ${(stats as any)?.failed ?? 0}`)

      const active = await db
        .from('notification_schedules')
        .where('is_active', 1)
        .select(db.raw('COUNT(*) as total'))
        .select(db.raw('SUM(CASE WHEN repeat_enabled = 1 THEN 1 ELSE 0 END) as repeat_count'))
        .select(db.raw('SUM(CASE WHEN repeat_enabled = 0 THEN 1 ELSE 0 END) as normal_count'))
        .first()
      await log('Active Schedules:')
      await log(`  - Total: ${(active as any)?.total ?? 0}`)
      await log(`  - Repeat: ${(active as any)?.repeat_count ?? 0}`)
      await log(`  - Normal: ${(active as any)?.normal_count ?? 0}`)
    } catch (err: any) {
      await log(`Error getting performance stats: ${err?.message ?? err}`, 'error')
    }
  }

  // ============================================================
  // STEP 8 — daily auto-backup at hour 23
  // ============================================================
  private async step8_autoBackup(
    log: (m: string, l?: CronLogEntry['level']) => Promise<void>,
    started: DateTime
  ) {
    if (started.hour !== 23) return
    await log('STEP 8: Running daily backup...')
    try {
      await fs.mkdir(BACKUP_DIR, { recursive: true })
      const backupFile = path.join(BACKUP_DIR, `auto_backup_${started.toFormat('yyyy-MM-dd')}.sql`)
      try {
        await fs.access(backupFile)
        await log(`✓ Today's backup already exists: ${path.basename(backupFile)}`)
        return
      } catch {
        /* not present — proceed */
      }

      const tables = [
        'line_groups',
        'notification_templates',
        'notification_items',
        'notification_schedules',
        'users',
        'his_databases',
        'system_settings',
      ]
      let sql = `-- Auto backup\n-- Generated: ${started.toFormat('yyyy-MM-dd HH:mm:ss')}\n\n`
      for (const t of tables) {
        try {
          const createRows = await db.rawQuery(`SHOW CREATE TABLE \`${t}\``)
          const createSql = (createRows[0] as any[])?.[0]?.['Create Table']
          if (createSql) sql += `DROP TABLE IF EXISTS \`${t}\`;\n${createSql};\n\n`
          const rows = await db.from(t)
          for (const r of rows as any[]) {
            const cols = Object.keys(r)
            const vals = cols.map((c) => {
              const v = r[c]
              if (v === null || v === undefined) return 'NULL'
              return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'"
            })
            sql += `INSERT INTO \`${t}\` (\`${cols.join('`,`')}\`) VALUES (${vals.join(',')});\n`
          }
          sql += '\n'
        } catch (err: any) {
          await log(`  ⚠ Failed to dump '${t}': ${err?.message ?? err}`, 'warning')
        }
      }
      await fs.writeFile(backupFile, sql)
      const stat = await fs.stat(backupFile)
      await log(`✓ Created backup: ${path.basename(backupFile)} (${(stat.size / 1024).toFixed(1)} KB)`)

      // Rotate — keep last 30
      const files = (await fs.readdir(BACKUP_DIR))
        .filter((f) => /^auto_backup_\d{4}-\d{2}-\d{2}\.sql$/.test(f))
        .map((f) => ({ name: f, path: path.join(BACKUP_DIR, f) }))
      if (files.length > 30) {
        const stats = await Promise.all(
          files.map(async (f) => ({ ...f, mtime: (await fs.stat(f.path)).mtimeMs }))
        )
        stats.sort((a, b) => a.mtime - b.mtime)
        const toDelete = stats.slice(0, stats.length - 30)
        for (const f of toDelete) await fs.unlink(f.path)
        await log(`✓ Rotated ${toDelete.length} old backups`)
      }
    } catch (err: any) {
      await log(`Error in auto backup: ${err?.message ?? err}`, 'error')
    }
  }

  /**
   * Append a line to today's cron log file. Errors are swallowed
   * (logging shouldn't break the pipeline).
   */
  private async appendLogFile(when: DateTime, line: string, isError: boolean) {
    const date = when.toFormat('yyyy-MM-dd')
    const file = path.join(LOG_DIR, `cron_${date}.log`)
    try {
      await fs.appendFile(file, line)
      if (isError) {
        const errFile = path.join(LOG_DIR, `cron_error_${date}.log`)
        await fs.appendFile(errFile, line)
      }
    } catch {
      /* ignore */
    }
  }
}

const CronService = new CronServiceImpl()
export default CronService
