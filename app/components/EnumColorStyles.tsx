import type { EnumDisplay, EnumName } from '@/app/lib/enum-overrides'

const STATUS_VAR: Record<string, string> = {
  NEW: '--th-new',
  OPEN: '--th-open',
  IN_PROGRESS: '--th-in-progress',
  WAITING_CUSTOMER: '--th-waiting',
  WAITING_THIRD_PARTY: '--th-waiting',
  RESOLVED: '--th-resolved',
  CLOSED: '--th-closed',
  CANCELLED: '--th-cancelled',
}

const PRIORITY_VAR: Record<string, string> = {
  URGENT: '--th-urgent',
  HIGH: '--th-high',
  MEDIUM: '--th-medium',
  LOW: '--th-low',
}

/**
 * Renders a tiny `<style>` block that overrides the global ticket-color
 * CSS variables from admin overrides. Mounted once at layout root so all
 * existing `badge-status-*` / `badge-priority-*` classes pick up the new
 * colors automatically.
 *
 * Type colors are not currently mapped to CSS vars (no badge-type-* class
 * exists), so type overrides only affect labels, not colors.
 */
export function EnumColorStyles({
  enums,
}: {
  enums: Record<EnumName, EnumDisplay[]>
}) {
  const overrides: string[] = []

  for (const d of enums.TICKET_STATUS) {
    if (d.color && STATUS_VAR[d.value]) {
      overrides.push(`${STATUS_VAR[d.value]}: ${d.color};`)
    }
  }
  for (const d of enums.TICKET_PRIORITY) {
    if (d.color && PRIORITY_VAR[d.value]) {
      overrides.push(`${PRIORITY_VAR[d.value]}: ${d.color};`)
    }
  }

  if (overrides.length === 0) return null
  return <style>{`:root{${overrides.join('')}}`}</style>
}
