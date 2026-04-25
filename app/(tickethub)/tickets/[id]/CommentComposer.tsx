'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { enqueueRequest } from '@/app/lib/sync-queue'
import { addPendingComment } from '@/app/lib/pending-comments-store'
import { useVoiceInput } from '@/app/hooks/useVoiceInput'
import {
  listCannedReplies,
  incrementCannedReplyUse,
  type CannedReplyDTO,
} from '@/app/lib/actions/canned-replies'
import { CannedReplyPicker } from './CannedReplyPicker'

type TriggerInfo = { query: string; start: number; end: number }

function detectTrigger(text: string, caret: number): TriggerInfo | null {
  const before = text.slice(0, caret)
  const lineStart = before.lastIndexOf('\n') + 1
  const lineBefore = text.slice(lineStart, caret)
  if (!lineBefore.startsWith('/')) return null
  if (/\s/.test(lineBefore.slice(1))) return null
  return {
    query: lineBefore.slice(1),
    start: lineStart,
    end: caret,
  }
}

export function CommentComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [replies, setReplies] = useState<CannedReplyDTO[]>([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [repliesLoading, setRepliesLoading] = useState(false)
  const [trigger, setTrigger] = useState<TriggerInfo | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const filtered = useMemo(() => {
    if (!trigger) return []
    const q = trigger.query.toLowerCase()
    if (!q) return replies.slice(0, 6)
    return replies
      .filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [trigger, replies])

  useEffect(() => {
    setHighlightIndex(0)
  }, [trigger?.query])

  const voice = useVoiceInput((chunk) => {
    setBody((prev) => (prev ? `${prev} ${chunk}` : chunk))
  })

  async function ensureRepliesLoaded() {
    if (repliesLoaded || repliesLoading) return
    setRepliesLoading(true)
    try {
      const list = await listCannedReplies()
      setReplies(list)
    } catch {
      // Silent — picker still works once user has none.
    } finally {
      setRepliesLoaded(true)
      setRepliesLoading(false)
    }
  }

  function refreshTrigger(text: string, caret: number) {
    const t = detectTrigger(text, caret)
    setTrigger(t)
    if (t) ensureRepliesLoaded()
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setBody(v)
    const caret = e.target.selectionStart ?? v.length
    refreshTrigger(v, caret)
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    const caret = ta.selectionStart ?? ta.value.length
    refreshTrigger(ta.value, caret)
  }

  function insertReply(reply: CannedReplyDTO) {
    if (!trigger) return
    const before = body.slice(0, trigger.start)
    const after = body.slice(trigger.end)
    const next = before + reply.body + after
    setBody(next)
    setTrigger(null)
    incrementCannedReplyUse(reply.id).catch(() => {})
    const caretPos = before.length + reply.body.length
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(caretPos, caretPos)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!trigger) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setTrigger(null)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (filtered.length === 0 ? 0 : Math.min(filtered.length - 1, i + 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered.length > 0) {
        e.preventDefault()
        insertReply(filtered[highlightIndex])
      } else {
        setTrigger(null)
      }
    }
  }

  function submit() {
    if (!body.trim()) return
    setErr(null)
    setQueuedMsg(null)
    const pending = body
    const pendingInternal = isInternal
    startTransition(async () => {
      try {
        const res = await enqueueRequest({
          type: 'ADD_COMMENT',
          entityType: 'TICKET',
          entityId: ticketId,
          url: `/api/tickets/${ticketId}/comments`,
          body: { body: pending, isInternal: pendingInternal },
        })
        setBody('')
        setTrigger(null)
        if (res.synced) {
          router.refresh()
        } else {
          addPendingComment({
            clientOpId: res.clientOpId,
            ticketId,
            body: pending,
            isInternal: pendingInternal,
            createdAt: Date.now(),
          })
          setQueuedMsg('Saved offline — will send when reconnected.')
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed')
      }
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
        <span
          className="hidden font-mono text-[10px] uppercase tracking-wider text-th-text-muted md:inline"
          title="Type / at the start of a line to insert a saved reply"
        >
          / for saved
        </span>
        <div className="ml-auto">
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              className={
                voice.listening
                  ? 'rounded-full bg-priority-urgent/20 px-3 py-1 text-xs text-priority-urgent animate-pulse'
                  : 'rounded-full border border-th-border px-3 py-1 text-xs text-th-text-secondary hover:border-accent/40 hover:text-accent'
              }
              title={voice.listening ? 'Stop dictation' : 'Dictate with voice'}
            >
              🎙 {voice.listening ? 'Listening…' : 'Dictate'}
            </button>
          )}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        onFocus={() => ensureRepliesLoaded()}
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
      {trigger && (
        <CannedReplyPicker
          replies={filtered}
          highlightIndex={highlightIndex}
          onSelect={insertReply}
          onHover={setHighlightIndex}
          loading={repliesLoading && filtered.length === 0}
        />
      )}
      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}
      {queuedMsg && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          {queuedMsg}
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
