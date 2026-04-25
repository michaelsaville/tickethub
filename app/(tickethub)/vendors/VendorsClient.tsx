'use client'

import { useState, useTransition } from 'react'
import { createVendor, updateVendor } from '@/app/lib/actions/vendors'

type Vendor = {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  website: string | null
  termsDays: number | null
  notes: string | null
  isActive: boolean
  _count: { purchaseOrders: number; ticketParts: number }
}

export function VendorsClient({ vendors }: { vendors: Vendor[] }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [termsDays, setTermsDays] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setErr(null)
    startTransition(async () => {
      const r = await createVendor({
        name,
        contactName: contactName || undefined,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        website: website || undefined,
        termsDays: termsDays ? parseInt(termsDays, 10) : undefined,
        notes: notes || undefined,
      })
      if (r.ok) {
        setShowForm(false)
        setName('')
        setContactName('')
        setContactEmail('')
        setContactPhone('')
        setWebsite('')
        setTermsDays('')
        setNotes('')
      } else {
        setErr(r.error)
      }
    })
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30"
        >
          {showForm ? 'Cancel' : '+ New vendor'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 grid gap-3 rounded-md border border-th-border bg-th-surface p-4 sm:grid-cols-2">
          <Field label="Name *">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Net days">
            <input
              type="number"
              value={termsDays}
              onChange={(e) => setTermsDays(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Contact name">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Website">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="button"
              disabled={pending || !name.trim()}
              onClick={submit}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {pending ? 'Saving…' : 'Save vendor'}
            </button>
            {err && <span className="text-xs text-rose-400">{err}</span>}
          </div>
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="rounded-md border border-dashed border-th-border p-12 text-center text-sm text-th-text-secondary">
          No vendors yet. Add your first to start tracking POs.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className="px-3 py-2 text-right">Terms</th>
                <th className="px-3 py-2 text-right">POs</th>
                <th className="px-3 py-2 text-right">Parts</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border">
              {vendors.map((v) => (
                <VendorRow key={v.id} vendor={v} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function VendorRow({ vendor }: { vendor: Vendor }) {
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState(vendor.isActive)
  function toggle() {
    startTransition(async () => {
      const next = !active
      setActive(next)
      const r = await updateVendor(vendor.id, { isActive: next })
      if (!r.ok) setActive(!next)
    })
  }
  return (
    <tr className={`hover:bg-th-elevated ${active ? '' : 'opacity-50'}`}>
      <td className="px-3 py-2 text-slate-100">{vendor.name}</td>
      <td className="px-3 py-2 text-th-text-secondary">
        {vendor.contactName ?? '—'}
        {vendor.contactEmail && (
          <span className="block text-[11px] text-th-text-muted">
            {vendor.contactEmail}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
        {vendor.termsDays != null ? `Net ${vendor.termsDays}` : '—'}
      </td>
      <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
        {vendor._count.purchaseOrders}
      </td>
      <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
        {vendor._count.ticketParts}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${
            active
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
              : 'bg-th-elevated text-th-text-muted hover:bg-th-border'
          } disabled:opacity-40`}
        >
          {active ? 'active' : 'inactive'}
        </button>
      </td>
    </tr>
  )
}

const fieldClass =
  'w-full rounded border border-th-border bg-th-elevated px-2 py-1 text-sm text-slate-100 focus:border-accent focus:outline-none'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-th-text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
