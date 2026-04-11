'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createSite, deleteSite, type SiteResult } from '@/app/lib/actions/sites'

type Site = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  _count: { tickets: number }
}

export function SitesList({
  clientId,
  sites,
}: {
  clientId: string
  sites: Site[]
}) {
  const [showForm, setShowForm] = useState(sites.length === 0)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
      <div>
        {sites.length === 0 ? (
          <div className="th-card text-center text-sm text-th-text-secondary">
            No sites yet. Add the first one →
          </div>
        ) : (
          <ul className="space-y-2">
            {sites.map((s) => (
              <SiteRow key={s.id} clientId={clientId} site={s} />
            ))}
          </ul>
        )}
      </div>
      <aside>
        {showForm ? (
          <AddSiteForm
            clientId={clientId}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="th-btn-primary w-full"
          >
            + Add Site
          </button>
        )}
      </aside>
    </div>
  )
}

function SiteRow({ clientId, site }: { clientId: string; site: Site }) {
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  function remove() {
    if (!confirm(`Remove site "${site.name}"?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteSite(clientId, site.id)
      if (!res.ok) setErr(res.error)
    })
  }
  return (
    <li className="th-card flex items-start justify-between gap-4">
      <div>
        <div className="font-medium text-slate-100">{site.name}</div>
        {(site.address || site.city) && (
          <div className="mt-1 text-xs text-th-text-secondary">
            {site.address}
            {site.city && `, ${site.city}`}
            {site.state && ` ${site.state}`}
            {site.zip && ` ${site.zip}`}
          </div>
        )}
        {site.notes && (
          <div className="mt-2 text-xs text-th-text-muted">{site.notes}</div>
        )}
        <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          {site._count.tickets} ticket
          {site._count.tickets === 1 ? '' : 's'}
        </div>
        {err && <div className="mt-2 text-xs text-priority-urgent">{err}</div>}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
      >
        Delete
      </button>
    </li>
  )
}

function AddSiteForm({
  clientId,
  onCancel,
}: {
  clientId: string
  onCancel: () => void
}) {
  const boundAction = createSite.bind(null, clientId)
  const [state, formAction] = useFormState<SiteResult | null, FormData>(
    boundAction,
    null,
  )
  return (
    <form action={formAction} className="th-card space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-accent">
        New Site
      </h2>
      <input
        name="name"
        required
        placeholder="Site name (e.g. HQ, Warehouse)"
        className="th-input"
        autoFocus
      />
      <input
        name="address"
        placeholder="Street address"
        className="th-input"
      />
      <div className="grid grid-cols-[1fr,80px,100px] gap-2">
        <input name="city" placeholder="City" className="th-input" />
        <input
          name="state"
          placeholder="ST"
          maxLength={2}
          className="th-input uppercase"
        />
        <input name="zip" placeholder="ZIP" className="th-input" />
      </div>
      <textarea
        name="notes"
        rows={2}
        placeholder="Notes (access codes, gate instructions, etc.)"
        className="th-input resize-y"
      />
      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-2 py-1 text-xs text-priority-urgent">
          {state.error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <AddButton />
        <button type="button" onClick={onCancel} className="th-btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Adding…' : 'Add Site'}
    </button>
  )
}
