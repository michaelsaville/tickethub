'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SchedulerViewTabs } from '../SchedulerViewTabs'

interface Appointment {
  id: string
  technicianId: string
  scheduledStart: string
  scheduledEnd: string
  ticket: {
    id: string
    ticketNumber: number
    title: string
    priority: string
    client: { name: string; shortCode: string | null }
  }
  technician: { id: string; name: string }
}

const PRIORITY_DOT: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-sky-500',
  LOW: 'bg-slate-500',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function MonthView({
  monthStart: monthStartStr,
  appointments,
}: {
  monthStart: string
  appointments: Appointment[]
}) {
  const router = useRouter()
  const monthStart = useMemo(() => new Date(monthStartStr), [monthStartStr])

  const gridStart = useMemo(() => {
    const d = new Date(monthStart)
    d.setDate(d.getDate() - d.getDay())
    return d
  }, [monthStart])

  // Group appts by yyyy-mm-dd of scheduledStart in local time
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const a of appointments) {
      const d = new Date(a.scheduledStart)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const arr = m.get(key) ?? []
      arr.push(a)
      m.set(key, arr)
    }
    return m
  }, [appointments])

  function goMonth(offset: number) {
    const d = new Date(monthStart)
    d.setMonth(d.getMonth() + offset)
    router.push(`/schedule/month?m=${isoMonth(d)}`)
  }

  function goToday() {
    const d = new Date()
    router.push(`/schedule/month?m=${isoMonth(d)}`)
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 6 weeks × 7 days = 42 cells
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-th-border bg-th-surface px-4 py-2">
        <button
          onClick={() => goMonth(-1)}
          className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-th-elevated"
        >
          ◀ Prev
        </button>
        <div className="font-mono text-lg text-slate-100">
          {formatMonthLabel(monthStart)}
        </div>
        <div className="flex items-center gap-2">
          <SchedulerViewTabs current="month" />
          <button
            onClick={goToday}
            className="rounded bg-amber-600/30 px-3 py-1 text-sm font-medium text-amber-300 hover:bg-amber-600/50"
          >
            Today
          </button>
          <button
            onClick={() => goMonth(1)}
            className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-th-elevated"
          >
            Next ▶
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-th-border bg-th-surface text-center text-xs uppercase tracking-wider text-th-text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6 overflow-auto">
        {cells.map((d, i) => {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const isOtherMonth = d.getMonth() !== monthStart.getMonth()
          const isToday = key === todayKey
          const appts = byDay.get(key) ?? []
          return (
            <Link
              key={i}
              href={`/schedule/day?d=${isoDay(d)}`}
              className={`group relative flex min-h-0 flex-col gap-1 border-b border-r border-th-border p-2 transition hover:bg-th-elevated ${
                isOtherMonth ? 'bg-th-base/40 text-th-text-muted' : 'bg-th-surface'
              } ${isToday ? 'ring-1 ring-inset ring-amber-500' : ''}`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`font-mono text-xs ${
                    isToday
                      ? 'text-amber-400'
                      : isOtherMonth
                        ? 'text-th-text-muted'
                        : 'text-slate-200'
                  }`}
                >
                  {d.getDate()}
                </span>
                {appts.length > 0 && (
                  <span className="text-[10px] text-th-text-secondary">
                    {appts.length}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden text-[10px]">
                {appts.slice(0, 3).map((a) => {
                  const start = new Date(a.scheduledStart)
                  const dot = PRIORITY_DOT[a.ticket.priority] ?? PRIORITY_DOT.MEDIUM
                  return (
                    <div key={a.id} className="flex items-center gap-1 truncate">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                      <span className="font-mono text-th-text-muted">
                        {start.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="truncate text-slate-300">
                        {a.ticket.client.shortCode ?? a.ticket.client.name}
                      </span>
                    </div>
                  )
                })}
                {appts.length > 3 && (
                  <div className="text-[10px] text-th-text-muted">
                    +{appts.length - 3} more
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
