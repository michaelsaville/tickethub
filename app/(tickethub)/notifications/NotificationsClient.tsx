'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/app/lib/actions/notifications'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  url: string | null
  createdAt: string
}

export function MarkAllReadButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead()
          router.refresh()
        })
      }
      className="ml-auto th-btn-ghost text-xs"
    >
      {isPending ? 'Marking…' : 'Mark all read'}
    </button>
  )
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function markRead(id: string, refreshAfter: boolean) {
    startTransition(async () => {
      await markNotificationRead(id)
      if (refreshAfter) router.refresh()
    })
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const inner = (
          <div
            className={
              item.isRead
                ? 'th-card flex items-start gap-3 opacity-70 hover:opacity-90'
                : 'th-card flex items-start gap-3 border-l-4 border-l-accent'
            }
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium text-slate-100">
                  {item.title}
                </span>
                <span className="rounded-full bg-th-elevated px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-th-text-muted">
                  {item.type}
                </span>
                <span className="ml-auto text-[10px] text-th-text-muted">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-th-text-secondary">
                {item.body}
              </p>
            </div>
          </div>
        )
        if (item.url) {
          return (
            <li key={item.id}>
              <a
                href={item.url}
                onClick={() => {
                  if (!item.isRead) markRead(item.id, false)
                }}
                className="block"
              >
                {inner}
              </a>
            </li>
          )
        }
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (!item.isRead) markRead(item.id, true)
              }}
              disabled={isPending || item.isRead}
              className="block w-full text-left disabled:cursor-default"
            >
              {inner}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
