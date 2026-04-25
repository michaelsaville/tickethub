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
  status: string
  ticket: {
    id: string
    ticketNumber: number
    title: string
    priority: string
    client: { name: string; shortCode: string | null }
    site: { name: string } | null
  }
}

interface Tech {
  id: string
  name: string
}

const HOUR_START = 7
const HOUR_END = 19
const HOURS = HOUR_END - HOUR_START
const SLOT_PX = 60

const PRIORITY_BG: Record<string, string> = {
  URGENT: 'bg-red-700/70 border-red-500',
  HIGH: 'bg-amber-700/70 border-amber-500',
  MEDIUM: 'bg-sky-700/70 border-sky-500',
  LOW: 'bg-slate-700/70 border-slate-500',
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DayView({
  dayStart: dayStartStr,
  appointments,
  techs,
}: {
  dayStart: string
  appointments: Appointment[]
  techs: Tech[]
}) {
  const router = useRouter()
  const dayStart = useMemo(() => new Date(dayStartStr), [dayStartStr])

  function goDay(offset: number) {
    const d = new Date(dayStart)
    d.setDate(d.getDate() + offset)
    router.push(`/schedule/day?d=${isoDay(d)}`)
  }

  function goToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    router.push(`/schedule/day?d=${isoDay(d)}`)
  }

  // Group appts by tech
  const apptsByTech = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const a of appointments) {
      const arr = m.get(a.technicianId) ?? []
      arr.push(a)
      m.set(a.technicianId, arr)
    }
    return m
  }, [appointments])

  // Include any tech who has an appointment today even if not "active"
  const techRows = useMemo(() => {
    const ids = new Set(techs.map((t) => t.id))
    const extras: Tech[] = []
    for (const a of appointments) {
      if (!ids.has(a.technicianId)) {
        extras.push({ id: a.technicianId, name: a.ticket ? '(other)' : a.technicianId })
        ids.add(a.technicianId)
      }
    }
    return [...techs, ...extras]
  }, [techs, appointments])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-th-border bg-th-surface px-4 py-2">
        <button
          onClick={() => goDay(-1)}
          className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-th-elevated"
        >
          ◀ Prev
        </button>
        <div className="font-mono text-lg text-slate-100">
          {formatDayLabel(dayStart)}
        </div>
        <div className="flex items-center gap-2">
          <SchedulerViewTabs current="day" />
          <button
            onClick={goToday}
            className="rounded bg-amber-600/30 px-3 py-1 text-sm font-medium text-amber-300 hover:bg-amber-600/50"
          >
            Today
          </button>
          <button
            onClick={() => goDay(1)}
            className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-th-elevated"
          >
            Next ▶
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {techRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-th-text-secondary">
            No active on-site techs.
          </div>
        ) : (
          <div className="min-w-max">
            {/* Hour header */}
            <div className="sticky top-0 z-10 flex border-b border-th-border bg-th-surface">
              <div className="sticky left-0 z-20 w-40 shrink-0 border-r border-th-border bg-th-surface px-3 py-2 text-xs uppercase tracking-wider text-th-text-muted">
                Tech
              </div>
              {Array.from({ length: HOURS }, (_, i) => {
                const h = HOUR_START + i
                const label = h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`
                return (
                  <div
                    key={h}
                    className="shrink-0 border-r border-th-border px-2 py-2 text-xs text-th-text-muted"
                    style={{ width: SLOT_PX }}
                  >
                    {label}
                  </div>
                )
              })}
            </div>

            {/* Tech rows */}
            {techRows.map((tech) => {
              const appts = apptsByTech.get(tech.id) ?? []
              return (
                <div
                  key={tech.id}
                  className="flex border-b border-th-border"
                  style={{ height: 56 }}
                >
                  <div className="sticky left-0 z-10 flex w-40 shrink-0 items-center border-r border-th-border bg-th-surface px-3 text-sm text-slate-200">
                    {tech.name}
                  </div>
                  <div
                    className="relative shrink-0"
                    style={{ width: HOURS * SLOT_PX, height: 56 }}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: HOURS }, (_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-r border-th-border/40"
                        style={{ left: i * SLOT_PX, width: SLOT_PX }}
                      />
                    ))}
                    {/* Appointment blocks */}
                    {appts.map((a) => {
                      const start = new Date(a.scheduledStart)
                      const end = new Date(a.scheduledEnd)
                      const startMin =
                        (start.getHours() - HOUR_START) * 60 +
                        start.getMinutes()
                      const durMin =
                        (end.getTime() - start.getTime()) / 60000
                      const left = (startMin / 60) * SLOT_PX
                      const width = Math.max(40, (durMin / 60) * SLOT_PX)
                      const cls =
                        PRIORITY_BG[a.ticket.priority] ?? PRIORITY_BG.MEDIUM
                      return (
                        <Link
                          key={a.id}
                          href={`/tickets/${a.ticket.id}`}
                          className={`absolute top-1 bottom-1 overflow-hidden rounded border px-2 py-1 text-xs text-white shadow ${cls} hover:opacity-80`}
                          style={{ left, width }}
                          title={`#${a.ticket.ticketNumber} ${a.ticket.title}`}
                        >
                          <div className="truncate font-mono text-[10px] opacity-80">
                            #{a.ticket.ticketNumber} ·{' '}
                            {start.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="truncate font-medium">
                            {a.ticket.client.shortCode ??
                              a.ticket.client.name}
                          </div>
                          <div className="truncate opacity-80">
                            {a.ticket.title}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
