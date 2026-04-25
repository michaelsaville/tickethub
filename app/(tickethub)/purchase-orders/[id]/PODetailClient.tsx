'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  setPurchaseOrderStatus,
  receivePurchaseOrderLine,
  deletePurchaseOrder,
} from '@/app/lib/actions/purchase-orders'
import { useRouter } from 'next/navigation'

type Line = {
  id: string
  description: string
  sku: string | null
  quantity: number
  unitCost: number
  receivedQuantity: number
  notes: string | null
  ticketPart: {
    id: string
    status: string
    ticket: { id: string; ticketNumber: number; title: string } | null
  } | null
}

type PO = {
  id: string
  poNumber: number
  status:
    | 'DRAFT'
    | 'SENT'
    | 'PARTIAL'
    | 'RECEIVED'
    | 'CLOSED'
    | 'CANCELLED'
  notes: string | null
  sentAt: string | null
  expectedAt: string | null
  receivedAt: string | null
  lines: Line[]
  totalCents: number
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-700 text-slate-200',
  SENT: 'bg-sky-500/20 text-sky-300',
  PARTIAL: 'bg-amber-500/20 text-amber-300',
  RECEIVED: 'bg-emerald-500/20 text-emerald-300',
  CLOSED: 'bg-th-elevated text-th-text-muted',
  CANCELLED: 'bg-rose-500/15 text-rose-300',
}

export function PODetailClient({ po }: { po: PO }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function setStatus(status: PO['status']) {
    setErr(null)
    startTransition(async () => {
      const r = await setPurchaseOrderStatus({ id: po.id, status })
      if (!r.ok) setErr(r.error)
    })
  }

  function receive(line: Line, quantity: number) {
    setErr(null)
    startTransition(async () => {
      const r = await receivePurchaseOrderLine({ lineId: line.id, quantity })
      if (!r.ok) setErr(r.error)
    })
  }

  function deleteDraft() {
    if (!confirm(`Delete DRAFT PO-${po.poNumber}?`)) return
    setErr(null)
    startTransition(async () => {
      const r = await deletePurchaseOrder(po.id)
      if (r.ok) router.replace('/purchase-orders')
      else setErr(r.error)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-th-border bg-th-surface p-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-wider ${
            STATUS_COLOR[po.status] ?? 'bg-th-elevated text-th-text-muted'
          }`}
        >
          {po.status.toLowerCase()}
        </span>
        <span className="text-xs text-th-text-muted">
          Total ${(po.totalCents / 100).toFixed(2)} ·{' '}
          {po.lines.reduce((s, l) => s + l.receivedQuantity, 0)}/
          {po.lines.reduce((s, l) => s + l.quantity, 0)} units received
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {po.status === 'DRAFT' && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus('SENT')}
                className="rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-500 disabled:opacity-40"
              >
                Mark sent
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={deleteDraft}
                className="rounded border border-rose-500/40 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
              >
                Delete
              </button>
            </>
          )}
          {(po.status === 'SENT' || po.status === 'PARTIAL') && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus('CANCELLED')}
              className="rounded border border-rose-500/40 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
            >
              Cancel PO
            </button>
          )}
          {po.status === 'RECEIVED' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus('CLOSED')}
              className="rounded border border-th-border px-3 py-1 text-xs text-th-text-secondary hover:bg-th-elevated disabled:opacity-40"
            >
              Close
            </button>
          )}
          {po.status === 'CLOSED' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus('RECEIVED')}
              className="rounded border border-th-border px-3 py-1 text-xs text-th-text-secondary hover:bg-th-elevated disabled:opacity-40"
            >
              Reopen
            </button>
          )}
        </div>
        {err && (
          <span className="basis-full text-xs text-rose-400">{err}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-th-border">
        <table className="w-full text-sm">
          <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Line</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-th-border">
            {po.lines.map((l) => {
              const fully = l.receivedQuantity >= l.quantity
              return (
                <tr key={l.id} className="hover:bg-th-elevated">
                  <td className="px-3 py-2">
                    <div className="text-slate-100">{l.description}</div>
                    {l.ticketPart?.ticket && (
                      <Link
                        href={`/tickets/${l.ticketPart.ticket.id}`}
                        className="text-[11px] text-accent hover:underline"
                      >
                        ↳ TH-{l.ticketPart.ticket.ticketNumber}:{' '}
                        {l.ticketPart.ticket.title}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-th-text-secondary">
                    {l.sku ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.quantity}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                    ${(l.unitCost / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-100">
                    ${((l.unitCost * l.quantity) / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {po.status === 'DRAFT' ||
                    po.status === 'CANCELLED' ||
                    po.status === 'CLOSED' ? (
                      <span className="font-mono text-xs text-th-text-muted">
                        {l.receivedQuantity}/{l.quantity}
                      </span>
                    ) : (
                      <ReceiveControls
                        line={l}
                        disabled={pending}
                        onReceive={(qty) => receive(l, qty)}
                      />
                    )}
                    {fully && (
                      <span className="ml-1 text-[10px] text-emerald-400">
                        ✓
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReceiveControls({
  line,
  disabled,
  onReceive,
}: {
  line: Line
  disabled: boolean
  onReceive: (qty: number) => void
}) {
  const [qty, setQty] = useState(line.quantity)
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={line.quantity}
        value={qty}
        onChange={(e) =>
          setQty(
            Math.max(0, Math.min(line.quantity, parseInt(e.target.value, 10) || 0)),
          )
        }
        className="w-14 rounded border border-th-border bg-th-elevated px-1 py-0.5 text-right font-mono text-xs"
      />
      <span className="text-[10px] text-th-text-muted">/{line.quantity}</span>
      <button
        type="button"
        disabled={disabled || qty === line.receivedQuantity}
        onClick={() => onReceive(qty)}
        className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] text-white hover:bg-emerald-500 disabled:opacity-40"
      >
        save
      </button>
    </span>
  )
}
