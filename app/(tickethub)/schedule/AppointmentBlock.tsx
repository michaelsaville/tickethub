'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateAppointmentStatus,
  cancelAppointment,
  completeAndCharge,
  addTechToAppointment,
  sendOnsiteConfirmationEmail,
} from '@/app/lib/actions/appointments'

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-600/80 border-l-red-400',
  HIGH: 'bg-amber-600/70 border-l-amber-400',
  MEDIUM: 'bg-blue-600/70 border-l-blue-400',
  LOW: 'bg-slate-600/70 border-l-slate-400',
}

const STATUS_ICONS: Record<string, string> = {
  SCHEDULED: '🔵',
  EN_ROUTE: '🚗',
  ON_SITE: '🟢',
  COMPLETE: '✅',
  CANCELLED: '❌',
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
  appointment: Appointment
  top: number
  height: number
  slotHeight: number
  dayDate: Date
  onResize: (appointmentId: string, newEndIso: string) => Promise<void>
  onsiteEnabled: boolean
}

export function AppointmentBlock({ appointment, top, height, slotHeight, dayDate, onResize, onsiteEnabled }: Props) {
  const router = useRouter()
  const [showPopover, setShowPopover] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [currentHeight, setCurrentHeight] = useState(height)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    appointment.confirmationEmailSentAt ? 'sent' : 'idle',
  )
  const [emailError, setEmailError] = useState<string | null>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)
  const latestHeight = useRef(height)

  const isComplete = appointment.status === 'COMPLETE'
  const isCancelled = appointment.status === 'CANCELLED'
  const isDone = isComplete || isCancelled

  const colorClass = PRIORITY_COLORS[appointment.ticket.priority] ?? PRIORITY_COLORS.MEDIUM

  // ─── Drag for move ──────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent) {
    if (isDone) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('appointmentId', appointment.id)
  }

  // ─── Resize handle ──────────────────────────────────────────────────

  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isDone) return
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = currentHeight
    latestHeight.current = currentHeight

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientY - resizeStartY.current
      const snapped = Math.round(delta / slotHeight) * slotHeight
      const newH = Math.max(slotHeight, resizeStartHeight.current + snapped)
      latestHeight.current = newH
      setCurrentHeight(newH)
    }

    const onUp = async () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setIsResizing(false)

      // Calculate new end time — read from ref so we see the final height
      // even though `currentHeight` in this closure is stale.
      const slotsFromTop = Math.round(latestHeight.current / slotHeight)
      const startMinute = new Date(appointment.scheduledStart).getHours() * 60 +
        new Date(appointment.scheduledStart).getMinutes()
      const endMinute = startMinute + slotsFromTop * 15
      const endH = Math.floor(endMinute / 60)
      const endM = endMinute % 60
      const newEnd = new Date(dayDate)
      newEnd.setHours(endH, endM, 0, 0)
      await onResize(appointment.id, newEnd.toISOString())
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // ─── Status transitions ─────────────────────────────────────────────

  async function handleStatusChange(newStatus: string) {
    if (newStatus === 'COMPLETE') {
      await completeAndCharge(appointment.id)
    } else if (newStatus === 'CANCELLED') {
      await cancelAppointment(appointment.id)
    } else {
      await updateAppointmentStatus(appointment.id, newStatus as any)
    }
    setShowPopover(false)
    router.refresh()
  }

  // ─── On-site confirmation email ─────────────────────────────────────

  const isOnsite =
    onsiteEnabled && appointment.ticket.board === 'On-Site' && !isDone

  async function handleSendConfirmation(e: React.MouseEvent) {
    e.stopPropagation()
    if (emailStatus === 'sending') return
    if (
      emailStatus === 'sent' &&
      !confirm('Confirmation was already sent. Send again?')
    ) {
      return
    }
    setEmailStatus('sending')
    setEmailError(null)
    const res = await sendOnsiteConfirmationEmail(appointment.id)
    if (res.ok) {
      setEmailStatus('sent')
      router.refresh()
    } else {
      setEmailStatus('error')
      setEmailError(res.error)
    }
  }

  // ─── Time format ────────────────────────────────────────────────────

  function formatTime(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const nextStatuses: Record<string, { label: string; status: string }[]> = {
    SCHEDULED: [
      { label: '🚗 En Route', status: 'EN_ROUTE' },
      { label: '🟢 On Site', status: 'ON_SITE' },
      { label: '❌ Cancel', status: 'CANCELLED' },
    ],
    EN_ROUTE: [
      { label: '🟢 On Site', status: 'ON_SITE' },
      { label: '❌ Cancel', status: 'CANCELLED' },
    ],
    ON_SITE: [
      { label: '✅ Complete & Charge', status: 'COMPLETE' },
      { label: '❌ Cancel', status: 'CANCELLED' },
    ],
    COMPLETE: [],
    CANCELLED: [],
  }

  return (
    <>
      <div
        ref={blockRef}
        draggable={!isDone && !isResizing}
        onDragStart={handleDragStart}
        onClick={() => setShowPopover(!showPopover)}
        className={`absolute left-0.5 right-0.5 rounded border-l-[3px] px-1.5 py-0.5 text-[10px] leading-tight cursor-pointer overflow-hidden select-none ${colorClass} ${isDone ? 'opacity-40' : 'hover:brightness-110'} ${isResizing ? 'ring-1 ring-amber-400' : ''}`}
        style={{ top, height: isResizing ? currentHeight : height, zIndex: showPopover ? 30 : 20 }}
      >
        <div className="flex items-center gap-1">
          <span>{STATUS_ICONS[appointment.status] ?? ''}</span>
          <span className="font-mono text-white/70">#{appointment.ticket.ticketNumber}</span>
        </div>
        <div className="text-white font-medium truncate">
          {appointment.ticket.client.shortCode ?? appointment.ticket.client.name}
        </div>
        {height >= 40 && (
          <div className="text-white/70 truncate">{appointment.ticket.title}</div>
        )}
        {height >= 60 && (
          <div className="text-white/60">
            {formatTime(appointment.scheduledStart)} – {formatTime(appointment.scheduledEnd)}
          </div>
        )}

        {/* On-site confirmation email icon (bottom-right of the block) */}
        {isOnsite && (
          <button
            type="button"
            onClick={handleSendConfirmation}
            title={
              emailStatus === 'sent'
                ? `Confirmation emailed ${
                    appointment.confirmationEmailSentAt
                      ? new Date(appointment.confirmationEmailSentAt).toLocaleString()
                      : ''
                  }`
                : emailStatus === 'error'
                  ? `Failed: ${emailError ?? 'unknown error'} — click to retry`
                  : emailStatus === 'sending'
                    ? 'Sending…'
                    : 'Email on-site confirmation to client'
            }
            className={`absolute bottom-0.5 right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none ${
              emailStatus === 'sent'
                ? 'bg-emerald-600/80 text-white'
                : emailStatus === 'error'
                  ? 'bg-red-600/80 text-white hover:bg-red-500'
                  : 'bg-black/30 text-white/90 hover:bg-black/60'
            }`}
          >
            {emailStatus === 'sent' ? '✓' : emailStatus === 'sending' ? '…' : '✉'}
          </button>
        )}

        {/* Resize handle */}
        {!isDone && (
          <div
            onPointerDown={handleResizeStart}
            className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize hover:bg-white/20 rounded-b"
          />
        )}
      </div>

      {/* Popover */}
      {showPopover && (
        <div
          className="absolute z-50 w-64 rounded-lg border border-th-border bg-th-surface shadow-xl"
          style={{ top: top + height + 4, left: 0 }}
        >
          <div className="p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-400">
                #{appointment.ticket.ticketNumber}
              </span>
              <span className="text-xs">
                {STATUS_ICONS[appointment.status]} {appointment.status.replace('_', ' ')}
              </span>
            </div>
            <h3 className="mt-1 text-sm font-medium text-slate-200 leading-tight">
              {appointment.ticket.title}
            </h3>
            <div className="mt-1.5 space-y-0.5 text-xs text-slate-400">
              <div>{appointment.ticket.client.name}</div>
              {appointment.ticket.site && (
                <div>
                  📍 {appointment.ticket.site.name}
                  {appointment.ticket.site.address && ` · ${appointment.ticket.site.address}`}
                </div>
              )}
              <div>
                🕐 {formatTime(appointment.scheduledStart)} – {formatTime(appointment.scheduledEnd)}
              </div>
              <div>👤 {appointment.technician.name}</div>
              {appointment.travelMinutes && (
                <div>🚗 {appointment.travelMinutes}min travel</div>
              )}
              {appointment.notes && (
                <div className="mt-1 text-slate-500 italic">{appointment.notes}</div>
              )}
            </div>

            {/* Status buttons */}
            {(nextStatuses[appointment.status] ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(nextStatuses[appointment.status] ?? []).map((action) => (
                  <button
                    key={action.status}
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(action.status) }}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      action.status === 'CANCELLED'
                        ? 'text-red-400 hover:bg-red-500/20'
                        : action.status === 'COMPLETE'
                          ? 'bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50'
                          : 'bg-th-elevated text-slate-200 hover:bg-th-border'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Footer links */}
            <div className="mt-3 flex items-center gap-3 border-t border-th-border/50 pt-2">
              <Link
                href={`/tickets/${appointment.ticketId}`}
                className="text-xs text-amber-400 hover:text-amber-300"
                onClick={(e) => e.stopPropagation()}
              >
                Open Ticket →
              </Link>
            </div>
          </div>

          {/* Click-away overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setShowPopover(false) }}
            style={{ zIndex: -1 }}
          />
        </div>
      )}
    </>
  )
}
