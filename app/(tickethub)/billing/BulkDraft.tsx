'use client'

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import { createInvoiceForClient } from '@/app/lib/actions/invoices'
import { formatCents } from '@/app/lib/billing'

export type BulkRow = {
  clientId: string
  name: string
  totalCents: number
  blocked: boolean
}

/**
 * Multi-select bulk-draft helper for /billing.
 *
 * The parent page renders the row checkboxes; this component owns the
 * selection state and the "Draft selected" header action. We loop the
 * existing per-client createInvoiceForClient action sequentially so each
 * draft gets its own atomic transaction — partial failures don't roll
 * back the others, and we surface a per-client status report at the end.
 */
export function BulkDraft({
  rows,
  children,
}: {
  rows: BulkRow[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [report, setReport] = useState<
    Array<{ clientId: string; name: string; ok: boolean; detail: string }>
  >([])

  const eligible = useMemo(() => rows.filter((r) => !r.blocked), [rows])
  const allEligibleSelected =
    eligible.length > 0 && eligible.every((r) => selected.has(r.clientId))

  const summary = useMemo(() => {
    let count = 0
    let totalCents = 0
    for (const r of rows) {
      if (selected.has(r.clientId) && !r.blocked) {
        count += 1
        totalCents += r.totalCents
      }
    }
    return { count, totalCents }
  }, [rows, selected])

  function toggleAll() {
    if (allEligibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(eligible.map((r) => r.clientId)))
    }
  }

  function toggleRow(clientId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  function go() {
    if (summary.count === 0) return
    setReport([])
    startTransition(async () => {
      const out: Array<{
        clientId: string
        name: string
        ok: boolean
        detail: string
      }> = []
      for (const r of rows) {
        if (!selected.has(r.clientId) || r.blocked) continue
        try {
          const res = await createInvoiceForClient(r.clientId)
          out.push({
            clientId: r.clientId,
            name: r.name,
            ok: res.ok,
            detail: res.ok
              ? `Draft #${res.invoiceId.slice(-6)} created`
              : res.error,
          })
        } catch (e) {
          out.push({
            clientId: r.clientId,
            name: r.name,
            ok: false,
            detail: e instanceof Error ? e.message : 'Failed',
          })
        }
      }
      setReport(out)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <BulkDraftContext.Provider
      value={{
        isSelected: (id) => selected.has(id),
        toggle: toggleRow,
        toggleAll,
        allEligibleSelected,
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-th-text-secondary">
          <button
            type="button"
            onClick={toggleAll}
            disabled={eligible.length === 0}
            className="th-btn-ghost text-xs"
          >
            {allEligibleSelected ? 'Clear selection' : 'Select all eligible'}
          </button>
          {summary.count > 0 && (
            <span>
              {summary.count}{' '}
              {summary.count === 1 ? 'client' : 'clients'} ·{' '}
              <span className="font-mono text-slate-100">
                {formatCents(summary.totalCents)}
              </span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={go}
          disabled={isPending || summary.count === 0}
          className="th-btn-primary text-xs disabled:opacity-50"
        >
          {isPending
            ? 'Drafting…'
            : summary.count > 0
              ? `Draft selected (${summary.count})`
              : 'Draft selected'}
        </button>
      </div>

      {report.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-md border border-th-border">
          <div className="bg-th-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Bulk-draft results
          </div>
          <ul className="divide-y divide-th-border text-xs">
            {report.map((r) => (
              <li
                key={r.clientId}
                className="flex items-center gap-3 px-3 py-1.5"
              >
                <span
                  className={
                    r.ok ? 'text-status-resolved' : 'text-priority-urgent'
                  }
                >
                  {r.ok ? '✓' : '✕'}
                </span>
                <span className="flex-1 text-slate-200">{r.name}</span>
                <span className="text-th-text-secondary">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}
    </BulkDraftContext.Provider>
  )
}

interface BulkDraftCtx {
  isSelected: (clientId: string) => boolean
  toggle: (clientId: string) => void
  toggleAll: () => void
  allEligibleSelected: boolean
}

const BulkDraftContext = createContext<BulkDraftCtx | null>(null)

export function BulkDraftCheckbox({
  clientId,
  blocked,
}: {
  clientId: string
  blocked: boolean
}) {
  const ctx = useContext(BulkDraftContext)
  if (!ctx) return null
  if (blocked) return <span className="inline-block w-4" aria-hidden />
  return (
    <input
      type="checkbox"
      checked={ctx.isSelected(clientId)}
      onChange={() => ctx.toggle(clientId)}
      className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
      aria-label="Include in bulk draft"
    />
  )
}
