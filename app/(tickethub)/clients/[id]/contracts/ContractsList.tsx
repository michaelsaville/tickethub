'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { TH_ContractStatus, TH_ContractType } from '@prisma/client'
import {
  createContract,
  deleteContract,
  runAutoInvoiceNow,
  updateContract,
  type ContractResult,
} from '@/app/lib/actions/contracts'
import { formatCents } from '@/app/lib/billing'

type Contract = {
  id: string
  name: string
  type: TH_ContractType
  status: TH_ContractStatus
  startDate: Date | string | null
  endDate: Date | string | null
  monthlyFee: number | null
  blockHours: number | null
  blockHoursUsed: number
  isGlobal: boolean
  notes: string | null
  autoInvoiceEnabled: boolean
  autoSendInvoice: boolean
  billingDayOfMonth: number | null
  lastAutoInvoicedAt: Date | string | null
  chargeCount: number
  ticketCount: number
}

const TYPE_LABELS: Record<TH_ContractType, string> = {
  GLOBAL: 'Global (auto)',
  BLOCK_HOURS: 'Block Hours',
  RECURRING: 'Recurring Monthly',
  TIME_AND_MATERIAL: 'Time & Material',
  PROJECT: 'Project (fixed)',
}

const STATUSES: TH_ContractStatus[] = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING']

export function ContractsList({
  clientId,
  contracts,
}: {
  clientId: string
  contracts: Contract[]
}) {
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
      <div className="space-y-3">
        {contracts.map((c) => (
          <ContractCard key={c.id} clientId={clientId} contract={c} />
        ))}
      </div>
      <aside>
        {showForm ? (
          <NewContractForm
            clientId={clientId}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="th-btn-primary w-full"
          >
            + Add Contract
          </button>
        )}
      </aside>
    </div>
  )
}

