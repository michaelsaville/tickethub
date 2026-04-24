'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_AppointmentStatus } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createCharge } from './charges'
import { notifyUser } from '@/app/lib/notify-server'
import { m365Configured, sendMail } from '@/app/lib/m365'
import { isAutomationEnabled } from '@/app/lib/settings'
import { updateTicketStatusCore } from '@/app/lib/tickets-core'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

export type AppointmentResult = { ok: true; id?: string } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

// ─── Queries ─────────────────────────────────────────────────────────────

/** Fetch all appointments for a given week (Mon 00:00 → Sun 23:59). */
export async function getAppointmentsForWeek(weekStart: Date) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  return prisma.tH_Appointment.findMany({
    where: {
      scheduledStart: { gte: weekStart },
      scheduledEnd: { lt: weekEnd },
      status: { not: 'CANCELLED' },
    },
    include: {
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          priority: true,
          status: true,
          board: true,
          clientId: true,
          client: { select: { id: true, name: true, shortCode: true } },
          siteId: true,
          site: { select: { id: true, name: true, address: true, city: true } },
        },
      },
      technician: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  })
}

/** Tickets eligible for the unscheduled queue: open-ish, no future appointment. */
export async function getUnscheduledTickets() {
  const now = new Date()
  return prisma.tH_Ticket.findMany({
    where: {
      status: { in: ['NEW', 'OPEN', 'IN_PROGRESS'] },
      appointments: {
        none: {
          scheduledStart: { gte: now },
          status: { not: 'CANCELLED' },
        },
      },
    },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      priority: true,
      status: true,
      board: true,
      estimatedMinutes: true,
      clientId: true,
      client: { select: { id: true, name: true, shortCode: true } },
      siteId: true,
      site: { select: { id: true, name: true } },
    },
    orderBy: [
      { priority: 'asc' }, // URGENT first (enum ordering)
      { createdAt: 'asc' },
    ],
    take: 250,
  })
}

/** Get all active on-site techs for the dispatch grid. */
export async function getActiveTechs() {
  return prisma.tH_User.findMany({
    where: { isActive: true, isOnsiteTech: true },
    select: {
      id: true,
      name: true,
      email: true,
      workingHours: true,
    },
    orderBy: { name: 'asc' },
  })
}

// ─── Mutations ───────────────────────────────────────────────────────────

/** Create appointment (drag ticket to grid). */
export async function createAppointment(input: {
  ticketId: string
  technicianId: string
  scheduledStart: string // ISO string
  scheduledEnd: string   // ISO string
  notes?: string
  travelMinutes?: number
}): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const start = new Date(input.scheduledStart)
  const end = new Date(input.scheduledEnd)
  if (end <= start) return { ok: false, error: 'End must be after start' }

  // Verify ticket exists
  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true },
  })
  if (!ticket) return { ok: false, error: 'Ticket not found' }

  const appt = await prisma.tH_Appointment.create({
    data: {
      ticketId: input.ticketId,
      technicianId: input.technicianId,
      createdById: userId,
      scheduledStart: start,
      scheduledEnd: end,
      notes: input.notes ?? null,
      travelMinutes: input.travelMinutes ?? null,
      status: 'SCHEDULED',
    },
  })

  await emit({
    type: EVENT_TYPES.APPOINTMENT_SCHEDULED,
    entityType: 'appointment',
    entityId: appt.id,
    actorId: userId,
    payload: {
      ticketId: input.ticketId,
      technicianId: input.technicianId,
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
    },
  })

  // Notify assigned tech (unless they scheduled it themselves). When the
  // on-site workflow is active and this ticket is on the On-Site board,
  // prefix the title so the tech sees immediately that it's a field visit.
  if (input.technicianId !== userId) {
    const ticketInfo = await prisma.tH_Ticket.findUnique({
      where: { id: input.ticketId },
      select: { ticketNumber: true, title: true, board: true },
    })
    const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const onsiteActive =
      ticketInfo?.board === 'On-Site' &&
      (await isAutomationEnabled('onsite_workflow.enabled'))
    const prefix = onsiteActive ? 'On-Site Scheduled' : 'Scheduled'
    notifyUser(input.technicianId, {
      title: `${prefix}: #${ticketInfo?.ticketNumber ?? '?'}`,
      body: `${ticketInfo?.title ?? 'Ticket'} — ${dateStr} at ${timeStr}`,
      url: `/schedule`,
      category: 'ASSIGNED',
    }).catch(() => {})
  }

  revalidatePath('/schedule')
  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true, id: appt.id }
}

