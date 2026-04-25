import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import {
  computeNextRunAt,
  type ScheduleInput,
} from '@/app/lib/recurring-tickets'
import { spawnFromTemplate } from '@/app/lib/actions/recurring-tickets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Picks up active templates whose nextRunAt has passed and spawns one
 * ticket per template. Designed to run hourly (cron) — it's idempotent
 * over single firings because nextRunAt advances after each spawn.
 *
 * If multiple cron firings have been missed (e.g., container down for a
 * day), each due template still spawns ONE ticket and snaps nextRunAt
 * forward to the next future occurrence — we never replay missed runs.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const due = await prisma.tH_RecurringTicketTemplate.findMany({
    where: {
      active: true,
      nextRunAt: { lte: now },
    },
  })

  const spawned: Array<{
    templateId: string
    name: string
    ticketId: string
    ticketNumber: number
    nextRunAt: string
  }> = []
  const errors: Array<{ templateId: string; name: string; error: string }> = []

  for (const t of due) {
    try {
      // Pass the template's scheduled time (nextRunAt) as the appointment
      // anchor — that's what the user picked, not the cron firing time.
      const result = await spawnFromTemplate(t.id, t.createdById, {
        appointmentStart: t.nextRunAt,
      })
      if (!result.ok) {
        errors.push({ templateId: t.id, name: t.name, error: result.error })
        continue
      }

      const schedule: ScheduleInput = {
        frequency: t.frequency,
        interval: t.interval,
        dayOfWeek: t.dayOfWeek,
        dayOfMonth: t.dayOfMonth,
        hourOfDay: t.hourOfDay,
        minuteOfHour: t.minuteOfHour,
        timezone: t.timezone,
      }
      const nextRunAt = computeNextRunAt(schedule, now)

      await prisma.tH_RecurringTicketTemplate.update({
        where: { id: t.id },
        data: {
          lastRunAt: now,
          runCount: { increment: 1 },
          nextRunAt,
        },
      })

      spawned.push({
        templateId: t.id,
        name: t.name,
        ticketId: result.ticketId,
        ticketNumber: result.ticketNumber,
        nextRunAt: nextRunAt.toISOString(),
      })
    } catch (e) {
      console.error(
        `[recurring-tickets cron] template ${t.id} (${t.name}) failed`,
        e,
      )
      errors.push({
        templateId: t.id,
        name: t.name,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({
    data: {
      checkedAt: now.toISOString(),
      total: due.length,
      spawnedCount: spawned.length,
      spawned,
      errors,
    },
    error: null,
  })
}
