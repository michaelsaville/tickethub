import 'server-only'
import { prisma } from '@/app/lib/prisma'

export interface OnCallEntry {
  shiftId: string
  userId: string
  name: string
  email: string
  endsAt: Date
  source: string
}

/**
 * Returns the user currently on call (`startsAt <= now < endsAt`). Picks
 * the most recently created matching shift so manual override rows beat
 * generated rotation rows. Returns null when nobody is on the schedule.
 */
export async function getCurrentOnCall(at: Date = new Date()): Promise<OnCallEntry | null> {
  const shift = await prisma.tH_OnCallShift.findFirst({
    where: {
      startsAt: { lte: at },
      endsAt: { gt: at },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })
  if (!shift) return null
  return {
    shiftId: shift.id,
    userId: shift.user.id,
    name: shift.user.name,
    email: shift.user.email,
    endsAt: shift.endsAt,
    source: shift.source,
  }
}

/**
 * Generate weekly shifts rotating between the given userIds, starting
 * at `startsAt` (UTC) and producing `weeks` rows of length 1 week each.
 * Existing rows in the time window are NOT removed — caller can clear
 * the window first if a clean re-generation is wanted.
 */
export async function generateWeeklyRotation(args: {
  userIds: string[]
  startsAt: Date
  weeks: number
  label?: string
}): Promise<{ created: number }> {
  if (args.userIds.length === 0 || args.weeks <= 0) {
    return { created: 0 }
  }
  const rows = Array.from({ length: args.weeks }, (_, i) => {
    const start = new Date(args.startsAt)
    start.setDate(start.getDate() + i * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return {
      userId: args.userIds[i % args.userIds.length],
      startsAt: start,
      endsAt: end,
      label: args.label ?? 'weekly rotation',
      source: 'rotation',
    }
  })
  const result = await prisma.tH_OnCallShift.createMany({ data: rows })
  return { created: result.count }
}