/** Move appointment to a different time/tech (drag on grid). */
export async function moveAppointment(
  appointmentId: string,
  input: {
    technicianId?: string
    scheduledStart: string
    scheduledEnd: string
  },
): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const appt = await prisma.tH_Appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true },
  })
  if (!appt) return { ok: false, error: 'Appointment not found' }
  if (appt.status === 'COMPLETE' || appt.status === 'CANCELLED') {
    return { ok: false, error: 'Cannot move a completed/cancelled appointment' }
  }

  const start = new Date(input.scheduledStart)
  const end = new Date(input.scheduledEnd)
  if (end <= start) return { ok: false, error: 'End must be after start' }

  await prisma.tH_Appointment.update({
    where: { id: appointmentId },
    data: {
      scheduledStart: start,
      scheduledEnd: end,
      ...(input.technicianId ? { technicianId: input.technicianId } : {}),
    },
  })

  revalidatePath('/schedule')
  return { ok: true }
}

/** Resize appointment (drag bottom edge). */
export async function resizeAppointment(
  appointmentId: string,
  newEnd: string,
): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const appt = await prisma.tH_Appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true, scheduledStart: true },
  })
  if (!appt) return { ok: false, error: 'Appointment not found' }
  if (appt.status === 'COMPLETE' || appt.status === 'CANCELLED') {
    return { ok: false, error: 'Cannot resize a completed/cancelled appointment' }
  }

  const end = new Date(newEnd)
  if (end <= appt.scheduledStart) return { ok: false, error: 'End must be after start' }

  await prisma.tH_Appointment.update({
    where: { id: appointmentId },
    data: { scheduledEnd: end },
  })

  revalidatePath('/schedule')
  return { ok: true }
}

/** Transition appointment status. */
export async function updateAppointmentStatus(
  appointmentId: string,
  newStatus: TH_AppointmentStatus,
): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const appt = await prisma.tH_Appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      status: true,
      technicianId: true,
      ticketId: true,
      scheduledStart: true,
      scheduledEnd: true,
      ticket: { select: { ticketNumber: true, title: true } },
    },
  })
  if (!appt) return { ok: false, error: 'Appointment not found' }

  // Validate transitions
  const VALID_TRANSITIONS: Record<string, TH_AppointmentStatus[]> = {
    SCHEDULED: ['EN_ROUTE', 'ON_SITE', 'CANCELLED'],
    EN_ROUTE: ['ON_SITE', 'CANCELLED'],
    ON_SITE: ['COMPLETE', 'CANCELLED'],
    COMPLETE: [],
    CANCELLED: [],
  }
  const allowed = VALID_TRANSITIONS[appt.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { ok: false, error: `Cannot transition from ${appt.status} to ${newStatus}` }
  }

  const now = new Date()
  const data: Record<string, unknown> = { status: newStatus }

  if (newStatus === 'EN_ROUTE' || newStatus === 'ON_SITE') {
    data.actualStart = now
  }
  if (newStatus === 'COMPLETE') {
    data.actualEnd = now
  }

  await prisma.tH_Appointment.update({
    where: { id: appointmentId },
    data,
  })

  const specificEvent =
    newStatus === 'COMPLETE'
      ? EVENT_TYPES.APPOINTMENT_COMPLETED
      : newStatus === 'CANCELLED'
        ? EVENT_TYPES.APPOINTMENT_CANCELLED
        : EVENT_TYPES.APPOINTMENT_STATUS_CHANGED
  await emit({
    type: specificEvent,
    entityType: 'appointment',
    entityId: appointmentId,
    actorId: userId,
    payload: {
      from: appt.status,
      to: newStatus,
      ticketId: appt.ticketId,
      technicianId: appt.technicianId,
    },
  })

  // Notify tech of status change (unless they did it themselves)
  if (appt.technicianId !== userId) {
    const statusLabel: Record<string, string> = {
      EN_ROUTE: 'en route',
      ON_SITE: 'on site',
      COMPLETE: 'completed',
      CANCELLED: 'cancelled',
    }
    notifyUser(appt.technicianId, {
      title: `Appointment ${statusLabel[newStatus] ?? newStatus}: #${appt.ticket.ticketNumber}`,
      body: appt.ticket.title,
      url: `/schedule`,
      category: newStatus === 'CANCELLED' ? 'SLA' : 'ASSIGNED',
      priority: newStatus === 'CANCELLED' ? 'high' : 'normal',
    }).catch(() => {})
  }

  revalidatePath('/schedule')
  return { ok: true }
}

