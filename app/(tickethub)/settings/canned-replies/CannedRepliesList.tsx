'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  createCannedReply,
  updateCannedReply,
  deleteCannedReply,
  type CannedReplyResult,
} from '@/app/lib/actions/canned-replies'

type Reply = {
  id: string
  key: string
  title: string
  body: string
  category: string | null
  isShared: boolean
  ownerId: string | null
  useCount: number
  isOwn: boolean
}

export function CannedRepliesList({
  replies,
  isAdmin,
}: {
  replies: Reply[]
  isAdmin: boolean
}) {
  const [showForm, setShowForm] = useState(replies.length === 0)

  return (
    <div className="space-y-6">
      {showForm ? (
        <NewReplyForm
          onCancel={() => setShowForm(false)}
          isAdmin={isAdmin}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="th-btn-primary"
        >
          + New Reply
        </button>
      )}

      {replies.length === 0 ? (
        <div className="th-card text-center text-sm text-th-text-secondary">
          No saved replies yet. Add common ones — e.g. key{' '}
          <span className="font-mono text-accent">ack</span> for &ldquo;Hi,
          I&apos;ve received your ticket and will be in touch shortly.&rdquo;
        </div>
      ) : (
        <div className="space-y-2">
          {replies.map((r) => (
            <ReplyRow key={r.id} reply={r} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReplyRow({ reply, isAdmin }: { reply: Reply; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false)
  const [keyVal, setKeyVal] = useState(reply.key)
  const [title, setTitle] = useState(reply.title)
  const [body, setBody] = useState(reply.body)
  const [category, setCategory] = useState(reply.category ?? '')
  const [isShared, setIsShared] = useState(reply.isShared)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canEdit = reply.isOwn || isAdmin

  function save() {
    setErr(null)
    startTransition(async () => {
      const res = await updateCannedReply(reply.id, {
        key: keyVal,
        title,
        body,
        category: category || null,
        ...(isAdmin ? { isShared } : {}),
      })
      if (!res.ok) setErr(res.error)
      else setEditing(false)
    })
  }

  function del() {
    if (!confirm(`Delete canned reply "${reply.title}"?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteCannedReply(reply.id)
      if (!res.ok) setErr(res.error)
    })
  }

  if (editing) {
    return (
      <div className="th-card space-y-3">
        <div className="grid gap-3 md:grid-cols-[140px,1fr,1fr]">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Key
            </label>
            <input
              value={keyVal}
              onChange={(e) => setKeyVal(e.target.value)}
              className="th-input font-mono text-sm"
              maxLength={30}
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="th-input text-sm"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Category
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="th-input text-sm"
              maxLength={50}
              placeholder="(optional)"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={5000}
            className="th-input resize-y text-sm"
          />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs text-th-text-secondary">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
            />
            Shared with all techs
          </label>
        )}
        {err && (
          <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
            {err}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="th-btn-primary text-sm"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setKeyVal(reply.key)
              setTitle(reply.title)
              setBody(reply.body)
              setCategory(reply.category ?? '')
              setIsShared(reply.isShared)
              setErr(null)
            }}
            className="th-btn-ghost text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="th-card flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-accent">/{reply.key}</span>
          <span className="text-sm font-medium text-slate-100">
            {reply.title}
          </span>
          {reply.isShared && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
              Shared
            </span>
          )}
          {reply.category && (
            <span className="rounded-full bg-th-elevated px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              {reply.category}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-th-text-secondary">
          {reply.body}
        </p>
        <p className="mt-1 font-mono text-[10px] text-th-text-muted">
          Used {reply.useCount}×
        </p>
        {err && (
          <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={isPending}
            className="th-btn-ghost text-xs"
          >
            Edit
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={del}
            disabled={isPending}
            className="th-btn-ghost text-xs text-priority-urgent"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function NewReplyForm({
  onCancel,
  isAdmin,
}: {
  onCancel: () => void
  isAdmin: boolean
}) {
  const [state, formAction] = useFormState<CannedReplyResult | null, FormData>(
    createCannedReply,
    null,
  )

  return (
    <form action={formAction} className="th-card max-w-3xl space-y-4">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-accent">
        New Reply
      </h2>
      <div className="grid gap-3 md:grid-cols-[140px,1fr,1fr]">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Key
          </label>
          <input
            name="key"
            required
            placeholder="ack"
            className="th-input font-mono text-sm"
            maxLength={30}
            autoFocus
          />
          <p className="mt-1 text-[10px] text-th-text-muted">
            Lowercase, a–z 0–9 _ -
          </p>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Title
          </label>
          <input
            name="title"
            required
            placeholder="Acknowledge ticket"
            className="th-input text-sm"
            maxLength={100}
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Category
          </label>
          <input
            name="category"
            placeholder="Greetings (optional)"
            className="th-input text-sm"
            maxLength={50}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Body
        </label>
        <textarea
          name="body"
          required
          rows={5}
          maxLength={5000}
          placeholder="Hi, I've received your ticket and will be in touch shortly."
          className="th-input resize-y text-sm"
        />
        <p className="mt-1 text-xs text-th-text-muted">
          Plain text. Inserted when you type{' '}
          <span className="font-mono text-accent">/your-key</span> at the start
          of a line in the comment composer.
        </p>
      </div>
      {isAdmin && (
        <label className="flex items-center gap-2 text-xs text-th-text-secondary">
          <input
            type="checkbox"
            name="isShared"
            className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
          />
          Shared with all techs (admin only)
        </label>
      )}
      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {state.error}
        </div>
      )}
      {state && state.ok && (
        <div className="rounded-md border border-status-resolved/40 bg-status-resolved/10 px-3 py-2 text-sm text-status-resolved">
          Saved.
        </div>
      )}
      <div className="flex items-center gap-3">
        <AddButton />
        <button type="button" onClick={onCancel} className="th-btn-ghost">
          Done
        </button>
      </div>
    </form>
  )
}

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Adding…' : 'Add Reply'}
    </button>
  )
}
