'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type WorkingHoursResult = { ok: true } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export interface DaySchedule {
  dayOfWeek: number // 0=Sun … 6=Sat
  startTime: string // "08:00"
  endTime: string   // "17:00"
  isWorkingDay: boolean
}

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { dayOfWeek: 0, startTime: '08:00', endTime: '17:00', isWorkingDay: false },
  { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isWorkingDay: true },
  { dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isWorkingDay: true },
  { dayOfWeek: 3, startTime: '08:00', endTime: '17:00', isWorkingDay: true },
  { dayOfWeek: 4, startTime: '08:00', endTime: '17:00', isWorkingDay: true },
  { dayOfWeek: 5, startTime: '08:00', endTime: '17:00', isWorkingDay: true },
  { dayOfWeek: 6, startTime: '08:00', endTime: '17:00', isWorkingDay: false },
]

/** Get working hours for a tech. Returns defaults if none configured. */
export async function getWorkingHours(userId: string): Promise<DaySchedule[]> {
  const rows = await prisma.tH_WorkingHours.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' },
  })

  if (rows.length === 0) return DEFAULT_SCHEDULE

  return DEFAULT_SCHEDULE.map((def) => {
    const row = rows.find((r) => r.dayOfWeek === def.dayOfWeek)
    return row
      ? { dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime, isWorkingDay: row.isWorkingDay }
      : def
  })
}

/** Get working hours for all active techs (batch query for dispatch grid). */
export async function getAllWorkingHours(): Promise<Record<string, DaySchedule[]>> {
  const techs = await prisma.tH_User.findMany({
    where: { isActive: true },
    select: { id: true },
  })
  const all = await prisma.tH_WorkingHours.findMany({
    where: { userId: { in: techs.map((t) => t.id) } },
    orderBy: { dayOfWeek: 'asc' },
  })

  const result: Record<string, DaySchedule[]> = {}
  for (const tech of techs) {
    const rows = all.filter((r) => r.userId === tech.id)
    result[tech.id] = DEFAULT_SCHEDULE.map((def) => {
      const row = rows.find((r) => r.dayOfWeek === def.dayOfWeek)
      return row
        ? { dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime, isWorkingDay: row.isWorkingDay }
        : def
    })
  }
  return result
}

/** Update working hours for a tech. Upserts all 7 days. */
export async function updateWorkingHours(
  targetUserId: string,
  schedule: DaySchedule[],
): Promise<WorkingHoursResult> {
  const sessionUserId = await getUserId()
  if (!sessionUserId) return { ok: false, error: 'Unauthorized' }

  // Validate
  for (const day of schedule) {
    if (day.dayOfWeek < 0 || day.dayOfWeek > 6) {
      return { ok: false, error: `Invalid dayOfWeek: ${day.dayOfWeek}` }
    }
    if (!/^\d{2}:\d{2}$/.test(day.startTime) || !/^\d{2}:\d{2}$/.test(day.endTime)) {
      return { ok: false, error: `Invalid time format for day ${day.dayOfWeek}` }
    }
  }

  await prisma.$transaction(
    schedule.map((day) =>
      prisma.tH_WorkingHours.upsert({
        where: { userId_dayOfWeek: { userId: targetUserId, dayOfWeek: day.dayOfWeek } },
        create: {
          userId: targetUserId,
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          isWorkingDay: day.isWorkingDay,
        },
        update: {
          startTime: day.startTime,
          endTime: day.endTime,
          isWorkingDay: day.isWorkingDay,
        },
      }),
    ),
  )

  revalidatePath('/settings/working-hours')
  revalidatePath('/schedule')
  return { ok: true }
}