/** Cancel an appointment. */
export async function cancelAppointment(
  appointmentId: string,
): Promise<AppointmentResult> {
  return updateAppointmentStatus(appointmentId, 'CANCELLED')
}

/**
 * Complete an appointment and create a LABOR charge.
 * Duration = actualEnd − actualStart (or scheduled if no actuals).
 * Rounds up to nearest `roundMinutes` (default 15).
 */
export async function completeAndCharge(
  appointmentId: string,
  input?: {
    /** Override the item to bill — defaults to the first active LABOR item. */
    itemId?: string
    /** Override duration in minutes instead of computing from timestamps. */
    durationMinutes?: number
    /** Rounding increment in minutes. Default 15. */
    roundMinutes?: number
    /** Description for the charge. */
    description?: string
  },
): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const appt = await prisma.tH_Appointment.findUnique({
    where: { id: appointmentId },
    include: {
      ticket: {
        select: { id: true, contractId: true, clientId: true },
      },
    },
  })
  if (!appt) return { ok: false, error: 'Appointment not found' }
  if (appt.chargeId) return { ok: true } // Already charged — idempotent

  // Mark complete if not already
  const wasAlreadyComplete = appt.status === 'COMPLETE'
  if (!wasAlreadyComplete) {
    await prisma.tH_Appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETE', actualEnd: new Date() },
    })
    await emit({
      type: EVENT_TYPES.APPOINTMENT_COMPLETED,
      entityType: 'appointment',
      entityId: appointmentId,
      actorId: userId,
      payload: {
        from: appt.status,
        to: 'COMPLETE',
        ticketId: appt.ticketId,
        technicianId: appt.technicianId,
        viaCompleteAndCharge: true,
      },
    })
  }

  // Calculate duration
  const roundMin = input?.roundMinutes ?? 15
  let durationMinutes: number

  if (input?.durationMinutes && input.durationMinutes > 0) {
    durationMinutes = input.durationMinutes
  } else {
    const start = appt.actualStart ?? appt.scheduledStart
    const end = appt.actualEnd ?? appt.scheduledEnd
    durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000))
  }

  // Round up to nearest increment
  const chargedMinutes = Math.ceil(durationMinutes / roundMin) * roundMin

  // Find a LABOR item to bill against
  let itemId = input?.itemId
  if (!itemId) {
    const laborItem = await prisma.tH_Item.findFirst({
      where: { type: 'LABOR', isActive: true },
      select: { id: true },
      orderBy: { name: 'asc' },
    })
    if (!laborItem) return { ok: false, error: 'No active LABOR item in catalog' }
    itemId = laborItem.id
  }

  // Create the charge via existing createCharge action
  const chargeResult = await createCharge(appt.ticketId, {
    itemId,
    durationMinutes,
    chargedMinutes,
    description: input?.description ?? `On-site appointment`,
    overrideUserId: appt.technicianId,
    workDate: appt.actualStart ?? appt.scheduledStart,
  })

  if (!chargeResult.ok) {
    return { ok: false, error: (chargeResult as { error: string }).error }
  }

  // Link the charge to the appointment
  // Find the most recent charge for this tech + ticket to link
  const recentCharge = await prisma.tH_Charge.findFirst({
    where: {
      ticketId: appt.ticketId,
      technicianId: appt.technicianId,
      type: 'LABOR',
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (recentCharge) {
    await prisma.tH_Appointment.update({
      where: { id: appointmentId },
      data: { chargeId: recentCharge.id },
    })
  }

  revalidatePath('/schedule')
  revalidatePath(`/tickets/${appt.ticketId}`)
  return { ok: true }
}

/**
 * Send the client primary contact an appointment confirmation for a
 * scheduled on-site visit. Gated on:
 *   - onsite_workflow.enabled automation flag
 *   - ticket board = 'On-Site'
 *   - m365 configured
 *   - client has a primary contact with an email (or billingEmail)
 *   - per-client emailClientOnTicketEvents not false
 */
export async function sendOnsiteConfirmationEmail(
  appointmentId: string,
): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  if (!(await isAutomationEnabled('onsite_workflow.enabled'))) {
    return { ok: false, error: 'On-site workflow automation is disabled' }
  }
  if (!m365Configured()) {
    return { ok: false, error: 'M365 mailer not configured' }
  }

  const appt = await prisma.tH_Appointment.findUnique({
    where: { id: appointmentId },
    include: {
      technician: { select: { name: true } },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          board: true,
          client: {
            select: {
              name: true,
              billingEmail: true,
              emailClientOnTicketEvents: true,
              contacts: {
                where: { isActive: true, email: { not: null } },
                orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
                take: 1,
                select: { firstName: true, email: true },
              },
            },
          },
          site: { select: { name: true, address: true, city: true, state: true } },
        },
      },
    },
  })
  if (!appt) return { ok: false, error: 'Appointment not found' }
  if (appt.ticket.board !== 'On-Site') {
    return { ok: false, error: 'Ticket is not on the On-Site board' }
  }
  if (!appt.ticket.client.emailClientOnTicketEvents) {
    return { ok: false, error: 'Client has disabled ticket emails' }
  }

  const contact = appt.ticket.client.contacts[0]
  const toEmail = contact?.email ?? appt.ticket.client.billingEmail ?? null
  if (!toEmail) return { ok: false, error: 'Client has no contact email' }

  const startDate = appt.scheduledStart
  const dateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const endTimeStr = appt.scheduledEnd.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const greeting = contact?.firstName ? `Hi ${contact.firstName},` : 'Hi,'
  const siteLine = appt.ticket.site
    ? `${appt.ticket.site.name}${appt.ticket.site.address ? ` · ${appt.ticket.site.address}` : ''}${appt.ticket.site.city ? `, ${appt.ticket.site.city}` : ''}${appt.ticket.site.state ? `, ${appt.ticket.site.state}` : ''}`
    : appt.ticket.client.name
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const subject = `[#TH-${appt.ticket.ticketNumber}] On-site visit scheduled — ${dateStr}`
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 600px;">
  <p>${greeting}</p>
  <p>This confirms your on-site visit for ticket <strong>#${appt.ticket.ticketNumber}</strong>.</p>
  <table style="margin: 12px 0; border-collapse: collapse;">
    <tr><td style="padding: 4px 12px 4px 0; color: #666;">Reason</td><td style="padding: 4px 0;">${escape(appt.ticket.title)}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td style="padding: 4px 0;"><strong>${dateStr}</strong></td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #666;">Time</td><td style="padding: 4px 0;">${timeStr} – ${endTimeStr}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #666;">Location</td><td style="padding: 4px 0;">${escape(siteLine)}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #666;">Technician</td><td style="padding: 4px 0;">${escape(appt.technician.name)}</td></tr>
  </table>
  <p style="color: #666; font-size: 12px;">Need to reschedule? Reply to this email with <strong>[#TH-${appt.ticket.ticketNumber}]</strong> in the subject and we'll pick it up.</p>
  <p style="color: #999; font-size: 11px;">PCC2K · TicketHub</p>
</body></html>`.trim()

  try {
    await sendMail({ to: [toEmail], subject, html })
  } catch (e) {
    console.error('[appointments] onsite confirm sendMail failed', e)
    return { ok: false, error: 'Failed to send — check M365 configuration' }
  }

  await prisma.tH_TicketEmailOutbound.create({
    data: {
      ticketId: appt.ticket.id,
      mode: 'ONSITE_CONFIRMATION',
      toEmail: toEmail.toLowerCase(),
      subject,
    },
  })
  await prisma.tH_Appointment.update({
    where: { id: appointmentId },
    data: { confirmationEmailSentAt: new Date() },
  })

  revalidatePath('/schedule')
  return { ok: true }
}

/** Fetch appointments for a single ticket. Drives the ticket-page scheduler widget. */
export async function getAppointmentsForTicket(ticketId: string) {
  return prisma.tH_Appointment.findMany({
    where: { ticketId, status: { not: 'CANCELLED' } },
    include: {
      technician: { select: { id: true, name: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  })
}

/**
 * Create one appointment per selected tech for this ticket, all sharing
 * the same start/end. Auto-advances NEW → OPEN (scheduled work has
 * moved past triage). Used by the mini-scheduler on the ticket page.
 */
export async function scheduleVisitFromTicket(input: {
  ticketId: string
  technicianIds: string[]
  scheduledStart: string
  durationMinutes: number
  notes?: string
}): Promise<AppointmentResult & { createdIds?: string[] }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  if (input.technicianIds.length === 0) {
    return { ok: false, error: 'Pick at least one technician' }
  }
  if (input.durationMinutes <= 0) {
    return { ok: false, error: 'Duration must be > 0' }
  }

  const start = new Date(input.scheduledStart)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: 'Invalid start time' }
  }
  const end = new Date(start.getTime() + input.durationMinutes * 60_000)

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, ticketNumber: true, title: true, board: true },
  })
  if (!ticket) return { ok: false, error: 'Ticket not found' }

  const createdIds: string[] = []
  for (const techId of input.technicianIds) {
    const appt = await prisma.tH_Appointment.create({
      data: {
        ticketId: input.ticketId,
        technicianId: techId,
        createdById: userId,
        scheduledStart: start,
        scheduledEnd: end,
        notes: input.notes ?? null,
        status: 'SCHEDULED',
      },
    })
    createdIds.push(appt.id)

    await emit({
      type: EVENT_TYPES.APPOINTMENT_SCHEDULED,
      entityType: 'appointment',
      entityId: appt.id,
      actorId: userId,
      payload: {
        ticketId: input.ticketId,
        technicianId: techId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        viaScheduleVisitFromTicket: true,
      },
    })

    if (techId !== userId) {
      const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const onsiteActive =
        ticket.board === 'On-Site' &&
        (await isAutomationEnabled('onsite_workflow.enabled'))
      const prefix = onsiteActive ? 'On-Site Scheduled' : 'Scheduled'
      notifyUser(techId, {
        title: `${prefix}: #${ticket.ticketNumber}`,
        body: `${ticket.title} — ${dateStr} at ${timeStr}`,
        url: `/schedule`,
        category: 'ASSIGNED',
      }).catch(() => {})
    }
  }

  // Auto-advance NEW → OPEN; uses the core updater so SLA timers and the
  // timeline event are handled correctly.
  if (ticket.status === 'NEW') {
    await updateTicketStatusCore(userId, input.ticketId, 'OPEN')
  }

  revalidatePath('/schedule')
  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true, createdIds }
}

