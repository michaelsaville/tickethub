'use client'

import { useState, useTransition } from 'react'
import type { TH_Item } from '@prisma/client'
import {
  addChecklistItem,
  convertChecklistItemToCharge,
  deleteChecklistItem,
  toggleChecklistItem,
  type ChecklistItem,
} from '@/app/lib/actions/checklist'

type Item = Pick<TH_Item, 'id' | 'name' | 'type' | 'code'>

export function ChecklistCard({
  ticketId,
  items,
  initial,
}: {
  ticketId: string
  items: Item[]
  initial: ChecklistItem[]
}) {
  const [newText, setNewText] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [convertTarget, setConvertTarget] = useState<ChecklistItem | null>(null)

  function add() {
    if (!newText.trim()) return
    setErr(null)
    const minutes = newMinutes ? Number(newMinutes) : undefined
    startTransition(async () => {
      const res = await addChecklistItem(ticketId, newText, minutes)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setNewText('')
      setNewMinutes('')
    })
  }

  function toggle(id: string) {
    setErr(null)
    startTransition(async () => {
      const res = await toggleChecklistItem(ticketId, id)
      if (!res.ok) setErr(res.error)
    })
  }

  function remove(id: string) {
    if (!confirm('Delete this checklist item?')) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteChecklistItem(ticketId, id)
      if (!res.ok) setErr(res.error)
    })
  }

  const openCount = initial.filter((i) => !i.done).length
  const totalCount = initial.length

  return (
    <div className="th-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Checklist ({openCount} open / {totalCount} total)
        </div>
      </div>

      {initial.length > 0 && (
        <ul className="mb-3 space-y-1">
          {initial.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-md border border-th-border bg-th-base px-2 py-1.5 text-sm"
            >
              <button
                type="button"
                onClick={() => toggle(item.id)}
                disabled={isPending}
                className={
                  item.done
                    ? 'mt-0.5 h-4 w-4 flex-none rounded border border-status-resolved bg-status-resolved/30 text-status-resolved'
                    : 'mt-0.5 h-4 w-4 flex-none rounded border border-th-border'
                }
                aria-label={item.done ? 'mark incomplete' : 'mark done'}
              >
                {item.done ? '✓' : ''}
              </button>
              <div className="flex-1">
                <div
                  className={
                    item.done
                      ? 'text-th-text-muted line-through'
                      : 'text-slate-100'
                  }
                >
                  {item.text}
                </div>
                {item.estimatedMinutes != null && (
                  <div className="text-[10px] font-mono text-th-text-muted">
                    est {formatMinutes(item.estimatedMinutes)}
                    {item.chargeId && ' · charged'}
                  </div>
                )}
              </div>
              {!item.done && (
                <button
                  type="button"
                  onClick={() => setConvertTarget(item)}
                  disabled={isPending}
                  className="text-[10px] font-mono uppercase tracking-wider text-accent hover:underline"
                  title="Log this as a LABOR charge and mark done"
                >
                  → Charge
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={isPending}
                className="text-th-text-muted hover:text-priority-urgent"
                aria-label="delete item"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Add a to-do (press Enter)"
          className="th-input text-sm"
          disabled={isPending}
        />
        <input
          value={newMinutes}
          onChange={(e) => setNewMinutes(e.target.value)}
          type="number"
          min={1}
          placeholder="est min"
          className="th-input text-sm w-24 font-mono"
          disabled={isPending}
          title="Optional estimated minutes"
        />
        <button
          type="button"
          onClick={add}
          disabled={isPending || !newText.trim()}
          className="th-btn-secondary text-xs"
        >
          Add
        </button>
      </div>
      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}

      {convertTarget && (
        <ConvertDialog
          ticketId={ticketId}
          item={convertTarget}
          laborItems={items.filter((i) => i.type === 'LABOR')}
          onClose={() => setConvertTarget(null)}
        />
      )}
    </div>
  )
}

function ConvertDialog({
  ticketId,
  item,
  laborItems,
  onClose,
}: {
  ticketId: string
  item: ChecklistItem
  laborItems: Item[]
  onClose: () => void
}) {
  const [laborItemId, setLaborItemId] = useState<string>(
    laborItems[0]?.id ?? '',
  )
  const [minutes, setMinutes] = useState<number>(item.estimatedMinutes ?? 30)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!laborItemId) {
      setErr('Pick a LABOR item')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = await convertChecklistItemToCharge(
        ticketId,
        item.id,
        laborItemId,
        minutes,
      )
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
        <h2 className="mb-2 font-mono text-sm uppercase tracking-wider text-accent">
          Log Labor for Checklist Item
        </h2>
        <p className="mb-4 text-xs text-th-text-secondary">"{item.text}"</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Labor Item
            </label>
            <select
              value={laborItemId}
              onChange={(e) => setLaborItemId(e.target.value)}
              className="th-input"
            >
              {laborItems.length === 0 && (
                <option value="" disabled>
                  No LABOR items — add one in Settings → Items
                </option>
              )}
              {laborItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.code ? ` (${i.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Minutes
            </label>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="th-input font-mono"
            />
          </div>
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
            disabled={isPending || !laborItemId}
            className="th-btn-primary"
          >
            {isPending ? 'Logging…' : 'Log Charge'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
