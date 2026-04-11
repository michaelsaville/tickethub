'use client'

import { useMemo, useState, useTransition } from 'react'
import type { TH_Item } from '@prisma/client'
import { createCharge } from '@/app/lib/actions/charges'

const LABOR_QUICK_PICKS = [15, 30, 60, 120] as const

type Item = Pick<TH_Item, 'id' | 'name' | 'type' | 'code'>

export function QuickCharge({
  ticketId,
  items,
}: {
  ticketId: string
  items: Item[]
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleItems = useMemo(
    () => (showAll ? items : items.filter((i) => i.type === 'LABOR')),
    [items, showAll],
  )
  const [itemId, setItemId] = useState<string>(visibleItems[0]?.id ?? '')
  const [minutes, setMinutes] = useState<number>(30)
  const [chargedMinutes, setChargedMinutes] = useState<number | ''>('')
  const [quantity, setQuantity] = useState<number>(1)
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedItem = items.find((i) => i.id === itemId)
  const isLabor = selectedItem?.type === 'LABOR'

  function submit() {
    if (!itemId) {
      setErr('Pick an item')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = await createCharge(ticketId, {
        itemId,
        durationMinutes: isLabor ? minutes : undefined,
        chargedMinutes:
          isLabor && chargedMinutes !== '' ? Number(chargedMinutes) : undefined,
        quantity: isLabor ? undefined : quantity,
        description,
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setDescription('')
      setChargedMinutes('')
      if (isLabor) setMinutes(30)
      else setQuantity(1)
    })
  }

  function roundUpTo(unit: number) {
    if (!minutes) return
    const rounded = Math.ceil(minutes / unit) * unit
    setChargedMinutes(rounded)
  }

  if (items.length === 0) {
    return (
      <div className="th-card">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Quick Charge
        </div>
        <p className="text-xs text-th-text-muted">
          No items in the catalog yet. An admin needs to add labor rates at{' '}
          <a href="/settings/items" className="text-accent hover:underline">
            Settings → Item Catalog
          </a>{' '}
          first.
        </p>
      </div>
    )
  }

  return (
    <div className="th-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Quick Charge
        </div>
        <label className="flex items-center gap-2 text-xs text-th-text-secondary">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => {
              setShowAll(e.target.checked)
              setItemId('')
            }}
            className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
          />
          Show all items (not just labor)
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr,auto]">
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="th-input"
        >
          <option value="" disabled>
            Select an item…
          </option>
          {visibleItems.map((i) => (
            <option key={i.id} value={i.id}>
              [{i.type}] {i.name}
              {i.code ? ` (${i.code})` : ''}
            </option>
          ))}
        </select>

        {isLabor ? (
          <div className="flex items-center gap-1">
            {LABOR_QUICK_PICKS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={
                  minutes === m
                    ? 'rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs font-mono text-accent'
                    : 'rounded-md border border-th-border px-3 py-1.5 text-xs font-mono text-th-text-secondary hover:border-accent/40 hover:text-slate-200'
                }
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="th-input w-20 text-sm"
              title="Custom minutes"
            />
            <span className="text-xs text-th-text-muted">min</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Qty
            </label>
            <input
              type="number"
              min={1}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="th-input w-24 text-sm"
            />
          </div>
        )}
      </div>

      {isLabor && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono uppercase tracking-wider text-th-text-muted">
            Billed:
          </span>
          <input
            type="number"
            min={1}
            value={chargedMinutes}
            onChange={(e) =>
              setChargedMinutes(e.target.value === '' ? '' : Number(e.target.value))
            }
            placeholder={`${minutes} (same as spent)`}
            className="th-input w-28 text-sm"
          />
          <span className="text-th-text-muted">min</span>
          <button
            type="button"
            onClick={() => roundUpTo(15)}
            className="rounded-md border border-th-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-th-text-secondary hover:border-accent/40 hover:text-slate-200"
            title="Round billed up to next 15 min"
          >
            ↑15
          </button>
          <button
            type="button"
            onClick={() => roundUpTo(30)}
            className="rounded-md border border-th-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-th-text-secondary hover:border-accent/40 hover:text-slate-200"
          >
            ↑30
          </button>
          <button
            type="button"
            onClick={() => roundUpTo(60)}
            className="rounded-md border border-th-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-th-text-secondary hover:border-accent/40 hover:text-slate-200"
          >
            ↑60
          </button>
          <button
            type="button"
            onClick={() => setChargedMinutes('')}
            className="rounded-md border border-th-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-th-text-secondary hover:border-accent/40 hover:text-slate-200"
          >
            =
          </button>
        </div>
      )}

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional) — what you did, which part, etc."
        className="th-input mt-3"
      />

      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-th-text-muted">
          Prices resolve automatically from the contract and your hourly rate.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !itemId}
          className="th-btn-primary"
        >
          {isPending ? 'Adding…' : 'Add Charge'}
        </button>
      </div>
    </div>
  )
}
