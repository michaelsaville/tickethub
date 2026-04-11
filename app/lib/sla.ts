import type { TH_TicketPriority, TH_TicketStatus } from '@prisma/client'

// Client-safe SLA helpers. No prisma import so this module can be pulled
// into client components. DB-touching helpers live in ./sla-server.ts.

export type SlaHealth =
  | 'NO_SLA'
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'CRITICAL'
  | 'BREACHED'
  | 'PAUSED'

export interface SlaState {
  health: SlaHealth
  remainingMs: number | null
  label: string
}

export type SlaTicketInput = {
  slaResolveDue: Date | string | null
  slaPausedAt: Date | string | null
  slaBreached: boolean
  createdAt: Date | string
}

export const DEFAULT_POLICIES: Record<
  TH_TicketPriority,
  { responseMinutes: number; resolveMinutes: number }
> = {
  URGENT: { responseMinutes: 15, resolveMinutes: 2 * 60 },
  HIGH: { responseMinutes: 60, resolveMinutes: 8 * 60 },
  MEDIUM: { responseMinutes: 4 * 60, resolveMinutes: 24 * 60 },
  LOW: { responseMinutes: 8 * 60, resolveMinutes: 72 * 60 },
}

const PAUSING_STATUSES: TH_TicketStatus[] = [
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
]

export function isPausingStatus(status: TH_TicketStatus): boolean {
  return PAUSING_STATUSES.includes(status)
}

function toDate(v: Date | string | null): Date | null {
  if (v === null) return null
  return v instanceof Date ? v : new Date(v)
}

export function getSlaState(
  ticket: SlaTicketInput,
  now: Date = new Date(),
): SlaState {
  if (ticket.slaPausedAt) {
    return { health: 'PAUSED', remainingMs: null, label: 'PAUSED' }
  }
  const due = toDate(ticket.slaResolveDue)
  if (!due) return { health: 'NO_SLA', remainingMs: null, label: '—' }

  const nowMs = now.getTime()
  const remainingMs = due.getTime() - nowMs

  if (remainingMs < 0 || ticket.slaBreached) {
    return {
      health: 'BREACHED',
      remainingMs,
      label: `-${formatDuration(Math.abs(remainingMs))}`,
    }
  }

  const start = toDate(ticket.createdAt)!.getTime()
  const total = due.getTime() - start
  const elapsed = nowMs - start
  const pct = total > 0 ? elapsed / total : 0

  const label = formatDuration(remainingMs)
  if (pct >= 0.9) return { health: 'CRITICAL', remainingMs, label }
  if (pct >= 0.5) return { health: 'AT_RISK', remainingMs, label }
  return { health: 'ON_TRACK', remainingMs, label }
}

export function slaBadgeClass(health: SlaHealth): string {
  switch (health) {
    case 'ON_TRACK':
      return 'badge-sla-ok'
    case 'AT_RISK':
      return 'badge-sla-warning'
    case 'CRITICAL':
      return 'badge-sla-critical'
    case 'BREACHED':
      return 'badge-sla-breached'
    case 'PAUSED':
    case 'NO_SLA':
      return 'badge-sla-paused'
  }
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 60) return `${totalMin}m`
  const totalHr = Math.floor(totalMin / 60)
  if (totalHr < 24) {
    const m = totalMin % 60
    return m ? `${totalHr}h ${m}m` : `${totalHr}h`
  }
  const d = Math.floor(totalHr / 24)
  const h = totalHr % 24
  return h ? `${d}d ${h}h` : `${d}d`
}
