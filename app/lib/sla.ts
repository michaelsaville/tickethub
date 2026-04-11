import type { TH_Ticket } from '@prisma/client'

export type SlaHealth =
  | 'NO_SLA'
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'CRITICAL'
  | 'BREACHED'
  | 'PAUSED'

export interface SlaState {
  health: SlaHealth
  /** Milliseconds until resolveDue. Negative when breached. */
  remainingMs: number | null
  /** Short human label e.g. "2d 14h", "3h 20m", "-2h 30m", "PAUSED". */
  label: string
}

type SlaInput = Pick<
  TH_Ticket,
  'slaResolveDue' | 'slaPausedAt' | 'slaBreached' | 'createdAt'
>

/**
 * Derive SLA health from a ticket's SLA fields and current time.
 * Thresholds from PLANNING.md §12:
 *   50% elapsed → AT_RISK
 *   90% elapsed → CRITICAL
 *   100%+       → BREACHED
 */
export function getSlaState(ticket: SlaInput, now: Date = new Date()): SlaState {
  if (ticket.slaPausedAt) {
    return { health: 'PAUSED', remainingMs: null, label: 'PAUSED' }
  }
  if (!ticket.slaResolveDue) {
    return { health: 'NO_SLA', remainingMs: null, label: '—' }
  }

  const due = ticket.slaResolveDue.getTime()
  const nowMs = now.getTime()
  const remainingMs = due - nowMs

  if (remainingMs < 0 || ticket.slaBreached) {
    return {
      health: 'BREACHED',
      remainingMs,
      label: `-${formatDuration(Math.abs(remainingMs))}`,
    }
  }

  const start = ticket.createdAt.getTime()
  const total = due - start
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
      return 'badge-sla-paused'
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
