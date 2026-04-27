'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { enqueueRequest } from '@/app/lib/sync-queue'

const MAX_LEN = 10_000

/**
 * Click-to-edit textarea for the ticket description. Mirrors the
 * EditableTitle component shape, with a few description-specific tweaks:
 *   - Empty-string is allowed (clearing the description)
 *   - Multi-line, so Enter inserts a newline; Cmd/Ctrl+Enter saves;
 *     Escape cancels (only when there are no unsaved changes — escape
 *     on dirty content would lose the user's typing)
 *   - Empty initial state still renders an "Add a description" affordance
 *     so the user can author one that wasn't typed at create time
 */
export function EditableDescription({
  ticketId,
  initialDescription,
}: {
  ticketId: string
  initialDescription: string | null
}) {
  const router = useRouter()
  const [description, setDescription] = useState<string | null>(initialDescription)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(initialDescription ?? '')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      taRef.current?.focus()
      // Place caret at end so existing content isn't auto-selected
      // (would-be a footgun: one keystroke wipes a paragraph)
      const el = taRef.current
      if (el) el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  function start() {
    setDraft(description ?? '')
    setErr(null)
    setQueuedMsg(null)
    setEditing(true)
  }

  function cancel() {
    if (draft !== (description ?? '')) {
      const ok = window.confirm('Discard your changes?')
      if (!ok) return
    }
    setDraft(description ?? '')
    setEditing(false)
    setErr(null)
  }

  function commit() {
    const next = draft.trim()
    const normalized = next === '' ? null : next
    if (next.length > MAX_LEN) {
      setErr(`Description is too long (${MAX_LEN.toLocaleString()} max)`)
      return
    }
    if (normalized === description) {
      setEditing(false)
      return
    }
    setErr(null)
    setDescription(normalized)
    setEditing(false)
    startTransition(async () => {
      try {
        const res = await enqueueRequest({
          type: 'UPDATE_DESCRIPTION',
          entityType: 'TICKET',
          entityId: ticketId,
          url: `/api/tickets/${ticketId}/description`,
          body: { description: normalized },
          method: 'PATCH',
        })
        if (res.synced) {
          router.refresh()
        } else {
          setQueuedMsg('Offline — description queued.')
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed')
        // Roll back the optimistic write
        setDescription(initialDescription)
      }
    })
  }

  if (editing) {
    return (
      <div className="th-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Description
          </div>
          <div className="text-[10px] text-th-text-muted">
            ⌘/Ctrl+Enter to save · Esc to cancel
          </div>
        </div>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          maxLength={MAX_LEN}
          disabled={isPending}
          rows={Math.max(4, Math.min(20, draft.split('\n').length + 1))}
          className="th-input w-full resize-y whitespace-pre-wrap text-sm text-slate-200"
          placeholder="What's the issue? Specs, steps to reproduce, anything that helps..."
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={isPending}
            className="th-btn-primary text-xs"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={isPending}
            className="th-btn-ghost text-xs"
          >
            Cancel
          </button>
          {err && (
            <span className="ml-2 text-xs text-priority-urgent">{err}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="th-card group">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Description
        </div>
        <button
          type="button"
          onClick={start}
          title="Edit description"
          className="text-xs text-th-text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
          aria-label="Edit ticket description"
        >
          ✎ edit
        </button>
      </div>
      {description ? (
        <div
          onClick={start}
          title="Click to edit"
          className="cursor-text whitespace-pre-wrap text-sm text-slate-200 hover:text-slate-100"
        >
          {description}
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-md border border-dashed border-th-border px-3 py-3 text-left text-xs text-th-text-muted hover:border-accent/40 hover:text-th-text-secondary"
        >
          + Add a description
        </button>
      )}
      {queuedMsg && (
        <div className="mt-2 text-xs text-amber-300">{queuedMsg}</div>
      )}
      {err && !queuedMsg && (
        <div className="mt-2 text-xs text-priority-urgent">{err}</div>
      )}
    </div>
  )
}
