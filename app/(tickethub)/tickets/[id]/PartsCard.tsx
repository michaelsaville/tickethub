'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { TH_Item, TH_PartStatus } from '@prisma/client'
import {
  convertPartToCharge,
  createTicketPart,
  deletePart,
  updatePartStatus,
  type PartResult,
} from '@/app/lib/actions/parts'
import { formatCents } from '@/app/lib/billing'

type Part = {
  id: string
  name: string
  quantity: number
  unitCost: number
  unitPrice: number
  vendor: string | null
  vendorUrl: string | null
  orderNumber: string | null
  status: TH_PartStatus
  chargeId: string | null
}

type Item = Pick<TH_Item, 'id' | 'name' | 'type' | 'code'>

const STATUSES: TH_PartStatus[] = [
  'PENDING_ORDER',
  'ORDERED',
  'RECEIVED',
  'INSTALLED',
  'RETURNED',
]

export function PartsCard({
  ticketId,
  items,
  initial,
  showAmounts,
}: {
  ticketId: string
  items: Item[]
  initial: Part[]
  showAmounts: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="th-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Parts ({initial.length})
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="th-btn-secondary text-xs"
          >
            + Add Part
          </button>
        )}
      </div>

      {showForm && (
        <NewPartForm
          ticketId={ticketId}
          onClose={() => setShowForm(false)}
        />
      )}

      {initial.length === 0 && !showForm ? (
        <p className="text-xs text-th-text-muted">
          No parts tracked on this ticket.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {initial.map((p) => (
            <PartRow
              key={p.id}
              part={p}
              items={items}
              showAmounts={showAmounts}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function PartRow({
  part,
  items,
  showAmounts,
}: {
  part: Part
  items: Item[]
  showAmounts: boolean
}) {
  const [status, setStatus] = useState(part.status)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showConvert, setShowConvert] = useState(false)

  function changeStatus(next: TH_PartStatus) {
    setErr(null)
    const prev = status
    setStatus(next)
    startTransition(async () => {
      const res = await updatePartStatus(part.id, next)
      if (!res.ok) {
        setErr(res.error)
        setStatus(prev)
      }
    })
  }

  function remove() {
    if (!confirm(`Remove part "${part.name}"?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deletePart(part.id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <li className="rounded-md border border-th-border bg-th-base p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-slate-100">{part.name}</span>
            <span className="font-mono text-xs text-th-text-muted">
              × {part.quantity}
            </span>
          </div>
          {(part.vendor || part.orderNumber) && (
            <div className="text-xs text-th-text-secondary">
              {part.vendor}
              {part.orderNumber && ` · order ${part.orderNumber}`}
              {part.vendorUrl && (
                <>
                  {' · '}
                  <a
                    href={part.vendorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    link
                  </a>
                </>
              )}
            </div>
          )}
          {showAmounts && (
            <div className="mt-1 font-mono text-xs text-th-text-muted">
              cost {formatCents(part.unitCost)} · price {formatCents(part.unitPrice)}
              {' · total '}
              <span className="text-slate-200">
                {formatCents(part.unitPrice * part.quantity)}
              </span>
            </div>
          )}
          {part.chargeId && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-status-resolved">
              Converted to charge
            </div>
          )}
          {err && <div className="mt-1 text-xs text-priority-urgent">{err}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value as TH_PartStatus)}
            disabled={isPending}
            className="th-input text-xs w-32"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            {!part.chargeId && (
              <button
                type="button"
                onClick={() => setShowConvert(true)}
                disabled={isPending}
                className="th-btn-ghost text-xs text-accent"
              >
                → Charge
              </button>
            )}
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      {showConvert && (
        <ConvertDialog
          part={part}
          items={items}
          onClose={() => setShowConvert(false)}
        />
      )}
    </li>
  )
}

function ConvertDialog({
  part,
  items,
  onClose,
}: {
  part: Part
  items: Item[]
  onClose: () => void
}) {
  const partItems = items.filter((i) => i.type === 'PART')
  const [itemId, setItemId] = useState<string>(partItems[0]?.id ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!itemId) {
      setErr('Pick a PART catalog item')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = await convertPartToCharge(part.id, itemId)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="th-card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-mono text-sm uppercase tracking-wider text-accent">
          Convert to Charge
        </h2>
        <p className="mb-4 text-xs text-th-text-secondary">
          Creates a BILLABLE PART charge using the part's recorded price. The
          catalog item is used only for chart-of-accounts mapping when the
          invoice syncs to QuickBooks/Xero.
        </p>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Catalog Item (PART-type)
          </label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="th-input"
          >
            {partItems.length === 0 && (
              <option value="" disabled>
                No PART items — add one in Settings → Items
              </option>
            )}
            {partItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.code ? ` (${i.code})` : ''}
              </option>
            ))}
          </select>
        </div>
        {err && (
          <div className="mt-3 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !itemId}
            className="th-btn-primary"
          >
            {isPending ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewPartForm({
  ticketId,
  onClose,
}: {
  ticketId: string
  onClose: () => void
}) {
  const [state, formAction] = useFormState<PartResult | null, FormData>(
    async (_prev, formData) => {
      const res = await createTicketPart(ticketId, {
        name: (formData.get('name') as string) ?? '',
        quantity: Number(formData.get('quantity') ?? 1),
        unitCostDollars: (formData.get('unitCost') as string) ?? '',
        unitPriceDollars: (formData.get('unitPrice') as string) ?? '',
        vendor: (formData.get('vendor') as string) || undefined,
        vendorUrl: (formData.get('vendorUrl') as string) || undefined,
        orderNumber: (formData.get('orderNumber') as string) || undefined,
      })
      if (res.ok) onClose()
      return res
    },
    null,
  )

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-md border border-th-border bg-th-base p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr,80px]">
        <input
          name="name"
          required
          autoFocus
          placeholder="Part name (e.g. Cat6 patch cable, 10ft)"
          className="th-input text-sm"
        />
        <input
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          className="th-input text-sm"
          placeholder="Qty"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          name="unitCost"
          placeholder="Cost $ (what you paid)"
          className="th-input text-sm font-mono"
        />
        <input
          name="unitPrice"
          placeholder="Price $ (client pays)"
          className="th-input text-sm font-mono"
          required
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          name="vendor"
          placeholder="Vendor (default Amazon Business)"
          className="th-input text-sm"
        />
        <input
          name="orderNumber"
          placeholder="Order # (optional)"
          className="th-input text-sm"
        />
      </div>
      <input
        name="vendorUrl"
        placeholder="Vendor URL (optional)"
        className="th-input text-sm"
      />
      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {state.error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <AddButton />
        <button type="button" onClick={onClose} className="th-btn-ghost text-xs">
          Cancel
        </button>
      </div>
    </form>
  )
}

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary text-xs">
      {pending ? 'Adding…' : 'Add Part'}
    </button>
  )
}
