'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createClient, type CreateClientResult } from '@/app/lib/actions/clients'

export function NewClientForm() {
  const [state, formAction] = useFormState<CreateClientResult | null, FormData>(
    createClient,
    null,
  )

  return (
    <form action={formAction} className="th-card max-w-xl space-y-4">
      <div>
        <label
          htmlFor="name"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
        >
          Name *
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          className="th-input"
          placeholder="Acme Corporation"
        />
      </div>

      <div>
        <label
          htmlFor="shortCode"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
        >
          Short Code
        </label>
        <input
          id="shortCode"
          name="shortCode"
          type="text"
          className="th-input font-mono uppercase"
          placeholder="ACME"
          maxLength={12}
        />
        <p className="mt-1 text-xs text-th-text-muted">
          Optional — used in ticket prefixes. Must be unique across clients.
        </p>
      </div>

      <div>
        <label
          htmlFor="internalNotes"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
        >
          Internal Notes
        </label>
        <textarea
          id="internalNotes"
          name="internalNotes"
          rows={4}
          className="th-input resize-y"
          placeholder="Only visible to staff. e.g. 'Always call John first, never the front desk.'"
        />
      </div>

      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <a href="/clients" className="th-btn-ghost">
          Cancel
        </a>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Creating…' : 'Create Client'}
    </button>
  )
}
