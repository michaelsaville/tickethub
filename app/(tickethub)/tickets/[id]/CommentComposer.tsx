'use client'

import { useState, useTransition } from 'react'
import { addComment } from '@/app/lib/actions/tickets'

export function CommentComposer({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!body.trim()) return
    setErr(null)
    startTransition(async () => {
      const res = await addComment(ticketId, body, isInternal)
      if (!res.ok) {
        setErr(res.error ?? 'Failed')
        return
      }
      setBody('')
    })
  }

  return (
    <div className="th-card">
      <div className="mb-2 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setIsInternal(false)}
          className={
            !isInternal
              ? 'font-mono text-[10px] uppercase tracking-wider text-accent'
              : 'font-mono text-[10px] uppercase tracking-wider text-th-text-muted hover:text-slate-300'
          }
        >
          Public Reply
        </button>
        <button
          type="button"
          onClick={() => setIsInternal(true)}
          className={
            isInternal
              ? 'font-mono text-[10px] uppercase tracking-wider text-accent'
              : 'font-mono text-[10px] uppercase tracking-wider text-th-text-muted hover:text-slate-300'
          }
        >
          Internal Note
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className={
          isInternal
            ? 'th-input resize-y border-accent/40 bg-accent/5'
            : 'th-input resize-y'
        }
        placeholder={
          isInternal
            ? 'Notes visible only to staff…'
            : 'Reply — visible to the client…'
        }
      />
      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !body.trim()}
          className="th-btn-primary"
        >
          {isPending ? 'Posting…' : isInternal ? 'Post Internal Note' : 'Post Reply'}
        </button>
      </div>
    </div>
  )
}
