'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createOnCallShift,
  deleteOnCallShift,
  generateRotation,
  clearFutureRotation,
} from '@/app/lib/actions/on-call'

interface User {
  id: string
  name: string
  email: string
}

interface Shift {
  id: string
  userId: string
  startsAt: string
  endsAt: string
  label: string | null
  source: string
  user: { id: string; name: string }
}

function localDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nextMondayAt(hour = 8): Date {
  const d = new Date()
  const day = d.getDay() // 0=Sun
  const offset = day === 1 ? 7 : (8 - day) % 7 || 7
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function OnCallEditor({
  users,
  upcoming,
}: {
  users: User[]
  upcoming: Shift[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Generator form state
  const [genUserIds, setGenUserIds] = useState<string[]>([])
  const [genStart, setGenStart] = useState(localDatetimeValue(nextMondayAt(8)))
  const [genWeeks, setGenWeeks] = useState(12)
  const [genLabel, setGenLabel] = useState('weekly rotation')

  // Manual shift form state
  const [shiftUserId, setShiftUserId] = useState(users[0]?.id ?? '')
  const [shiftStart, setShiftStart] = useState(
    localDatetimeValue(new Date(Date.now() + 60 * 60 * 1000)),
  )
  const [shiftEnd, setShiftEnd] = useState(
    localDatetimeValue(new Date(Date.now() + 25 * 60 * 60 * 1000)),
  )
  const [shiftLabel, setShiftLabel] = useState('')

  function toggleGenUser(id: string) {
    setGenUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function moveGenUser(id: string, dir: -1 | 1) {
    setGenUserIds((prev) => {
      const i = prev.indexOf(id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function withFlash(action: () => Promise<void>) {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
      }
    })
  }

  function onGenerate(e: React.FormEvent) {
    e.preventDefault()
    withFlash(async () => {
      const r = await generateRotation({
        userIds: genUserIds,
        startsAt: new Date(genStart).toISOString(),
        weeks: genWeeks,
        label: genLabel.trim() || undefined,
      })
      if (!r.ok) throw new Error(r.error)
      setInfo(`Generated ${r.created} shifts.`)
    })
  }

  function onAddShift(e: React.FormEvent) {
    e.preventDefault()
    withFlash(async () => {
      const r = await createOnCallShift({
        userId: shiftUserId,
        startsAt: new Date(shiftStart).toISOString(),
        endsAt: new Date(shiftEnd).toISOString(),
        label: shiftLabel.trim() || undefined,
        source: 'override',
      })
      if (!r.ok) throw new Error(r.error)
      setInfo('Shift added.')
    })
  }

  function onDelete(id: string) {
    if (!confirm('Delete this shift?')) return
    withFlash(async () => {
      const r = await deleteOnCallShift(id)
      if (!r.ok) throw new Error(r.error)
      setInfo('Shift deleted.')
    })
  }

  function onClearFuture() {
    if (
      !confirm(
        'Delete all future generated rotation shifts? Override shifts are kept.',
      )
    ) {
      return
    }
    withFlash(async () => {
      const r = await clearFutureRotation()
      setInfo(`Deleted ${r.deleted} future rotation shifts.`)
    })
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-300">
          {info}
        </div>
      )}

      {/* Generator */}
      <section className="rounded-lg border border-th-border bg-th-surface p-4">
        <h2 className="mb-3 font-mono text-sm text-slate-200">
          Generate weekly rotation
        </h2>
        <form onSubmit={onGenerate} className="space-y-4">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-th-text-muted">
              Users (in rotation order)
            </div>
            <ul className="space-y-1">
              {users.map((u) => {
                const order = genUserIds.indexOf(u.id)
                const inRotation = order >= 0
                return (
                  <li
                    key={u.id}
                    className="flex items-center gap-3 rounded border border-th-border bg-th-base px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={inRotation}
                      onChange={() => toggleGenUser(u.id)}
                      className="h-4 w-4 rounded border-th-border bg-th-base"
                    />
                    <span className="flex-1 text-sm text-slate-200">
                      {u.name}
                    </span>
                    {inRotation && (
                      <>
                        <span className="font-mono text-xs text-amber-400">
                          {order + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => moveGenUser(u.id, -1)}
                          disabled={order === 0}
                          className="rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-th-elevated disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGenUser(u.id, 1)}
                          disabled={order === genUserIds.length - 1}
                          className="rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-th-elevated disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
                First shift starts
              </span>
              <input
                type="datetime-local"
                value={genStart}
                onChange={(e) => setGenStart(e.target.value)}
                className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
                Number of weeks
              </span>
              <input
                type="number"
                min={1}
                max={104}
                value={genWeeks}
                onChange={(e) =>
                  setGenWeeks(Math.max(1, Math.min(104, +e.target.value || 1)))
                }
                className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
                Label
              </span>
              <input
                type="text"
                value={genLabel}
                onChange={(e) => setGenLabel(e.target.value)}
                className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100"
              />
            </label>
          </div>

          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={onClearFuture}
              disabled={pending}
              className="rounded border border-red-700/40 px-3 py-1 text-xs text-red-300 hover:bg-red-900/20 disabled:opacity-50"
            >
              Clear future rotation
            </button>
            <button
              type="submit"
              disabled={pending || genUserIds.length === 0}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {pending ? 'Working…' : 'Generate'}
            </button>
          </div>
        </form>
      </section>

      {/* Manual / override */}
      <section className="rounded-lg border border-th-border bg-th-surface p-4">
        <h2 className="mb-3 font-mono text-sm text-slate-200">
          Add manual shift / swap
        </h2>
        <form onSubmit={onAddShift} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="block md:col-span-1">
            <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
              User
            </span>
            <select
              value={shiftUserId}
              onChange={(e) => setShiftUserId(e.target.value)}
              className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-1">
            <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
              Starts
            </span>
            <input
              type="datetime-local"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="block md:col-span-1">
            <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
              Ends
            </span>
            <input
              type="datetime-local"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="block md:col-span-1">
            <span className="mb-1 block text-xs uppercase tracking-wider text-th-text-muted">
              Label
            </span>
            <input
              type="text"
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              placeholder="swap: Mike covering Frye"
              className="w-full rounded border border-th-border bg-th-base px-2 py-1 text-sm text-slate-100 placeholder-th-text-muted"
            />
          </label>
          <div className="flex items-end md:col-span-1">
            <button
              type="submit"
              disabled={pending || !shiftUserId}
              className="w-full rounded bg-accent/30 px-3 py-1 text-sm font-medium text-accent hover:bg-accent/50 disabled:opacity-50"
            >
              {pending ? 'Working…' : 'Add shift'}
            </button>
          </div>
        </form>
      </section>

      {/* Upcoming list */}
      <section>
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Upcoming &amp; current shifts (next 90 days)
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-th-border bg-th-surface p-4 text-sm text-th-text-secondary">
            No shifts in the window.
          </p>
        ) : (
          <ul className="divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
            {upcoming.map((s) => {
              const start = new Date(s.startsAt)
              const end = new Date(s.endsAt)
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-sm text-slate-200">
                        {s.user.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                          s.source === 'override'
                            ? 'bg-amber-700/30 text-amber-300'
                            : 'bg-slate-700/30 text-slate-400'
                        }`}
                      >
                        {s.source}
                      </span>
                    </div>
                    <div className="text-xs text-th-text-muted">
                      {start.toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {' → '}
                      {end.toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {s.label && <> · {s.label}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(s.id)}
                    disabled={pending}
                    className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
