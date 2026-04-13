'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_AppointmentStatus } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createCharge } from './charges'
import { notifyUser } from '@/app/lib/notify-server'

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
    take: 100,
  })
}

/** Get all active techs with their working hours for the dispatch grid. */
export async function getActiveTechs() {
  return prisma.tH_User.findMany({
    where: { isActive: true, role: { in: ['GLOBAL_ADMIN', 'TICKETHUB_ADMIN', 'TECH', 'DISPATCHER'] } },
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

  // Notify assigned tech (unless they scheduled it themselves)
  if (input.technicianId !== userId) {
    const ticketInfo = await prisma.tH_Ticket.findUnique({
      where: { id: input.ticketId },
      select: { ticketNumber: true, title: true },
    })
    const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    notifyUser(input.technicianId, {
      title: `Scheduled: #${ticketInfo?.ticketNumber ?? '?'}`,
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
  if (appt.status !== 'COMPLETE') {
    await prisma.tH_Appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETE', actualEnd: new Date() },
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

  revalidatePath('/schedule')
  return { ok: true, id: appt.id }
}
