'use client'

import { useState, useTransition } from 'react'
import { updateInboundForwardEmails } from '@/app/lib/actions/inbox'

/**
 * Lets a tech register email addresses they own. Mail from any of those
 * addresses that lands in the M365 accounting mailbox will skip
 * auto-matching and go straight to /inbox as a forwarder candidate —
 * even non-work emails — with the understanding that the tech will
 * triage it by hand (dismiss, convert, or block).
 */
export function InboundForwardersForm({ initial }: { initial: string[] }) {
  const [entries, setEntries] = useState<string[]>(initial)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function addDraft() {
    const v = draft.trim().toLowerCase()
    if (!v) return
    if (!/^\S+@\S+\.\S+$/.test(v)) {
      setErr('Not a valid email address')
      return
    }
    if (entries.includes(v)) {
      setErr('Already in the list')
      return
    }
    setEntries([...entries, v])
    setDraft('')
    setErr(null)
  }

  function remove(v: string) {
    setEntries(entries.filter((e) => e !== v))
  }

  function save() {
    setErr(null)
    setMsg(null)
    startTransition(async () => {
      const res = await updateInboundForwardEmails(entries)
      if (!res.ok) setErr(res.error ?? 'Failed')
      else setMsg('Saved')
    })
  }

  return (
    <div className="th-card">
      <h2 className="mb-1 font-mono text-sm uppercase tracking-widest text-accent">
        Inbound Forwarding
      </h2>
      <p className="mb-4 max-w-2xl text-xs text-th-text-muted">
        Add email addresses you own. Any message from one of these addresses
        landing in <span className="font-mono">accounting@pcc2k.com</span>{' '}
        will go straight to the Inbox dashboard — never auto-create, never
        match to an existing ticket. Useful for quickly promoting a problem
        email from your personal inbox into a ticket candidate: forward it,
        then triage it on /inbox.
      </p>

      <div className="mb-3 space-y-1">
        {entries.length === 0 && (
          <div className="text-xs text-th-text-muted">
            No forwarding addresses yet.
          </div>
        )}
        {entries.map((e) => (
          <div
            key={e}
            className="flex items-center justify-between rounded-md border border-th-border bg-th-base px-3 py-1.5"
          >
            <span className="font-mono text-xs text-slate-200">{e}</span>
            <button
              type="button"
              onClick={() => remove(e)}
              className="text-xs text-th-text-muted hover:text-priority-urgent"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addDraft()
            }
          }}
          placeholder="you@example.com"
          className="th-input flex-1"
        />
        <button
          type="button"
          onClick={addDraft}
          className="th-btn-secondary text-xs"
        >
          Add
        </button>
      </div>

      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}
      {msg && (
        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
          {msg}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="th-btn-primary"
        >
          {isPending ? 'Saving…' : 'Save Forwarders'}
        </button>
      </div>
    </div>
  )
}
