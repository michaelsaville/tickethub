'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { enqueueRequest } from '@/app/lib/sync-queue'

export function EditableTitle({
  ticketId,
  initialTitle,
}: {
  ticketId: string
  initialTitle: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialTitle)
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function start() {
    setDraft(title)
    setErr(null)
    setQueuedMsg(null)
    setEditing(true)
  }

  function cancel() {
    setDraft(title)
    setEditing(false)
    setErr(null)
  }

  function commit() {
    const next = draft.trim()
    if (!next) {
      setErr('Title cannot be empty')
      return
    }
    if (next.length > 200) {
      setErr('Title is too long (200 max)')
      return
    }
    if (next === title) {
      setEditing(false)
      return
    }
    setErr(null)
    setTitle(next)
    setEditing(false)
    startTransition(async () => {
      try {
        const res = await enqueueRequest({
          type: 'UPDATE_TITLE',
          entityType: 'TICKET',
          entityId: ticketId,
          url: `/api/tickets/${ticketId}/title`,
          body: { title: next },
          method: 'PATCH',
        })
        if (res.synced) {
          router.refresh()
        } else {
          setQueuedMsg('Offline — title queued.')
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed')
        setTitle(initialTitle)
      }
    })
  }

  if (editing) {
    return (
      <div className="flex flex-1 items-baseline gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={commit}
          maxLength={200}
          disabled={isPending}
          className="th-input flex-1 font-mono text-2xl text-slate-100"
        />
      </div>
    )
  }

  return (
    <div className="group flex flex-1 items-baseline gap-2">
      <h1
        onClick={start}
        title="Click to edit"
        className="cursor-text font-mono text-2xl text-slate-100 hover:text-accent/90"
      >
        {title}
      </h1>
      <button
        type="button"
        onClick={start}
        title="Edit title"
        className="text-xs text-th-text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
        aria-label="Edit ticket title"
      >
        ✎
      </button>
      {err && (
        <span className="ml-2 text-xs text-priority-urgent">{err}</span>
      )}
      {queuedMsg && (
        <span className="ml-2 text-xs text-amber-300">{queuedMsg}</span>
      )}
    </div>
  )
}
