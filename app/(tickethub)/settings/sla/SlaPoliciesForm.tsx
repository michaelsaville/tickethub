'use client'

import { useFormState, useFormStatus } from 'react-dom'
import type { TH_TicketPriority } from '@prisma/client'
import {
  upsertSlaPolicies,
  type SlaPolicyResult,
} from '@/app/lib/actions/sla'

export function SlaPoliciesForm({
  initial,
}: {
  initial: Array<{
    priority: TH_TicketPriority
    responseMinutes: number
    resolveMinutes: number
    isDefault: boolean
  }>
}) {
  const [state, formAction] = useFormState<SlaPolicyResult | null, FormData>(
    upsertSlaPolicies,
    null,
  )

  return (
    <form action={formAction} className="th-card max-w-3xl">
      <table className="w-full text-sm">
        <thead className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          <tr>
            <th className="pb-2 text-left">Priority</th>
            <th className="pb-2 text-left">Response (minutes)</th>
            <th className="pb-2 text-left">Resolve (minutes)</th>
            <th className="pb-2 text-left">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-th-border">
          {initial.map((row) => (
            <tr key={row.priority}>
              <td className="py-3">
                <span className={`badge-priority-${row.priority.toLowerCase()}`}>
                  {row.priority}
                </span>
              </td>
              <td className="py-3 pr-3">
                <input
                  type="number"
                  min={1}
                  name={`${row.priority}_response`}
                  defaultValue={row.responseMinutes}
                  className="th-input w-32"
                  required
                />
              </td>
              <td className="py-3 pr-3">
                <input
                  type="number"
                  min={1}
                  name={`${row.priority}_resolve`}
                  defaultValue={row.resolveMinutes}
                  className="th-input w-32"
                  required
                />
              </td>
              <td className="py-3 text-xs text-th-text-muted">
                {row.isDefault ? 'default (unsaved)' : 'saved'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {state && !state.ok && (
        <div className="mt-4 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="mt-4 rounded-md border border-status-resolved/40 bg-status-resolved/10 px-3 py-2 text-sm text-status-resolved">
          Saved.
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <SaveButton />
      </div>

      <p className="mt-4 text-xs text-th-text-muted">
        Common values: 60 = 1 hour · 240 = 4 hours · 480 = 8 hours · 1440 = 24
        hours · 4320 = 72 hours (3 days).
      </p>
    </form>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Saving…' : 'Save Policies'}
    </button>
  )
}
