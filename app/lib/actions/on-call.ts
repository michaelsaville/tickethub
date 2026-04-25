'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { generateWeeklyRotation } from '@/app/lib/on-call'

async function requireAdmin() {
  const { session, error } = await requireAuth()
  if (error || !session) throw new Error('Not authenticated')
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    throw new Error('Forbidden')
  }
  return session
}

export async function createOnCallShift(input: {
  userId: string
  startsAt: string
  endsAt: string
  label?: string
  source?: 'rotation' | 'override'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: 'Invalid date' }
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: 'endsAt must be after startsAt' }
  }
  await prisma.tH_OnCallShift.create({
    data: {
      userId: input.userId,
      startsAt,
      endsAt,
      label: input.label?.trim() || null,
      source: input.source ?? 'override',
    },
  })
  revalidatePath('/settings/on-call')
  return { ok: true }
}

export async function deleteOnCallShift(
  shiftId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  await prisma.tH_OnCallShift.delete({ where: { id: shiftId } })
  revalidatePath('/settings/on-call')
  return { ok: true }
}

export async function generateRotation(input: {
  userIds: string[]
  startsAt: string
  weeks: number
  label?: string
}): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  await requireAdmin()
  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: 'Invalid start date' }
  }
  if (input.userIds.length === 0) {
    return { ok: false, error: 'Pick at least one user' }
  }
  if (input.weeks < 1 || input.weeks > 104) {
    return { ok: false, error: 'Weeks must be 1–104' }
  }
  const result = await generateWeeklyRotation({
    userIds: input.userIds,
    startsAt,
    weeks: input.weeks,
    label: input.label,
  })
  revalidatePath('/settings/on-call')
  return { ok: true, created: result.created }
}

export async function clearFutureRotation(): Promise<{ ok: true; deleted: number }> {
  await requireAdmin()
  const result = await prisma.tH_OnCallShift.deleteMany({
    where: { source: 'rotation', startsAt: { gt: new Date() } },
  })
  revalidatePath('/settings/on-call')
  return { ok: true, deleted: result.count }
}
