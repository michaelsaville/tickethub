import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { computeSlaDates } from '@/app/lib/sla-server'
import { notifyTeam, ticketUrl } from '@/app/lib/notify-server'
import { getConfig } from '@/app/lib/settings'
import type { TH_TicketPriority } from '@prisma/client'
import type { NotificationPriority } from '@/app/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── SEVERITY → PRIORITY MAP ─────────────────────────────────────────────

const SEVERITY_TO_PRIORITY: Record<string, TH_TicketPriority> = {
  critical: 'URGENT',
  warning: 'HIGH',
  info: 'MEDIUM',
}

const PRIORITY_TO_NOTIFY: Record<string, NotificationPriority> = {
  URGENT: 'critical',
  HIGH: 'high',
  MEDIUM: 'normal',
}

// ─── SYSTEM ACTOR ─────────────────────────────────────────────────────────

let systemActorCache: { id: string | null; at: number } = { id: null, at: 0 }

async function getSystemActorId(): Promise<string | null> {
  if (systemActorCache.id && Date.now() - systemActorCache.at < 3_600_000) {
    return systemActorCache.id
  }
  const row = await prisma.tH_User.findFirst({
    where: { role: 'GLOBAL_ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  systemActorCache.id = row?.id ?? null
  systemActorCache.at = Date.now()
  return systemActorCache.id
}

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────

/**
 * ConnectWise RMM alert webhook.
 *
 * Receives alert payloads from ConnectWise RMM, deduplicates against
 * existing open tickets, creates a new ticket if unique, and notifies
 * the team based on severity.
 */
export async function POST(req: NextRequest) {
  // ── Validate webhook secret ──────────────────────────────────────────
  const secret = await getConfig('CONNECTWISE_RMM_WEBHOOK_SECRET')
  if (!secret) {
    console.error('[cw-rmm webhook] CONNECTWISE_RMM_WEBHOOK_SECRET not set')
    return NextResponse.json(
      { data: null, error: 'Webhook not configured' },
      { status: 500 },
    )
  }

  const incomingSecret = req.headers.get('x-webhook-secret')
  if (incomingSecret !== secret) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  // ── Parse payload ────────────────────────────────────────────────────
  let payload: {
    alertId?: string
    alertType?: string
    severity?: string
    deviceId?: string
    deviceName?: string
    siteName?: string
    message?: string
    timestamp?: string
    diagnostics?: string
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  const alertId = payload.alertId ?? ''
  const alertType = payload.alertType ?? 'Unknown Alert'
  const severity = (payload.severity ?? 'info').toLowerCase()
  const deviceId = payload.deviceId ?? ''
  const deviceName = payload.deviceName ?? 'Unknown Device'
  const siteName = payload.siteName ?? ''
  const message = payload.message ?? ''
  const timestamp = payload.timestamp ?? new Date().toISOString()

  if (!alertId) {
    return NextResponse.json(
      { data: null, error: 'Missing alertId' },
      { status: 400 },
    )
  }

  // ── Duplicate check ──────────────────────────────────────────────────
  // Look for an existing open ticket tagged with this exact alertId.
  const existing = await prisma.tH_TicketTag.findFirst({
    where: {
      tag: `alertId:${alertId}`,
      ticket: {
        status: { notIn: ['CLOSED', 'CANCELLED'] },
      },
    },
    select: { ticketId: true },
  })

  if (existing) {
    return NextResponse.json(
      { data: { ticketId: existing.ticketId, duplicate: true }, error: null },
      { status: 409 },
    )
  }

  // ── Resolve system actor ─────────────────────────────────────────────
  const systemId = await getSystemActorId()
  if (!systemId) {
    console.error('[cw-rmm webhook] No active GLOBAL_ADMIN user found')
    return NextResponse.json(
      { data: null, error: 'No system user configured' },
      { status: 500 },
    )
  }

  // ── Try to match client by site name ─────────────────────────────────
  let clientId: string | null = null
  if (siteName) {
    const client = await prisma.tH_Client.findFirst({
      where: {
        name: { equals: siteName, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true },
    })
    clientId = client?.id ?? null
  }

  // Fall back to first active client if no match (prevents creation failure)
  if (!clientId) {
    const fallback = await prisma.tH_Client.findFirst({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true },
    })
    clientId = fallback?.id ?? null
  }

  if (!clientId) {
    console.error('[cw-rmm webhook] No active client found')
    return NextResponse.json(
      { data: null, error: 'No active client found' },
      { status: 500 },
    )
  }

  // ── Map priority ─────────────────────────────────────────────────────
  const priority: TH_TicketPriority =
    SEVERITY_TO_PRIORITY[severity] ?? 'MEDIUM'

  // ── Resolve contract (global fallback) ───────────────────────────────
  const globalContract = await prisma.tH_Contract.findFirst({
    where: { clientId, isGlobal: true },
    select: { id: true },
  })
  const contractId = globalContract?.id ?? null

  // ── Compute SLA dates ────────────────────────────────────────────────
  const { slaResponseDue, slaResolveDue } = await computeSlaDates(priority)

  // ── Build ticket description ─────────────────────────────────────────
  const title = `[RMM] ${alertType} - ${deviceName}`
  const description = [
    `**ConnectWise RMM Alert**`,
    ``,
    `**Alert Type:** ${alertType}`,
    `**Severity:** ${severity}`,
    `**Device:** ${deviceName} (${deviceId})`,
    `**Site:** ${siteName || 'N/A'}`,
    `**Timestamp:** ${timestamp}`,
    ``,
    `**Message:**`,
    message || '(no message)',
    payload.diagnostics ? `\n**Diagnostics:**\n${payload.diagnostics}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  // ── Create ticket + tags in a transaction ────────────────────────────
  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.tH_Ticket.create({
        data: {
          clientId,
          contractId,
          title,
          description,
          priority,
          type: 'INCIDENT',
          status: 'NEW',
          createdById: systemId,
          slaResponseDue,
          slaResolveDue,
        },
      })

      await tx.tH_TicketEvent.create({
        data: {
          ticketId: t.id,
          userId: systemId,
          type: 'CREATED',
          data: { priority, type: 'INCIDENT', source: 'connectwise-rmm' },
        },
      })

      // Add tags for tracking and deduplication
      await tx.tH_TicketTag.createMany({
        data: [
          { ticketId: t.id, tag: 'source:connectwise-rmm' },
          { ticketId: t.id, tag: `alertId:${alertId}` },
        ],
      })

      return t
    })

    // ── Notify team ────────────────────────────────────────────────────
    const notifyPriority = PRIORITY_TO_NOTIFY[priority] ?? 'normal'
    notifyTeam({
      title: `[RMM] ${priority} alert: #${ticket.ticketNumber}`,
      body: `${siteName || 'Unknown site'} — ${alertType} on ${deviceName}`,
      url: ticketUrl(ticket.id),
      priority: notifyPriority as NotificationPriority,
      category: priority === 'URGENT' || priority === 'HIGH' ? 'NEW_HIGH' : 'INFO',
    })

    console.log(
      `[cw-rmm webhook] Created ticket #${ticket.ticketNumber} for alert ${alertId}`,
    )

    return NextResponse.json(
      {
        data: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          duplicate: false,
        },
        error: null,
      },
      { status: 200 },
    )
  } catch (e) {
    console.error('[cw-rmm webhook] Failed to create ticket', e)
    return NextResponse.json(
      { data: null, error: 'Failed to create ticket' },
      { status: 500 },
    )
  }
}
