'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])
const VALID_ROLES = [
  'GLOBAL_ADMIN',
  'TICKETHUB_ADMIN',
  'DISPATCHER',
  'TECH',
  'VIEWER',
] as const

export type UserActionResult = { ok: true } | { ok: false; error: string }

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' } as const
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' } as const
  }
  return { ok: true, userId: session.user.id } as const
}

export async function updateUserRole(
  userId: string,
  role: string,
): Promise<UserActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return { ok: false, error: 'Invalid role' }
  }
  if (userId === auth.userId && role !== 'GLOBAL_ADMIN' && role !== 'TICKETHUB_ADMIN') {
    return { ok: false, error: 'You cannot demote yourself' }
  }
  try {
    await prisma.tH_User.update({ where: { id: userId }, data: { role } })
    revalidatePath('/settings/users')
    return { ok: true }
  } catch (e) {
    console.error('[actions/users] updateRole failed', e)
    return { ok: false, error: 'Failed to update role' }
  }
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<UserActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (userId === auth.userId && !isActive) {
    return { ok: false, error: 'You cannot deactivate yourself' }
  }
  try {
    await prisma.tH_User.update({ where: { id: userId }, data: { isActive } })
    revalidatePath('/settings/users')
    return { ok: true }
  } catch (e) {
    console.error('[actions/users] setActive failed', e)
    return { ok: false, error: 'Failed to update user' }
  }
}

export async function updateHourlyRate(
  userId: string,
  rateCents: number | null,
): Promise<UserActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (rateCents !== null && (!Number.isFinite(rateCents) || rateCents < 0)) {
    return { ok: false, error: 'Invalid rate' }
  }
  try {
    await prisma.tH_User.update({
      where: { id: userId },
      data: { hourlyRate: rateCents },
    })
    revalidatePath('/settings/users')
    return { ok: true }
  } catch (e) {
    console.error('[actions/users] updateRate failed', e)
    return { ok: false, error: 'Failed to update rate' }
  }
}
