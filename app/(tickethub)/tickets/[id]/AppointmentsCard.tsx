'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  scheduleVisitFromTicket,
  cancelAppointment,
  sendOnsiteConfirmationEmail,
} from '@/app/lib/actions/appointments'

interface Tech {
  id: string
  name: string
}

export interface AppointmentSummary {
  id: string
  scheduledStart: string
  scheduledEnd: string
  status: string
  confirmationEmailSentAt: string | null
  technician: { id: string; name: string }
}

interface Props {
  ticketId: string
  ticketBoard: string | null
  estimatedMinutes: number | null
  techs: Tech[]
  appointments: AppointmentSummary[]
  onsiteEnabled: boolean
}

const STATUS_ICON: Record<string, string> = {
  SCHEDULED: '🔵',
  EN_ROUTE: '🚗',
  ON_SITE: '🟢',
  COMPLETE: '✅',
  CANCELLED: '❌',
}

function formatLocal(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** `2026-04-20T09:30` in local time → ISO string. */
function localInputToIso(dateStr: string, timeStr: string): string {
  // Treat as local time; build via Date constructor which uses local TZ.
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeStr.split(':').map(Number)
  const dt = new Date(y, m - 1, d, h, min, 0, 0)
  return dt.toISOString()
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function AppointmentsCard({
  ticketId,
  ticketBoard,
  estimatedMinutes,
  techs,
  appointments,
  onsiteEnabled,
}: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(appointments.length === 0)
  const [selectedTechs, setSelectedTechs] = useState<string[]>(
    techs.length === 1 ? [techs[0].id] : [],
  )
  const [date, setDate] = useState<string>(todayYmd())
  const [time, setTime] = useState<string>('09:00')
  const [duration, setDuration] = useState<number>(estimatedMinutes ?? 60)
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isOnsite = onsiteEnabled && ticketBoard === 'On-Site'

  function toggleTech(id: string) {
    setSelectedTechs((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (selectedTechs.length === 0) {
      setErr('Select at least one technician')
      return
    }
    const iso = localInputToIso(date, time)
    startTransition(async () => {
      const res = await scheduleVisitFromTicket({
        ticketId,
        technicianIds: selectedTechs,
        scheduledStart: iso,
        durationMinutes: duration,
        notes: notes || undefined,
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setNotes('')
      setExpanded(false)
      router.refresh()
    })
  }

  function handleCancel(appointmentId: string) {
    if (!confirm('Cancel this appointment?')) return
    startTransition(async () => {
      const res = await cancelAppointment(appointmentId)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.refresh()
    })
  }

  function handleEmail(appointmentId: string) {
    startTransition(async () => {
      const res = await sendOnsiteConfirmationEmail(appointmentId)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="th-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Scheduled Visits
          {appointments.length > 0 && (
            <span className="ml-2 text-th-text-secondary">
              ({appointments.length})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded bg-amber-600/30 px-2 py-1 font-mono text-[10px] text-amber-300 hover:bg-amber-600/50"
        >
          {expanded ? '– Close' : '+ Schedule visit'}
        </button>
      </div>

      {appointments.length === 0 ? (
        <p className="text-xs text-th-text-muted">No appointments scheduled.</p>
      ) : (
        <ul className="space-y-1.5">
          {appointments.map((a) => {
            const isDone = a.status === 'COMPLETE' || a.status === 'CANCELLED'
            return (
              <li
                key={a.id}
                className={`flex items-center gap-2 rounded border border-th-border/60 bg-th-base px-2 py-1.5 text-xs ${
                  isDone ? 'opacity-60' : ''
                }`}
              >
                <span>{STATUS_ICON[a.status] ?? '•'}</span>
                <span className="font-mono text-slate-200">
                  {formatLocal(a.scheduledStart)}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-300">{a.technician.name}</span>
                <div className="ml-auto flex items-center gap-1">
                  {isOnsite && !isDone && (
                    <button
                      type="button"
                      onClick={() => handleEmail(a.id)}
                      disabled={isPending}
                      title={
                        a.confirmationEmailSentAt
                          ? `Re-send confirmation (last sent ${new Date(a.confirmationEmailSentAt).toLocaleString()})`
                          : 'Email on-site confirmation to client'
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        a.confirmationEmailSentAt
                          ? 'bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50'
                          : 'bg-th-elevated text-slate-200 hover:bg-th-border'
                      }`}
                    >
                      {a.confirmationEmailSentAt ? '✓ ✉' : '✉'}
                    </button>
                  )}
                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => handleCancel(a.id)}
                      disabled={isPending}
                      className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {expanded && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 space-y-2 border-t border-th-border/50 pt-3"
        >
          {techs.length === 0 ? (
            <p className="text-xs text-priority-urgent">
              No on-site technicians configured. Set{' '}
              <span className="font-mono">On-site</span> to Yes for at least one
              user in /settings/users.
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Technicians
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {techs.map((t) => {
                    const on = selectedTechs.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTech(t.id)}
                        className={`rounded px-2 py-1 text-xs ${
                          on
                            ? 'bg-amber-600/40 text-amber-200'
                            : 'bg-th-elevated text-slate-300 hover:bg-th-border'
                        }`}
                      >
                        {on ? '✓ ' : ''}
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="th-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    Start
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                    className="th-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    Minutes
                  </label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                    required
                    className="th-input w-full text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. replace UPS battery"
                  className="th-input w-full text-xs"
                />
              </div>

              {err && <p className="text-xs text-priority-urgent">{err}</p>}

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-th-text-muted">
                  {selectedTechs.length > 1
                    ? `Creates ${selectedTechs.length} appointments at the same time.`
                    : 'Adds to /schedule and pushes ntfy to the tech.'}
                </p>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {isPending ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  )
}
