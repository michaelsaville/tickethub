'use client'

import { useEffect, useState } from 'react'
import {
  getSlaState,
  slaBadgeClass,
  type SlaTicketInput,
} from '@/app/lib/sla'

/**
 * Client-side SLA badge that re-renders every 30s so the countdown
 * ticks without a page refresh. Server renders the initial state from
 * the same fields — no flash, no hydration mismatch.
 */
export function SlaBadge({ ticket }: { ticket: SlaTicketInput }) {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const h = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(h)
  }, [])
  const sla = getSlaState(ticket, now)
  if (sla.health === 'NO_SLA') {
    return <span className="text-xs text-th-text-muted">—</span>
  }
  return <span className={slaBadgeClass(sla.health)}>{sla.label}</span>
}
