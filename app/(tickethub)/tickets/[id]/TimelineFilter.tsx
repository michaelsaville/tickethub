'use client'

import { useEffect, useState } from 'react'

export type TimelineComment = {
  id: string
  body: string
  isInternal: boolean
  createdAt: string
  author: { name: string }
}

export type TimelineEvent = {
  id: string
  type: string
  data: unknown
  createdAt: string
  user: { name: string } | null
}

type Mode = 'all' | 'comments' | 'activity'

const STORAGE_KEY = 'th:timelineFilter'

export function TimelineFilter({
  comments,
  events,
}: {
  comments: TimelineComment[]
  events: TimelineEvent[]
}) {
  const [mode, setMode] = useState<Mode>('all')
  const [hydrated, setHydrated] = useState(false)

  // Restore last-used filter from localStorage so the user's choice
  // persists across tickets and sessions.
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === 'all' || v === 'comments' || v === 'activity') {
        setMode(v)
      }
    } catch {
      // Private browsing / quota exceeded — silent.
    }
    setHydrated(true)
  }, [])

  function pick(next: Mode) {
    setMode(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Silent.
    }
  }

  type Entry =
    | { kind: 'comment'; at: number; data: TimelineComment }
    | { kind: 'event'; at: number; data: TimelineEvent }

  const entries: Entry[] = []
  if (mode !== 'activity') {
    for (const c of comments) {
      entries.push({ kind: 'comment', at: new Date(c.createdAt).getTime(), data: c })
    }
  }
  if (mode !== 'comments') {
    for (const e of events) {
      entries.push({ kind: 'event', at: new Date(e.createdAt).getTime(), data: e })
    }
  }
  entries.sort((a, b) => a.at - b.at)

  const counts = {
    all: comments.length + events.length,
    comments: comments.length,
    activity: events.length,
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-1">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'comments', label: 'Comments' },
            { id: 'activity', label: 'Activity' },
          ] as { id: Mode; label: string }[]
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pick(p.id)}
            className={
              mode === p.id
                ? 'rounded-full bg-accent/20 px-2.5 py-0.5 text-xs text-accent'
                : 'rounded-full px-2.5 py-0.5 text-xs text-th-text-secondary hover:bg-th-elevated'
            }
            aria-pressed={mode === p.id}
          >
            {p.label}{' '}
            <span className="text-th-text-muted">{counts[p.id]}</span>
          </button>
        ))}
      </div>
      {!hydrated || entries.length === 0 ? (
        <p className="text-xs text-th-text-muted">
          {mode === 'comments'
            ? 'No comments yet.'
            : mode === 'activity'
              ? 'No activity events yet.'
              : 'No activity yet. Add the first comment below.'}
        </p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry, i) => (
            <li key={`${entry.kind}-${entry.data.id}-${i}`} className="flex gap-3">
              <div className="mt-1 h-2 w-2 flex-none rounded-full bg-accent/60" />
              <div className="flex-1 text-sm">
                {entry.kind === 'comment' ? (
                  <CommentRow comment={entry.data} />
                ) : (
                  <EventRow event={entry.data} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function CommentRow({ comment }: { comment: TimelineComment }) {
  return (
    <div
      className={
        comment.isInternal
          ? 'rounded-md border border-accent/30 bg-accent/5 p-3'
          : 'rounded-md border border-th-border bg-th-base p-3'
      }
    >
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium text-slate-200">{comment.author.name}</span>
        {comment.isInternal && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
            Internal
          </span>
        )}
        <span className="ml-auto text-th-text-muted">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
        {comment.body}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: TimelineEvent }) {
  const data = (event.data ?? {}) as Record<string, unknown>
  let label = event.type
  if (event.type === 'STATUS_CHANGE') {
    label = `Status: ${String(data.from)} → ${String(data.to)}`
  } else if (event.type === 'PRIORITY_CHANGE') {
    label = `Priority: ${String(data.from)} → ${String(data.to)}`
  } else if (event.type === 'ASSIGNED') {
    label = data.to ? `Assigned` : `Unassigned`
  } else if (event.type === 'CREATED') {
    label = 'Ticket created'
  } else if (event.type === 'TITLE_CHANGE') {
    label = `Title changed`
  } else if (event.type === 'MENTION') {
    label = `Mentioned a teammate`
  } else if (event.type === 'MERGE_INTO') {
    const num = data.fromTicketNumber
    label = num != null ? `Merged in #${String(num)}` : 'Merged in another ticket'
  } else if (event.type === 'MERGED_AWAY') {
    const num = data.toTicketNumber
    label = num != null ? `Merged into #${String(num)}` : 'Merged into another ticket'
  } else if (event.type === 'CUSTOM_FIELD_CHANGED') {
    label = `Custom field: ${String(data.label ?? data.key ?? '')}`
  }
  return (
    <div className="text-xs text-th-text-secondary">
      <span className="text-slate-300">{event.user?.name ?? 'System'}</span>{' '}
      <span>· {label}</span>
      <span className="ml-2 text-th-text-muted">
        {new Date(event.createdAt).toLocaleString()}
      </span>
    </div>
  )
}