/** Add another tech to the same ticket at the same time. */
export async function addTechToAppointment(
  sourceAppointmentId: string,
  technicianId: string,
): Promise<AppointmentResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const source = await prisma.tH_Appointment.findUnique({
    where: { id: sourceAppointmentId },
    select: {
      ticketId: true,
      scheduledStart: true,
      scheduledEnd: true,
      notes: true,
      travelMinutes: true,
    },
  })
  if (!source) return { ok: false, error: 'Source appointment not found' }

  const appt = await prisma.tH_Appointment.create({
    data: {
      ticketId: source.ticketId,
      technicianId,
      createdById: userId,
      scheduledStart: source.scheduledStart,
      scheduledEnd: source.scheduledEnd,
      notes: source.notes,
      travelMinutes: source.travelMinutes,
      status: 'SCHEDULED',
    },
  })

  await emit({
    type: EVENT_TYPES.APPOINTMENT_SCHEDULED,
    entityType: 'appointment',
    entityId: appt.id,
    actorId: userId,
    payload: {
      ticketId: source.ticketId,
      technicianId,
      scheduledStart: source.scheduledStart.toISOString(),
      scheduledEnd: source.scheduledEnd.toISOString(),
      viaAddTechToAppointment: true,
    },
  })

  revalidatePath('/schedule')
  return { ok: true, id: appt.id }
}
