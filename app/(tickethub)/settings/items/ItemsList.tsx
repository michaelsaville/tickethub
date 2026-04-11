'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { TH_Item, TH_ItemType } from '@prisma/client'
import { createItem, updateItem, type ItemResult } from '@/app/lib/actions/items'
import { formatCents, parseCents } from '@/app/lib/billing'

const TYPES: TH_ItemType[] = ['LABOR', 'PART', 'EXPENSE', 'LICENSE', 'CONTRACT_FEE']

export function ItemsList({ items }: { items: TH_Item[] }) {
  const [showForm, setShowForm] = useState(items.length === 0)
  return (
    <div className="space-y-6">
      {showForm ? (
        <NewItemForm onCancel={() => setShowForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="th-btn-primary"
        >
          + New Item
        </button>
      )}

      {items.length === 0 ? (
        <div className="th-card text-center text-sm text-th-text-secondary">
          No items yet. Add LABOR rows first — e.g. "Standard Labor" at
          $125.00/hr, "After Hours" at $187.50/hr.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-4 py-2 w-28">Type</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 w-20">Code</th>
                <th className="px-4 py-2 w-32">Default Price</th>
                <th className="px-4 py-2 w-32">Cost</th>
                <th className="px-4 py-2 w-20">Taxable</th>
                <th className="px-4 py-2 w-20">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border bg-th-surface">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ItemRow({ item }: { item: TH_Item }) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(formatCents(item.defaultPrice))
  const [cost, setCost] = useState(
    item.costPrice != null ? formatCents(item.costPrice) : '',
  )
  const [taxable, setTaxable] = useState(item.taxable)
  const [active, setActive] = useState(item.isActive)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save<T>(
    patch: Parameters<typeof updateItem>[1],
    onOk?: () => void,
    rollback?: () => void,
  ) {
    setErr(null)
    startTransition(async () => {
      const res = await updateItem(item.id, patch)
      if (!res.ok) {
        setErr(res.error)
        rollback?.()
      } else {
        onOk?.()
      }
    })
  }

  return (
    <tr className={active ? '' : 'opacity-50'}>
      <td className="px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          {item.type}
        </span>
      </td>
      <td className="px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== item.name && save({ name })}
          disabled={isPending}
          className="th-input text-sm"
        />
        {err && <div className="mt-1 text-xs text-priority-urgent">{err}</div>}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-th-text-muted">
        {item.code ?? '—'}
      </td>
      <td className="px-4 py-3">
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const cents = parseCents(price)
            if (cents !== item.defaultPrice) {
              save({ defaultPrice: cents }, () => setPrice(formatCents(cents)))
            } else {
              setPrice(formatCents(item.defaultPrice))
            }
          }}
          disabled={isPending}
          className="th-input text-sm font-mono"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onBlur={() => {
            const cents = cost.trim() ? parseCents(cost) : null
            if (cents !== item.costPrice) {
              save({ costPrice: cents }, () =>
                setCost(cents != null ? formatCents(cents) : ''),
              )
            }
          }}
          disabled={isPending}
          placeholder="—"
          className="th-input text-sm font-mono"
        />
      </td>
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={taxable}
          onChange={(e) => {
            const v = e.target.checked
            setTaxable(v)
            save({ taxable: v }, undefined, () => setTaxable(!v))
          }}
          disabled={isPending}
          className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
        />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            const v = !active
            setActive(v)
            save({ isActive: v }, undefined, () => setActive(!v))
          }}
          disabled={isPending}
          className={
            active
              ? 'th-btn-ghost text-xs text-status-resolved'
              : 'th-btn-ghost text-xs text-th-text-muted'
          }
        >
          {active ? 'Active' : 'Inactive'}
        </button>
      </td>
    </tr>
  )
}

function NewItemForm({ onCancel }: { onCancel: () => void }) {
  const [state, formAction] = useFormState<ItemResult | null, FormData>(
    createItem,
    null,
  )
  return (
    <form action={formAction} className="th-card max-w-3xl space-y-4">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-accent">
        New Item
      </h2>
      <div className="grid gap-3 md:grid-cols-[140px,1fr,120px]">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Type
          </label>
          <select name="type" defaultValue="LABOR" required className="th-input">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Name
          </label>
          <input
            name="name"
            required
            autoFocus
            placeholder="Standard Labor"
            className="th-input"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Code
          </label>
          <input
            name="code"
            placeholder="LABOR"
            className="th-input font-mono uppercase"
            maxLength={20}
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto]">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Default Price
          </label>
          <input
            name="defaultPrice"
            placeholder="$125.00"
            className="th-input font-mono"
            required
          />
          <p className="mt-1 text-xs text-th-text-muted">
            LABOR: per hour. Others: per unit.
          </p>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Cost (optional)
          </label>
          <input
            name="costPrice"
            placeholder="$0.00"
            className="th-input font-mono"
          />
          <p className="mt-1 text-xs text-th-text-muted">
            For markup calculations.
          </p>
        </div>
        <label className="flex items-center gap-2 self-end pb-3 text-xs text-th-text-secondary">
          <input
            type="checkbox"
            name="taxable"
            defaultChecked
            className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
          />
          Taxable
        </label>
      </div>
      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {state.error}
        </div>
      )}
      <div className="flex items-center gap-3">
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
      {pending ? 'Adding…' : 'Add Item'}
    </button>
  )
}
