'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type NotificationDTO = {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  url: string | null
  createdAt: string
  readAt: string | null
}

async function getSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session
}

function extractUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const url = (data as Record<string, unknown>).url
  return typeof url === 'string' ? url : null
}

export async function listMyNotifications(opts?: {
  unreadOnly?: boolean
  limit?: number
}): Promise<NotificationDTO[]> {
  const session = await getSession()
  if (!session) return []
  const rows = await prisma.tH_Notification.findMany({
    where: {
      userId: session.user.id,
      ...(opts?.unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 50,
  })
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    url: extractUrl(n.data),
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }))
}

export async function getMyUnreadNotificationCount(): Promise<number> {
  const session = await getSession()
  if (!session) return 0
  return prisma.tH_Notification.count({
    where: { userId: session.user.id, isRead: false },
  })
}

export async function markNotificationRead(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthorized' }
  try {
    const result = await prisma.tH_Notification.updateMany({
      where: { id, userId: session.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    if (result.count > 0) revalidatePath('/notifications')
    return { ok: true }
  } catch (e) {
    console.error('[actions/notifications] markRead failed', e)
    return { ok: false, error: 'Failed' }
  }
}

export async function markAllNotificationsRead(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthorized' }
  try {
    const result = await prisma.tH_Notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    revalidatePath('/notifications')
    return { ok: true, count: result.count }
  } catch (e) {
    console.error('[actions/notifications] markAllRead failed', e)
    return { ok: false, error: 'Failed' }
  }
}
