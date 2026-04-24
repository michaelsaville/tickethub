import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { notifyTeam, ticketUrl } from '@/app/lib/notify-server'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// SLA escalation cron — run every 5 minutes via host crontab.
// Example entry (cron every-5-min spec is slash-star-five star-star-star):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://tickethub.pcc2k.com/api/cron/sla-check
//
// For each non-terminal, non-paused ticket with a SLA deadline, compute
// the elapsed fraction (created to due). If the fraction crosses a new
// threshold (50 / 75 / 90 / 100) since the last check (tracked on
// slaLastNotifiedBps), fire a notifyTeam broadcast. Idempotent —
// running twice in the same window is a no-op.

const THRESHOLDS: Array<{
  bps: number
  label: string
  priority: 'normal' | 'high' | 'critical'
}> = [
  { bps: 50, label: 'half-elapsed', priority: 'normal' },
  { bps: 75, label: 'at risk', priority: 'high' },
  { bps: 90, label: 'critical', priority: 'critical' },
  { bps: 100, label: 'BREACHED', priority: 'critical' },
]

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const now = new Date()
  const tickets = await prisma.tH_Ticket.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
      slaPausedAt: null,
      slaResolveDue: { not: null },
    },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      priority: true,
      createdAt: true,
      slaResolveDue: true,
      slaLastNotifiedBps: true,
      client: { select: { name: true, shortCode: true } },
    },
  })

  const fired: Array<{ ticketId: string; threshold: number }> = []

  for (const t of tickets) {
    if (!t.slaResolveDue) continue
    const start = t.createdAt.getTime()
    const due = t.slaResolveDue.getTime()
    const total = due - start
    const elapsed = now.getTime() - start
    const pct = total > 0 ? Math.floor((elapsed / total) * 100) : 0

    // Find the highest threshold crossed
    let crossed: (typeof THRESHOLDS)[number] | null = null
    for (const threshold of THRESHOLDS) {
      if (pct >= threshold.bps && threshold.bps > t.slaLastNotifiedBps) {
        crossed = threshold
      }
    }
    if (!crossed) continue

    const clientLabel = t.client.shortCode ?? t.client.name
    const title =
      crossed.bps === 100
        ? `SLA BREACHED: #${t.ticketNumber}`
        : `SLA ${crossed.bps}% — #${t.ticketNumber}`
    const body = `${t.priority} · ${clientLabel} — ${t.title}`

    await notifyTeam({
      title,
      body,
      url: ticketUrl(t.id),
      priority: crossed.priority,
    })

    await prisma.tH_Ticket.update({
      where: { id: t.id },
      data: {
        slaLastNotifiedBps: crossed.bps,
        ...(crossed.bps >= 100 ? { slaBreached: true } : {}),
      },
    })
    await emit({
      type: EVENT_TYPES.TICKET_SLA_THRESHOLD_CROSSED,
      entityType: 'ticket',
      entityId: t.id,
      actorId: null,
      payload: {
        level: crossed.bps,
        thresholdLabel: crossed.label,
        priority: t.priority,
        targetType: 'RESOLVE',
      },
    })
    fired.push({ ticketId: t.id, threshold: crossed.bps })
  }

  return NextResponse.json({
    data: {
      checkedAt: now.toISOString(),
      ticketCount: tickets.length,
      fired,
    },
    error: null,
  })
}
