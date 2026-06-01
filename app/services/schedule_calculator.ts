import { DateTime } from 'luxon'
import NotificationSchedule from '#models/notification_schedule'

/**
 * ScheduleCalculator — port of NotificationSchedule::nextEligibleAt(),
 * calculateNextSendTime(), and calculateRepeatNextTime() from PHP.
 *
 * Day convention: 1=Sun, 2=Mon, ..., 7=Sat (date('w')+1).
 * All datetimes use the configured TZ (Asia/Bangkok) via Luxon.
 */
export default class ScheduleCalculator {
  static TZ = 'Asia/Bangkok'

  /**
   * Find the next send-time at or after $minTs (Luxon DateTime),
   * starting from $startDate (YYYY-MM-DD string).
   */
  static nextEligibleAt(
    schedule: NotificationSchedule,
    startDate: string,
    sendTime: string,
    minDt: DateTime
  ): DateTime | null {
    if (!sendTime) return null

    const mode = schedule.scheduleMode || 'weekly'

    if (mode === 'specific') {
      const dates = (schedule.specificDates || [])
        .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
      for (const d of dates) {
        if (d < startDate) continue
        const candidate = DateTime.fromFormat(
          `${d} ${this.normalizeTime(sendTime)}`,
          'yyyy-MM-dd HH:mm:ss',
          { zone: this.TZ }
        )
        if (candidate.isValid && candidate >= minDt) return candidate
      }
      return null
    }

    const allowed = String(schedule.daysOfWeek ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n >= 1 && n <= 7)
    if (allowed.length === 0) return null

    const startDt = DateTime.fromISO(startDate, { zone: this.TZ })
    if (!startDt.isValid) return null

    for (let add = 0; add <= 7; add++) {
      const day = startDt.plus({ days: add })
      // Luxon weekday: 1=Mon..7=Sun. Convert to our 1=Sun..7=Sat:
      // PHP date('w') = 0(Sun)..6(Sat); +1 → 1..7. Luxon weekday 7=Sun → 1.
      const dow = day.weekday === 7 ? 1 : day.weekday + 1
      if (!allowed.includes(dow)) continue
      const candidate = DateTime.fromFormat(
        `${day.toFormat('yyyy-MM-dd')} ${this.normalizeTime(sendTime)}`,
        'yyyy-MM-dd HH:mm:ss',
        { zone: this.TZ }
      )
      if (candidate.isValid && candidate >= minDt) return candidate
    }
    return null
  }

  /**
   * Next send time for a NEW or NORMAL schedule (no repeat). Returns
   * a Luxon DateTime in Asia/Bangkok or null. Caller is responsible
   * for storing the value on the model.
   */
  static calculateNextSendTime(schedule: NotificationSchedule): DateTime | null {
    if (!schedule.sendTime) return null
    const now = DateTime.now().setZone(this.TZ)
    return this.nextEligibleAt(
      schedule,
      now.toFormat('yyyy-MM-dd'),
      schedule.sendTime,
      now
    )
  }

  /**
   * Next fire for a REPEAT schedule.
   *   - fromDt: anchor (the just-fired time or now)
   *   - returns next-fire DateTime or null
   */
  static calculateRepeatNextTime(
    schedule: NotificationSchedule,
    fromDt?: DateTime
  ): DateTime | null {
    const anchor = (fromDt ?? DateTime.now()).setZone(this.TZ)
    const interval = Math.max(0, schedule.repeatInterval ?? 0)

    if (interval <= 0) {
      return this.nextEligibleAt(
        schedule,
        anchor.plus({ days: 1 }).toFormat('yyyy-MM-dd'),
        schedule.sendTime,
        anchor.plus({ seconds: 1 })
      )
    }

    const unit = schedule.repeatUnit ?? 'minutes'
    const candidate = anchor.plus(unit === 'hours' ? { hours: interval } : { minutes: interval })

    if (schedule.repeatEndTime) {
      const endToday = DateTime.fromFormat(
        `${anchor.toFormat('yyyy-MM-dd')} ${this.normalizeTime(schedule.repeatEndTime)}`,
        'yyyy-MM-dd HH:mm:ss',
        { zone: this.TZ }
      )
      if (endToday.isValid && candidate > endToday) {
        const rollDate = anchor.plus({ days: 1 }).toFormat('yyyy-MM-dd')
        const rollStart = DateTime.fromFormat(
          `${rollDate} ${this.normalizeTime(schedule.sendTime)}`,
          'yyyy-MM-dd HH:mm:ss',
          { zone: this.TZ }
        )
        return this.nextEligibleAt(schedule, rollDate, schedule.sendTime, rollStart)
      }
    }

    return candidate
  }

  /**
   * Normalize a time string to HH:mm:ss. Accepts HH:mm or HH:mm:ss.
   */
  static normalizeTime(t: string): string {
    if (!t) return '00:00:00'
    const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (!m) return '00:00:00'
    return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`
  }

  /**
   * Today's day-of-week in the 1=Sun..7=Sat convention.
   */
  static todayDow(): number {
    const wd = DateTime.now().setZone(this.TZ).weekday // Luxon: 1=Mon..7=Sun
    return wd === 7 ? 1 : wd + 1
  }
}
