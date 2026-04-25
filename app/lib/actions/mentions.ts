'use server'

import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type MentionUserDTO = {
  id: string
  name: string
  email: string
}

/**
 * List active users for the @mention picker. Includes everyone — including
 * the requesting user — because the picker is purely client-side UX. The
 * server-side mention parser excludes the comment author when dispatching
 * notifications.
 */
export async function listMentionableUsers(): Promise<MentionUserDTO[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return []
  return prisma.tH_User.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  })
}
