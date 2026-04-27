'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type ClientForEdit = {
  id: string
  name: string
  shortCode: string | null
  internalNotes: string | null
  isActive: boolean
}

export function EditClientButton({ client }: { client: ClientForEdit }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="th-btn-secondary text-xs"
      >
        ✏ Edit
      </button>
      {open && <EditDialog client={client} onClose={() => setOpen(false)} />}
    </>
  )
}

function EditDialog({
  client,
  onClose,
}: {
  client: ClientForEdit
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [shortCode, setShortCode] = useState(client.shortCode ?? '')
  const [internalNotes, setInternalNotes] = useState(client.internalNotes ?? '')
  const [isActive, setIsActive] = useState(client.isActive)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    if (!name.trim()) {
      setErr('Name is required')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          shortCode: shortCode.trim() || null,
          internalNotes: internalNotes.trim() || null,
          isActive,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { error?: string | null }
        | null
      if (!res.ok) {
        setErr(json?.error || 'Failed to save')
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-client-title"
    >
      <div
        className="th-card w-full max-w-lg space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="edit-client-title"
          className="font-mono text-sm uppercase tracking-wider text-accent"
        >
          Edit Client
        </h2>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="th-input"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Short Code
          </label>
          <input
            type="text"
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value.toUpperCase())}
            className="th-input"
            placeholder="e.g. ACME"
          />
          <p className="mt-1 text-[10px] text-th-text-muted">
            Optional. Uppercase, must be unique across all clients.
          </p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Internal Notes
          </label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={4}
            className="th-input resize-y"
            placeholder="Visible to staff only — e.g. account context, billing quirks"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
          />
          Active
          {!isActive && (
            <span className="text-xs text-th-text-muted">
              (inactive clients are hidden from create flows)
            </span>
          )}
        </label>

        {err && (
          <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="th-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !name.trim()}
            className="th-btn-primary"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