function ContractCard({
  clientId,
  contract,
}: {
  clientId: string
  contract: Contract
}) {
  const [status, setStatus] = useState(contract.status)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function changeStatus(next: TH_ContractStatus) {
    setErr(null)
    const prev = status
    setStatus(next)
    startTransition(async () => {
      const res = await updateContract(contract.id, { status: next })
      if (!res.ok) {
        setErr(res.error)
        setStatus(prev)
      }
    })
  }

  function remove() {
    if (!confirm(`Delete contract "${contract.name}"?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteContract(contract.id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <div className="th-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-slate-100 font-medium">{contract.name}</h3>
            {contract.isGlobal && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                auto
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-th-text-secondary">
            {TYPE_LABELS[contract.type]}
          </div>
          {contract.type === 'RECURRING' && contract.monthlyFee != null && (
            <>
              <div className="mt-2 font-mono text-sm text-slate-200">
                {formatCents(contract.monthlyFee)} / month
              </div>
              <AutoInvoicePanel contract={contract} />
            </>
          )}
          {contract.type === 'BLOCK_HOURS' && contract.blockHours != null && (
            <div className="mt-2 font-mono text-sm text-slate-200">
              {contract.blockHoursUsed.toFixed(1)} /{' '}
              {contract.blockHours.toFixed(1)} hours used
            </div>
          )}
          {(contract.startDate || contract.endDate) && (
            <div className="mt-1 text-xs text-th-text-muted">
              {contract.startDate
                ? new Date(contract.startDate).toLocaleDateString()
                : '—'}{' '}
              →{' '}
              {contract.endDate
                ? new Date(contract.endDate).toLocaleDateString()
                : '—'}
            </div>
          )}
          {contract.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-th-text-secondary">
              {contract.notes}
            </p>
          )}
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            {contract.chargeCount} charges · {contract.ticketCount} tickets
          </div>
          {err && <div className="mt-2 text-xs text-priority-urgent">{err}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value as TH_ContractStatus)}
            disabled={isPending || contract.isGlobal}
            className="th-input text-xs w-28"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {!contract.isGlobal && (
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AutoInvoicePanel({ contract }: { contract: Contract }) {
  const [enabled, setEnabled] = useState(contract.autoInvoiceEnabled)
  const [autoSend, setAutoSend] = useState(contract.autoSendInvoice)
  const [day, setDay] = useState(contract.billingDayOfMonth ?? 1)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function save(patch: {
    autoInvoiceEnabled?: boolean
    autoSendInvoice?: boolean
    billingDayOfMonth?: number
  }) {
    setErr(null)
    setMsg(null)
    startTransition(async () => {
      const res = await updateContract(contract.id, patch)
      if (!res.ok) setErr(res.error)
    })
  }

  function runNow() {
    if (!confirm('Create a DRAFT invoice right now for this contract?')) return
    setErr(null)
    setMsg(null)
    startTransition(async () => {
      const res = await runAutoInvoiceNow(contract.id)
      if (!res.ok) setErr(res.error)
      else setMsg('Draft invoice created. Review it in Invoices.')
    })
  }

  return (
    <details className="mt-3 rounded border border-th-border bg-th-elevated/40">
      <summary className="cursor-pointer px-3 py-2 text-xs text-th-text-secondary hover:text-slate-100">
        Auto-invoice{' '}
        <span className={enabled ? 'text-accent' : 'text-th-text-muted'}>
          {enabled ? `(on, day ${day})` : '(off)'}
        </span>
      </summary>
      <div className="space-y-2 px-3 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked)
              save({ autoInvoiceEnabled: e.target.checked })
            }}
            disabled={pending}
          />
          Enable monthly auto-invoice
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={autoSend}
            onChange={(e) => {
              setAutoSend(e.target.checked)
              save({ autoSendInvoice: e.target.checked })
            }}
            disabled={pending || !enabled}
          />
          Auto-send invoice email <span className="text-th-text-muted">(not wired yet — drafts only)</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-200">
          <span>Billing day of month</span>
          <input
            type="number"
            min={1}
            max={28}
            value={day}
            onChange={(e) => {
              const n = Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10)))
              setDay(n)
            }}
            onBlur={() => save({ billingDayOfMonth: day })}
            disabled={pending || !enabled}
            className="th-input w-16 font-mono text-xs"
          />
        </label>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] uppercase tracking-wider text-th-text-muted">
            {contract.lastAutoInvoicedAt
              ? `last auto: ${new Date(contract.lastAutoInvoicedAt).toLocaleString()}`
              : 'never auto-invoiced'}
          </div>
          <button
            type="button"
            onClick={runNow}
            disabled={pending || !enabled}
            className="th-btn-ghost text-xs text-accent disabled:opacity-50"
          >
            Run now
          </button>
        </div>
        {err && <div className="text-xs text-priority-urgent">{err}</div>}
        {msg && <div className="text-xs text-accent">{msg}</div>}
      </div>
    </details>
  )
}

function NewContractForm({
  clientId,
  onCancel,
}: {
  clientId: string
  onCancel: () => void
}) {
  const [type, setType] = useState<TH_ContractType>('TIME_AND_MATERIAL')
  const boundAction = createContract.bind(null, clientId)
  const [state, formAction] = useFormState<ContractResult | null, FormData>(
    boundAction,
    null,
  )

  return (
    <form action={formAction} className="th-card space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-accent">
        New Contract
      </h2>
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Type
        </label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as TH_ContractType)}
          className="th-input text-sm"
        >
          <option value="TIME_AND_MATERIAL">{TYPE_LABELS.TIME_AND_MATERIAL}</option>
          <option value="BLOCK_HOURS">{TYPE_LABELS.BLOCK_HOURS}</option>
          <option value="RECURRING">{TYPE_LABELS.RECURRING}</option>
          <option value="PROJECT">{TYPE_LABELS.PROJECT}</option>
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
          placeholder={
            type === 'RECURRING'
              ? 'Managed Services 2026'
              : type === 'BLOCK_HOURS'
                ? '50-hour prepaid block'
                : 'T&M Agreement'
          }
          className="th-input"
        />
      </div>

      {type === 'RECURRING' && (
        <>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Monthly Fee
            </label>
            <input
              name="monthlyFee"
              placeholder="$500.00"
              className="th-input font-mono"
              required
            />
          </div>
          <div className="space-y-2 rounded border border-th-border bg-th-elevated/40 p-3">
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input type="checkbox" name="autoInvoiceEnabled" />
              Auto-invoice monthly (creates DRAFT each billing day)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input type="checkbox" name="autoSendInvoice" />
              Auto-send (not wired yet — drafts for now)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <span>Billing day</span>
              <input
                name="billingDayOfMonth"
                type="number"
                min={1}
                max={28}
                defaultValue={1}
                className="th-input w-16 font-mono text-xs"
              />
            </label>
          </div>
        </>
      )}
      {type === 'BLOCK_HOURS' && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Block Hours
          </label>
          <input
            name="blockHours"
            type="number"
            step="0.25"
            min="0.25"
            placeholder="50"
            className="th-input font-mono"
            required
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Start
          </label>
          <input name="startDate" type="date" className="th-input text-sm" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            End
          </label>
          <input name="endDate" type="date" className="th-input text-sm" />
        </div>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Notes
        </label>
        <textarea
          name="notes"
          rows={3}
          className="th-input resize-y text-sm"
          placeholder="Terms, exceptions, renewal cadence, etc."
        />
      </div>

      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
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
      {pending ? 'Creating…' : 'Create Contract'}
    </button>
  )
}
