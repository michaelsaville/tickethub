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
import {
  listMentionableUsers,
  type MentionUserDTO,
} from '@/app/lib/actions/mentions'
import { CannedReplyPicker } from './CannedReplyPicker'
import { MentionPicker } from './MentionPicker'

type TriggerInfo = { query: string; start: number; end: number }

function detectCannedTrigger(text: string, caret: number): TriggerInfo | null {
  const before = text.slice(0, caret)
  const lineStart = before.lastIndexOf('\n') + 1
  const lineBefore = text.slice(lineStart, caret)
  if (!lineBefore.startsWith('/')) return null
  if (/\s/.test(lineBefore.slice(1))) return null
  return { query: lineBefore.slice(1), start: lineStart, end: caret }
}

function detectMentionTrigger(text: string, caret: number): TriggerInfo | null {
  const before = text.slice(0, caret)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  if (atIdx > 0) {
    const prev = before[atIdx - 1]
    if (!/[\s([{,]/.test(prev)) return null
  }
  const q = before.slice(atIdx + 1)
  if (/\s/.test(q)) return null
  if (q.length > 50) return null
  return { query: q, start: atIdx, end: caret }
}

export function CommentComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState('')
  const [isInternal, setIsInternalState] = useState(false)
  // Restore last-used reply mode from localStorage so techs who default
  // to internal notes don't have to re-toggle on every ticket.
  useEffect(() => {
    try {
      if (localStorage.getItem('th:commentMode') === 'internal') {
        setIsInternalState(true)
      }
    } catch {
      // Private browsing — silent.
    }
  }, [])
  function setIsInternal(next: boolean) {
    setIsInternalState(next)
    try {
      localStorage.setItem('th:commentMode', next ? 'internal' : 'public')
    } catch {
      // Silent.
    }
  }
  const [err, setErr] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [replies, setReplies] = useState<CannedReplyDTO[]>([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [repliesLoading, setRepliesLoading] = useState(false)

  const [users, setUsers] = useState<MentionUserDTO[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)

  const [cannedTrigger, setCannedTrigger] = useState<TriggerInfo | null>(null)
  const [mentionTrigger, setMentionTrigger] = useState<TriggerInfo | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [pastingCount, setPastingCount] = useState(0)

  const filteredReplies = useMemo(() => {
    if (!cannedTrigger) return []
    const q = cannedTrigger.query.toLowerCase()
    if (!q) return replies.slice(0, 6)
    return replies
      .filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [cannedTrigger, replies])

  const filteredUsers = useMemo(() => {
    if (!mentionTrigger) return []
    const q = mentionTrigger.query.toLowerCase()
    if (!q) return users.slice(0, 6)
    return users
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [mentionTrigger, users])

  useEffect(() => {
    setHighlightIndex(0)
  }, [cannedTrigger?.query, mentionTrigger?.query])

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

  async function ensureUsersLoaded() {
    if (usersLoaded || usersLoading) return
    setUsersLoading(true)
    try {
      const list = await listMentionableUsers()
      setUsers(list)
    } catch {
      // Silent — picker just shows empty if list never loads.
    } finally {
      setUsersLoaded(true)
      setUsersLoading(false)
    }
  }

  function refreshTriggers(text: string, caret: number) {
    const ct = detectCannedTrigger(text, caret)
    if (ct) {
      setCannedTrigger(ct)
      setMentionTrigger(null)
      ensureRepliesLoaded()
      return
    }
    const mt = detectMentionTrigger(text, caret)
    if (mt) {
      setMentionTrigger(mt)
      setCannedTrigger(null)
      ensureUsersLoaded()
      return
    }
    setCannedTrigger(null)
    setMentionTrigger(null)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setBody(v)
    const caret = e.target.selectionStart ?? v.length
    refreshTriggers(v, caret)
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    const caret = ta.selectionStart ?? ta.value.length
    refreshTriggers(ta.value, caret)
  }

  function insertCannedReply(reply: CannedReplyDTO) {
    if (!cannedTrigger) return
    const before = body.slice(0, cannedTrigger.start)
    const after = body.slice(cannedTrigger.end)
    const next = before + reply.body + after
    setBody(next)
    setCannedTrigger(null)
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

  function insertMention(user: MentionUserDTO) {
    if (!mentionTrigger) return
    const before = body.slice(0, mentionTrigger.start)
    const after = body.slice(mentionTrigger.end)
    const insertion = `@${user.name} `
    const next = before + insertion + after
    setBody(next)
    setMentionTrigger(null)
    const caretPos = before.length + insertion.length
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(caretPos, caretPos)
      }
    })
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) imageFiles.push(f)
      }
    }
    if (imageFiles.length === 0) return
    e.preventDefault()

    const ta = textareaRef.current
    const caret = ta?.selectionStart ?? body.length
    let nextBody = body
    let cursorAt = caret
    setPastingCount((c) => c + imageFiles.length)
    setErr(null)

    for (const file of imageFiles) {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      const ext = file.type.split('/')[1] || 'png'
      const named =
        file.name && file.name !== 'image.png'
          ? file
          : new File([file], `pasted-${stamp}.${ext}`, { type: file.type })

      // Drop a placeholder marker at the caret while uploading.
      const placeholder = `[Pasted: ${named.name} — uploading…]\n`
      const before = nextBody.slice(0, cursorAt)
      const after = nextBody.slice(cursorAt)
      nextBody = before + placeholder + after
      cursorAt = before.length + placeholder.length
      setBody(nextBody)

      try {
        const fd = new FormData()
        fd.append('file', named)
        const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
          method: 'POST',
          body: fd,
        })
        const ct = res.headers.get('content-type') ?? ''
        if (!res.ok || !ct.includes('application/json')) {
          throw new Error(
            res.status === 413
              ? 'Image too large for the server'
              : `Upload failed (${res.status})`,
          )
        }
        const json = (await res.json()) as { error?: string }
        if (json.error) throw new Error(json.error)

        const replacement = `[Pasted: ${named.name}]\n`
        nextBody = nextBody.replace(placeholder, replacement)
        cursorAt = cursorAt - placeholder.length + replacement.length
        setBody(nextBody)
      } catch (uploadErr) {
        const msg =
          uploadErr instanceof Error ? uploadErr.message : 'upload failed'
        setErr(msg)
        nextBody = nextBody.replace(placeholder, `[Paste failed: ${msg}]\n`)
        setBody(nextBody)
      } finally {
        setPastingCount((c) => Math.max(0, c - 1))
      }
    }

    // Refresh server-rendered attachments list.
    router.refresh()
    requestAnimationFrame(() => {
      const t = textareaRef.current
      if (t) {
        t.focus()
        t.setSelectionRange(cursorAt, cursorAt)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (cannedTrigger) {
      handlePickerKey(
        e,
        filteredReplies,
        (r) => insertCannedReply(r),
        () => setCannedTrigger(null),
      )
      return
    }
    if (mentionTrigger) {
      handlePickerKey(
        e,
        filteredUsers,
        (u) => insertMention(u),
        () => setMentionTrigger(null),
      )
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  function handlePickerKey<T>(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    items: T[],
    onSelect: (item: T) => void,
    onClose: () => void,
  ) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) =>
        items.length === 0 ? 0 : Math.min(items.length - 1, i + 1),
      )
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (items.length > 0) {
        e.preventDefault()
        onSelect(items[highlightIndex])
      } else {
        onClose()
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
        setCannedTrigger(null)
        setMentionTrigger(null)
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
          title="Type / for saved replies, @ to mention a teammate"
        >
          / saved · @ mention
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
        data-comment-composer
        value={body}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        onPaste={handlePaste}
        onFocus={() => {
          ensureRepliesLoaded()
          ensureUsersLoaded()
        }}
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
      {cannedTrigger && (
        <CannedReplyPicker
          replies={filteredReplies}
          highlightIndex={highlightIndex}
          onSelect={insertCannedReply}
          onHover={setHighlightIndex}
          loading={repliesLoading && filteredReplies.length === 0}
        />
      )}
      {mentionTrigger && (
        <MentionPicker
          users={filteredUsers}
          highlightIndex={highlightIndex}
          onSelect={insertMention}
          onHover={setHighlightIndex}
          loading={usersLoading && filteredUsers.length === 0}
        />
      )}
      {pastingCount > 0 && (
        <div className="mt-2 rounded-md border border-th-border bg-th-elevated px-3 py-1.5 text-xs text-th-text-secondary">
          Uploading {pastingCount} pasted image
          {pastingCount === 1 ? '' : 's'}…
        </div>
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
