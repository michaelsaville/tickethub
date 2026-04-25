'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type IcsTokenInfo =
  | { ok: true; token: string | null }
  | { ok: false; error: string }

async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session
}

export async function getMyIcsToken(): Promise<IcsTokenInfo> {
  const session = await requireSession()
  if (!session) return { ok: false, error: 'Unauthorized' }
  const u = await prisma.tH_User.findUnique({
    where: { id: session.user.id },
    select: { icsToken: true },
  })
  return { ok: true, token: u?.icsToken ?? null }
}

export async function regenerateIcsToken(): Promise<IcsTokenInfo> {
  const session = await requireSession()
  if (!session) return { ok: false, error: 'Unauthorized' }
  // 32 bytes hex = 64 chars. Plenty of entropy. Cheap re-roll on revoke.
  const token = crypto.randomBytes(32).toString('hex')
  try {
    await prisma.tH_User.update({
      where: { id: session.user.id },
      data: { icsToken: token },
    })
    revalidatePath('/settings/calendar-feed')
    return { ok: true, token }
  } catch (e) {
    console.error('[calendar-feed] regenerate failed', e)
    return { ok: false, error: 'Failed to generate token' }
  }
}

export async function revokeIcsToken(): Promise<IcsTokenInfo> {
  const session = await requireSession()
  if (!session) return { ok: false, error: 'Unauthorized' }
  try {
    await prisma.tH_User.update({
      where: { id: session.user.id },
      data: { icsToken: null },
    })
    revalidatePath('/settings/calendar-feed')
    return { ok: true, token: null }
  } catch (e) {
    console.error('[calendar-feed] revoke failed', e)
    return { ok: false, error: 'Failed to revoke token' }
  }
}
