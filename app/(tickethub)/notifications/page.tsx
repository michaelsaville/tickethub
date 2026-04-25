import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { MarkAllReadButton, NotificationList } from './NotificationsClient'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ filter?: string }>

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const params = await searchParams
  const unreadOnly = params.filter === 'unread'
  const myId = session!.user.id

  const [rows, unreadCount] = await Promise.all([
    prisma.tH_Notification.findMany({
      where: {
        userId: myId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.tH_Notification.count({
      where: { userId: myId, isRead: false },
    }),
  ])

  const items = rows.map((n) => {
    let url: string | null = null
    if (n.data && typeof n.data === 'object' && !Array.isArray(n.data)) {
      const u = (n.data as Record<string, unknown>).url
      if (typeof u === 'string') url = u
    }
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      url,
      createdAt: n.createdAt.toISOString(),
    }
  })

  return (
    <div className="p-6">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="font-mono text-2xl text-slate-100">Notifications</h1>
        <div className="flex items-center gap-1 rounded-md border border-th-border bg-th-surface p-0.5 text-xs">
          <Link
            href="/notifications"
            className={
              !unreadOnly
                ? 'rounded bg-accent/20 px-3 py-1 text-accent'
                : 'rounded px-3 py-1 text-th-text-muted hover:text-slate-200'
            }
          >
            All
          </Link>
          <Link
            href="/notifications?filter=unread"
            className={
              unreadOnly
                ? 'rounded bg-accent/20 px-3 py-1 text-accent'
                : 'rounded px-3 py-1 text-th-text-muted hover:text-slate-200'
            }
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Link>
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </header>

      {items.length === 0 ? (
        <div className="th-card text-center text-sm text-th-text-secondary">
          {unreadOnly
            ? 'No unread notifications.'
            : 'No notifications yet — you’ll see assigned tickets, @mentions, SLA alerts, and more here.'}
        </div>
      ) : (
        <NotificationList items={items} />
      )}
    </div>
  )
}
