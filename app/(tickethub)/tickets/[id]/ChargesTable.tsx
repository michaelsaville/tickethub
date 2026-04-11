'use client'

import { useState, useTransition } from 'react'
import type { TH_ChargeStatus, TH_ChargeType } from '@prisma/client'
import { updateChargeStatus } from '@/app/lib/actions/charges'

type Charge = {
  id: string
  type: TH_ChargeType
  status: TH_ChargeStatus
  description: string | null
  quantity: number
  timeChargedMinutes: number | null
  workDate: Date | string
  item: { name: string; code: string | null }
  technician: { name: string } | null
}

/**
 * Finance-blind by default — techs see what work was logged and its billing
 * status, but not unit prices or totals. When we add a TICKETHUB_ADMIN view
 * with finance visibility, this component will accept a showAmounts prop.
 */
export function ChargesTable({ charges }: { charges: Charge[] }) {
  if (charges.length === 0) {
    return (
      <div className="th-card">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Charges (0)
        </div>
        <p className="text-xs text-th-text-muted">
          No charges yet. Use Quick Charge above to log work against this
          ticket.
        </p>
      </div>
    )
  }

  return (
    <div className="th-card">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Charges ({charges.length})
      </div>
      <ul className="divide-y divide-th-border">
        {charges.map((c) => (
          <ChargeRow key={c.id} charge={c} />
        ))}
      </ul>
    </div>
  )
}

function ChargeRow({ charge }: { charge: Charge }) {
  const [status, setStatus] = useState(charge.status)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const locked = status === 'INVOICED' || status === 'LOCKED'

  function toggle() {
    if (locked) return
    const next: TH_ChargeStatus =
      status === 'BILLABLE' ? 'NOT_BILLABLE' : 'BILLABLE'
    setErr(null)
    const prev = status
    setStatus(next)
    startTransition(async () => {
      const res = await updateChargeStatus(charge.id, next)
      if (!res.ok) {
        setErr(res.error)
        setStatus(prev)
      }
    })
  }

  const workDate = new Date(charge.workDate)
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        {charge.type}
      </span>
      <div className="flex-1">
        <div className="text-slate-100">
          {charge.item.name}
          {charge.timeChargedMinutes != null && (
            <span className="ml-2 font-mono text-xs text-th-text-muted">
              {formatMinutes(charge.timeChargedMinutes)}
            </span>
          )}
          {charge.type !== 'LABOR' && (
            <span className="ml-2 font-mono text-xs text-th-text-muted">
              × {charge.quantity}
            </span>
          )}
        </div>
        {charge.description && (
          <div className="mt-0.5 text-xs text-th-text-secondary">
            {charge.description}
          </div>
        )}
        <div className="mt-0.5 text-[10px] text-th-text-muted">
          {charge.technician?.name ?? 'System'} ·{' '}
          {workDate.toLocaleDateString()}
        </div>
        {err && <div className="text-xs text-priority-urgent">{err}</div>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending || locked}
        className={statusButtonClass(status, locked)}
      >
        {status.replace(/_/g, ' ')}
      </button>
    </li>
  )
}

function statusButtonClass(status: TH_ChargeStatus, locked: boolean): string {
  const base = 'rounded-full px-3 py-0.5 text-[10px] font-mono uppercase tracking-wider'
  if (locked) return `${base} bg-th-elevated text-th-text-muted cursor-default`
  if (status === 'BILLABLE') {
    return `${base} bg-status-resolved/20 text-status-resolved hover:bg-status-resolved/30`
  }
  return `${base} bg-th-elevated text-th-text-muted hover:bg-th-border`
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
