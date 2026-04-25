'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createAppointment, moveAppointment, resizeAppointment } from '@/app/lib/actions/appointments'
import type { DaySchedule } from '@/app/lib/actions/working-hours'
import { UnscheduledQueue } from './UnscheduledQueue'
import { AppointmentBlock } from './AppointmentBlock'
import { SchedulerViewTabs } from './SchedulerViewTabs'
import { PresenceDot } from '@/app/components/PresenceDot'

// ─── Types ───────────────────────────────────────────────────────────────

interface Ticket {
  id: string
  ticketNumber: number
  title: string
  priority: string
  status: string
  board: string | null
  estimatedMinutes: number | null
  client: { id: string; name: string; shortCode: string | null }
  site: { id: string; name: string } | null
}

interface Tech {
  id: string
  name: string
  email: string
}

interface Appointment {
  id: string
  ticketId: string
  technicianId: string
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  actualEnd: string | null
  travelMinutes: number | null
  status: string
  notes: string | null
  confirmationEmailSentAt: string | null
  ticket: {
    id: string
    ticketNumber: number
    title: string
    priority: string
    status: string
    board: string | null
    client: { id: string; name: string; shortCode: string | null }
    site: { id: string; name: string; address: string | null; city: string | null } | null
  }
  technician: { id: string; name: string }
  createdBy: { id: string; name: string }
}

interface Props {
  weekStart: string
  appointments: Appointment[]
  unscheduledTickets: Ticket[]
  techs: Tech[]
  workingHours: Record<string, DaySchedule[]>
  onsiteEnabled: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────

const SLOT_HEIGHT = 20 // px per 15 minutes
const HOUR_START = 7   // 7:00 AM
const HOUR_END = 18    // 6:00 PM
const SLOT_MINUTES = 15
const TOTAL_SLOTS = ((HOUR_END - HOUR_START) * 60) / SLOT_MINUTES
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-600/80 border-red-500',
  HIGH: 'bg-amber-600/80 border-amber-500',
  MEDIUM: 'bg-blue-600/80 border-blue-500',
  LOW: 'bg-slate-600/80 border-slate-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatWeekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${weekStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function slotToMinuteOfDay(slot: number): number {
  return HOUR_START * 60 + slot * SLOT_MINUTES
}

function minuteOfDayToSlot(minute: number): number {
  return Math.max(0, Math.min(TOTAL_SLOTS - 1, (minute - HOUR_START * 60) / SLOT_MINUTES))
}

