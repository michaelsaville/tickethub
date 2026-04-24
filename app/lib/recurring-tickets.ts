import type { TH_RecurringFrequency } from '@prisma/client'

/**
 * Schedule computation for recurring ticket templates.
 *
 * The schedule is interpreted in `template.timezone` (IANA), so "every
 * Monday at 08:00" means local Monday 08:00 in that zone — and the UTC
 * timestamp we store in `nextRunAt` shifts by 1 hour across DST.
 *
 * All functions here are pure. The cron job decides when to call them.
 */

export interface ScheduleInput {
  frequency: TH_RecurringFrequency
  /** Step size. 1 = every period, 2 = every other period, ... */
  interval: number
  /** WEEKLY: 0=Sunday..6=Saturday. Ignored for other frequencies. */
  dayOfWeek: number | null
  /** MONTHLY: 1..31. Clamped to last day of month if larger. */
  dayOfMonth: number | null
  hourOfDay: number
  minuteOfHour: number
  /** IANA timezone name. */
  timezone: string
}

interface LocalParts {
  year: number
  month: number // 1..12
  day: number
  hour: number
  minute: number
  second: number
  dayOfWeek: number // 0=Sunday..6=Saturday
}

function partsInZone(date: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  })
  const parts = fmt.formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0 // some platforms report 24 at midnight
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    dayOfWeek: weekdayMap[get('weekday')] ?? 0,
  }
}

/** Convert a wall-clock local time in `tz` to a UTC Date. Handles DST. */
function zonedToUtc(
  year: number,
  month: number, // 1..12
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Treat the wall-clock as if it were UTC, then correct by the zone offset
  // at that moment. Re-check once to settle DST transitions.
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute)
  const offset1 = zoneOffsetMinutes(new Date(naiveUtc), tz)
  const guess = new Date(naiveUtc - offset1 * 60_000)
  const offset2 = zoneOffsetMinutes(guess, tz)
  if (offset1 === offset2) return guess
  return new Date(naiveUtc - offset2 * 60_000)
}

/** Minutes ahead of UTC for `tz` at `date` (e.g., EDT=-240, UTC=0). */
function zoneOffsetMinutes(date: Date, tz: string): number {
  const p = partsInZone(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return (asUtc - date.getTime()) / 60_000
}

function daysInMonth(year: number, month: number): number {
  // month is 1..12
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Add whole days to a UTC Date while preserving the wall-clock time in `tz`. */
function addDaysPreservingLocal(date: Date, days: number, tz: string): Date {
  const p = partsInZone(date, tz)
  return zonedToUtc(p.year, p.month, p.day + days, p.hour, p.minute, tz)
}

/**
 * Next fire time strictly AFTER `after`, honoring the schedule.
 *
 * - DAILY: next occurrence of hourOfDay:minuteOfHour in tz, stepping by
 *   `interval` days until > after.
 * - WEEKLY: next occurrence of dayOfWeek + target time, stepping by
 *   `interval` weeks until > after.
 * - MONTHLY: next occurrence of dayOfMonth (clamped to last day of month)
 *   + target time, stepping by `interval` months until > after.
 */
export function computeNextRunAt(
  schedule: ScheduleInput,
  after: Date,
): Date {
  const interval = Math.max(1, schedule.interval | 0)
  const tz = schedule.timezone
  const local = partsInZone(after, tz)

  switch (schedule.frequency) {
    case 'DAILY': {
      let candidate = zonedToUtc(
        local.year, local.month, local.day,
        schedule.hourOfDay, schedule.minuteOfHour, tz,
      )
      while (candidate <= after) {
        candidate = addDaysPreservingLocal(candidate, interval, tz)
      }
      return candidate
    }

    case 'WEEKLY': {
      const targetDow = ((schedule.dayOfWeek ?? local.dayOfWeek) + 7) % 7
      const daysAhead = (targetDow - local.dayOfWeek + 7) % 7
      let candidate = zonedToUtc(
        local.year, local.month, local.day + daysAhead,
        schedule.hourOfDay, schedule.minuteOfHour, tz,
      )
      while (candidate <= after) {
        candidate = addDaysPreservingLocal(candidate, interval * 7, tz)
      }
      return candidate
    }

    case 'MONTHLY': {
      const targetDom = Math.max(1, Math.min(31, schedule.dayOfMonth ?? 1))
      let y = local.year
      let m = local.month // 1..12
      // Loop forward, clamping dayOfMonth to the month's last day.
      for (let guard = 0; guard < 120; guard++) {
        const dom = Math.min(targetDom, daysInMonth(y, m))
        const candidate = zonedToUtc(
          y, m, dom,
          schedule.hourOfDay, schedule.minuteOfHour, tz,
        )
        if (candidate > after) return candidate
        m += interval
        while (m > 12) { m -= 12; y += 1 }
      }
      // Defensive fallback — shouldn't be reached with sane input.
      throw new Error('computeNextRunAt: monthly loop exhausted')
    }

    default: {
      const _exhaustive: never = schedule.frequency
      throw new Error(`Unknown frequency: ${_exhaustive as string}`)
    }
  }
}

/** Preview upcoming occurrences. Useful in the template editor UI. */
export function previewUpcomingRuns(
  schedule: ScheduleInput,
  count: number,
  from: Date = new Date(),
): Date[] {
  const runs: Date[] = []
  let cursor = from
  for (let i = 0; i < count; i++) {
    const next = computeNextRunAt(schedule, cursor)
    runs.push(next)
    cursor = next
  }
  return runs
}

export const VALID_TIMEZONES_FALLBACK = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
] as const