function timeLabel(slot: number): string {
  const mins = slotToMinuteOfDay(slot)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${m.toString().padStart(2, '0')}`
}

function isToday(date: Date): boolean {
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

/** "Michael Saville" → "Michael S.". Single-word names pass through. */
function displayTechName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? full
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

// ─── Component ───────────────────────────────────────────────────────────

export function DispatchBoard({
  weekStart: weekStartStr,
  appointments,
  unscheduledTickets,
  techs,
  workingHours,
  onsiteEnabled,
}: Props) {
  const router = useRouter()
  const weekStart = useMemo(() => new Date(weekStartStr), [weekStartStr])
  const [dragTicket, setDragTicket] = useState<Ticket | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<{ dayIdx: number; techId: string; slot: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const ticketsById = useMemo(() => {
    const m = new Map<string, Ticket>()
    for (const t of unscheduledTickets) m.set(t.id, t)
    return m
  }, [unscheduledTickets])

  // Clear any stale hover highlight when the browser finishes any drag,
  // even if it ended outside the grid.
  useEffect(() => {
    const clear = () => setDragOverSlot(null)
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])

  // ─── Week navigation ────────────────────────────────────────────────

  const goToWeek = useCallback(
    (offset: number) => {
      const d = addDays(weekStart, offset * 7)
      router.push(`/schedule?week=${formatDateKey(d)}`)
    },
    [weekStart, router],
  )

  const goToday = useCallback(() => {
    router.push('/schedule')
  }, [router])

  // ─── Build appointment map: dateKey → techId → appointments[] ───────

  const appointmentMap = useMemo(() => {
    const map: Record<string, Record<string, Appointment[]>> = {}
    for (const appt of appointments) {
      const dateKey = new Date(appt.scheduledStart).toISOString().slice(0, 10)
      if (!map[dateKey]) map[dateKey] = {}
      if (!map[dateKey][appt.technicianId]) map[dateKey][appt.technicianId] = []
      map[dateKey][appt.technicianId].push(appt)
    }
    return map
  }, [appointments])

  // ─── Drag handlers ──────────────────────────────────────────────────

  function handleDragStart(ticket: Ticket) {
    setDragTicket(ticket)
  }

  function handleDragOver(e: React.DragEvent, dayIdx: number, techId: string, slot: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSlot((prev) =>
      prev?.dayIdx === dayIdx && prev.techId === techId && prev.slot === slot
        ? prev
        : { dayIdx, techId, slot },
    )
  }

  async function handleDrop(e: React.DragEvent, dayIdx: number, techId: string, slot: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSlot(null)

    const dayDate = addDays(weekStart, dayIdx)
    const minutes = slotToMinuteOfDay(slot)
    const start = new Date(dayDate)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

    // Existing appointment drag → move
    const movedApptId = e.dataTransfer.getData('appointmentId')
    if (movedApptId) {
      const orig = appointments.find((a) => a.id === movedApptId)
      if (!orig) return
      const durationMs = new Date(orig.scheduledEnd).getTime() - new Date(orig.scheduledStart).getTime()
      const end = new Date(start.getTime() + durationMs)

      await moveAppointment(movedApptId, {
        technicianId: techId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      })
      router.refresh()
      return
    }

    // New appointment from the unscheduled queue. Prefer dataTransfer over
    // React state so drops survive rerenders mid-drag.
    const droppedTicketId = e.dataTransfer.getData('ticketId') || e.dataTransfer.getData('text/plain')
    const ticket = (droppedTicketId && ticketsById.get(droppedTicketId)) || dragTicket
    if (!ticket) return

    const durationMin = ticket.estimatedMinutes ?? 60
    const end = new Date(start.getTime() + durationMin * 60_000)

    await createAppointment({
      ticketId: ticket.id,
      technicianId: techId,
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
    })

    setDragTicket(null)
    router.refresh()
  }

  // ─── Resize handler ─────────────────────────────────────────────────

  async function handleResize(appointmentId: string, newEndIso: string) {
    await resizeAppointment(appointmentId, newEndIso)
    router.refresh()
  }

  // ─── Get working hours for a tech on a specific day ─────────────────

  function getWorkingRange(techId: string, dayIdx: number): { start: number; end: number } | null {
    const dayOfWeek = (dayIdx + 1) % 7 // dayIdx 0=Mon → dayOfWeek 1
    const schedule = workingHours[techId]
    if (!schedule) return null
    const day = schedule.find((d) => d.dayOfWeek === dayOfWeek)
    if (!day || !day.isWorkingDay) return null
    const [sh, sm] = day.startTime.split(':').map(Number)
    const [eh, em] = day.endTime.split(':').map(Number)
    return { start: sh * 60 + sm, end: eh * 60 + em }
  }

  // ─── Render ─────────────────────────────────────────────────────────

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left panel: unscheduled tickets */}
      <UnscheduledQueue
        tickets={unscheduledTickets}
        onDragStart={handleDragStart}
        onsiteEnabled={onsiteEnabled}
      />

      {/* Right panel: dispatch grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Week header */}
        <div className="flex items-center justify-between border-b border-th-border bg-th-surface px-4 py-2">
          <button
            onClick={() => goToWeek(-1)}
            className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-th-elevated"
          >
            ◀ Prev
          </button>
          <div className="text-center">
            <span className="font-mono text-lg text-slate-100">
              {formatWeekLabel(weekStart)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SchedulerViewTabs current="week" />
            <button
              onClick={goToday}
              className="rounded bg-amber-600/30 px-3 py-1 text-sm font-medium text-amber-300 hover:bg-amber-600/50"
            >
              Today
            </button>
            <button
              onClick={() => goToWeek(1)}
              className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-th-elevated"
            >
              Next ▶
            </button>
          </div>
        </div>

        {/* Grid */}
        <div ref={gridRef} className="flex-1 overflow-auto">
          <div className="flex min-w-max">
            {/* Time gutter */}
            <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-th-border bg-th-surface">
              {/* Spacer matching day header (h-14) + tech sub-header (h-7) */}
              <div className="h-14 border-b border-th-border" />
              <div className="h-7 border-b border-th-border bg-th-elevated" />
              {Array.from({ length: TOTAL_SLOTS }, (_, slot) => (
                <div
                  key={slot}
                  className="flex items-start border-b border-th-border/30 text-[10px] text-slate-500"
                  style={{ height: SLOT_HEIGHT }}
                >
                  {slot % 4 === 0 && (
                    <span className="px-1 -mt-1.5">{timeLabel(slot)}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Days */}
            {days.map((dayDate, dayIdx) => {
              const dateKey = formatDateKey(dayDate)
              const today = isToday(dayDate)

              return (
                <div key={dateKey} className="flex flex-col border-r border-th-border">
                  {/* Day + date header */}
                  <div
                    className={`sticky top-0 z-10 border-b border-th-border px-1 py-1 text-center ${today ? 'bg-amber-900/30' : 'bg-th-surface'}`}
                  >
                    <div className={`text-xs font-mono ${today ? 'text-amber-300' : 'text-slate-400'}`}>
                      {DAY_LABELS[dayIdx]}
                    </div>
                    <div className={`text-sm font-medium ${today ? 'text-amber-200' : 'text-slate-200'}`}>
                      {dayDate.getDate()}
                    </div>
                  </div>

                  {/* Tech columns for this day */}
                  <div className="flex">
                    {techs.map((tech) => {
                      const workRange = getWorkingRange(tech.id, dayIdx)
                      const dayAppts = appointmentMap[dateKey]?.[tech.id] ?? []

                      return (
                        <div
                          key={tech.id}
                          className="relative border-r border-th-border/30"
                          style={{ width: 140 }}
                        >
                          {/* Tech name sub-header — sticky below day header */}
                          <div className="sticky top-[3.5rem] z-[9] flex h-7 items-center justify-center gap-1 border-b border-th-border bg-th-elevated px-1 text-center">
                            <PresenceDot userId={tech.id} size={6} />
                            <span
                              className="block truncate font-mono text-[11px] font-medium text-slate-200"
                              title={tech.name}
                            >
                              {displayTechName(tech.name)}
                            </span>
                          </div>

                          {/* Time slots */}
                          <div className="relative">
                            {Array.from({ length: TOTAL_SLOTS }, (_, slot) => {
                              const minuteOfDay = slotToMinuteOfDay(slot)
                              const isWorking = workRange
                                ? minuteOfDay >= workRange.start && minuteOfDay < workRange.end
                                : false
                              const isDragOver =
                                dragOverSlot?.dayIdx === dayIdx &&
                                dragOverSlot?.techId === tech.id &&
                                dragOverSlot?.slot === slot

                              return (
                                <div
                                  key={slot}
                                  className={`border-b border-th-border/20 ${
                                    !isWorking ? 'bg-slate-900/60' : ''
                                  } ${isDragOver ? 'bg-amber-500/20' : ''} ${
                                    slot % 4 === 0 ? 'border-th-border/40' : ''
                                  }`}
                                  style={{ height: SLOT_HEIGHT }}
                                  onDragOver={(e) => handleDragOver(e, dayIdx, tech.id, slot)}
                                  onDrop={(e) => handleDrop(e, dayIdx, tech.id, slot)}
                                />
                              )
                            })}

                            {/* Render appointment blocks */}
                            {dayAppts.map((appt) => {
                              const startDate = new Date(appt.scheduledStart)
                              const endDate = new Date(appt.scheduledEnd)
                              const startMinute = startDate.getHours() * 60 + startDate.getMinutes()
                              const endMinute = endDate.getHours() * 60 + endDate.getMinutes()
                              const topSlot = minuteOfDayToSlot(startMinute)
                              const bottomSlot = minuteOfDayToSlot(endMinute)
                              const heightSlots = Math.max(1, bottomSlot - topSlot)

                              return (
                                <AppointmentBlock
                                  key={appt.id}
                                  appointment={appt}
                                  top={topSlot * SLOT_HEIGHT}
                                  height={heightSlots * SLOT_HEIGHT}
                                  slotHeight={SLOT_HEIGHT}
                                  dayDate={dayDate}
                                  onResize={handleResize}
                                  onsiteEnabled={onsiteEnabled}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
