'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type {
  TH_RecurringFrequency,
  TH_TicketPriority,
  TH_TicketType,
} from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createTicketCore } from '@/app/lib/tickets-core'
import {
  computeNextRunAt,
  type ScheduleInput,
} from '@/app/lib/recurring-tickets'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])
const VALID_FREQUENCIES: TH_RecurringFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY']
const VALID_PRIORITIES: TH_TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const VALID_TYPES: TH_TicketType[] = [
  'INCIDENT',
  'SERVICE_REQUEST',
  'PROBLEM',
  'CHANGE',
]

export type RecurringResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

async function requireAdminSession(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true, userId: session.user.id }
}

interface TemplateInput {
  name: string
  clientId: string
  siteId: string | null
  contactId: string | null
  contractId: string | null
  assignedToId: string | null
  title: string
  description: string | null
  priority: TH_TicketPriority
  type: TH_TicketType
  frequency: TH_RecurringFrequency
  interval: number
  dayOfWeek: number | null
  dayOfMonth: number | null
  hourOfDay: number
  minuteOfHour: number
  timezone: string
  active: boolean
}

function parseFormData(fd: FormData): TemplateInput | { error: string } {
  const str = (k: string) => (fd.get(k) as string | null)?.trim() ?? ''
  const strOrNull = (k: string) => {
    const v = str(k)
    return v === '' ? null : v
  }
  const intOrNull = (k: string) => {
    const v = str(k)
    if (v === '') return null
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }

  const name = str('name')
  if (!name) return { error: 'Name is required' }
  const clientId = str('clientId')
  if (!clientId) return { error: 'Client is required' }
  const title = str('title')
  if (!title) return { error: 'Ticket title is required' }

  const frequency = str('frequency') as TH_RecurringFrequency
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return { error: 'Invalid frequency' }
  }

  const priority = (str('priority') || 'MEDIUM') as TH_TicketPriority
  if (!VALID_PRIORITIES.includes(priority)) {
    return { error: 'Invalid priority' }
  }
  const type = (str('type') || 'SERVICE_REQUEST') as TH_TicketType
  if (!VALID_TYPES.includes(type)) {
    return { error: 'Invalid type' }
  }

  const interval = Math.max(1, intOrNull('interval') ?? 1)
  const dayOfWeek = intOrNull('dayOfWeek')
  const dayOfMonth = intOrNull('dayOfMonth')
  const hourOfDay = Math.max(0, Math.min(23, intOrNull('hourOfDay') ?? 8))
  const minuteOfHour = Math.max(0, Math.min(59, intOrNull('minuteOfHour') ?? 0))
  const timezone = str('timezone') || 'America/New_York'

  if (frequency === 'WEEKLY' && (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6)) {
    return { error: 'Weekly schedule requires a day of week (0–6)' }
  }
  if (frequency === 'MONTHLY' && (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 31)) {
    return { error: 'Monthly schedule requires a day of month (1–31)' }
  }

  return {
    name,
    clientId,
    siteId: strOrNull('siteId'),
    contactId: strOrNull('contactId'),
    contractId: strOrNull('contractId'),
    assignedToId: strOrNull('assignedToId'),
    title,
    description: strOrNull('description'),
    priority,
    type,
    frequency,
    interval,
    dayOfWeek: frequency === 'WEEKLY' ? dayOfWeek : null,
    dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : null,
    hourOfDay,
    minuteOfHour,
    timezone,
    active: fd.get('active') === 'on' || fd.get('active') === 'true',
  }
}

function toSchedule(t: TemplateInput): ScheduleInput {
  return {
    frequency: t.frequency,
    interval: t.interval,
    dayOfWeek: t.dayOfWeek,
    dayOfMonth: t.dayOfMonth,
    hourOfDay: t.hourOfDay,
    minuteOfHour: t.minuteOfHour,
    timezone: t.timezone,
  }
}

export async function createRecurringTemplate(
  _prev: RecurringResult | null,
  formData: FormData,
): Promise<RecurringResult> {
  const auth = await requireAdminSession()
  if (!auth.ok) return auth

  const parsed = parseFormData(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  try {
    const nextRunAt = computeNextRunAt(toSchedule(parsed), new Date())
    const created = await prisma.tH_RecurringTicketTemplate.create({
      data: {
        ...parsed,
        nextRunAt,
        createdById: auth.userId,
      },
      select: { id: true },
    })
    revalidatePath('/recurring-tickets')
    return { ok: true, id: created.id }
  } catch (e: unknown) {
    console.error('[recurring-tickets] create failed', e)
    return { ok: false, error: 'Failed to create template' }
  }
}

export async function updateRecurringTemplate(
  templateId: string,
  _prev: RecurringResult | null,
  formData: FormData,
): Promise<RecurringResult> {
  const auth = await requireAdminSession()
  if (!auth.ok) return auth

  const parsed = parseFormData(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  try {
    // Re-compute nextRunAt when the schedule shape changes, anchoring on
    // the greater of now and existing nextRunAt so we don't spam-fire
    // missed runs from a past nextRunAt after editing.
    const existing = await prisma.tH_RecurringTicketTemplate.findUnique({
      where: { id: templateId },
      select: { nextRunAt: true },
    })
    if (!existing) return { ok: false, error: 'Template not found' }
    const now = new Date()
    const anchor = existing.nextRunAt > now ? existing.nextRunAt : now
    const nextRunAt = computeNextRunAt(toSchedule(parsed), anchor)

    await prisma.tH_RecurringTicketTemplate.update({
      where: { id: templateId },
      data: { ...parsed, nextRunAt },
    })
    revalidatePath('/recurring-tickets')
    revalidatePath(`/recurring-tickets/${templateId}`)
    return { ok: true, id: templateId }
  } catch (e: unknown) {
    console.error('[recurring-tickets] update failed', e)
    return { ok: false, error: 'Failed to update template' }
  }
}

export async function toggleRecurringTemplate(
  templateId: string,
  active: boolean,
): Promise<RecurringResult> {
  const auth = await requireAdminSession()
  if (!auth.ok) return auth

  try {
    await prisma.tH_RecurringTicketTemplate.update({
      where: { id: templateId },
      data: { active },
    })
    revalidatePath('/recurring-tickets')
    revalidatePath(`/recurring-tickets/${templateId}`)
    return { ok: true, id: templateId }
  } catch (e) {
    console.error('[recurring-tickets] toggle failed', e)
    return { ok: false, error: 'Failed to toggle template' }
  }
}

export async function deleteRecurringTemplate(
  templateId: string,
): Promise<RecurringResult> {
  const auth = await requireAdminSession()
  if (!auth.ok) return auth

  try {
    // Detach spawned tickets first (FK is SET NULL, but keep behavior explicit
    // so the badge clears cleanly on the ticket detail page).
    await prisma.tH_Ticket.updateMany({
      where: { recurringTemplateId: templateId },
      data: { recurringTemplateId: null },
    })
    await prisma.tH_RecurringTicketTemplate.delete({
      where: { id: templateId },
    })
    revalidatePath('/recurring-tickets')
    return { ok: true }
  } catch (e) {
    console.error('[recurring-tickets] delete failed', e)
    return { ok: false, error: 'Failed to delete template' }
  }
}

/**
 * Spawn a single ticket from the template without advancing the schedule.
 * Used by the "Run now" button on the template detail page.
 */
export async function runRecurringTemplateNow(
  templateId: string,
): Promise<RecurringResult> {
  const auth = await requireAdminSession()
  if (!auth.ok) return auth

  try {
    const result = await spawnFromTemplate(templateId, auth.userId)
    if (!result.ok) return result
    revalidatePath(`/recurring-tickets/${templateId}`)
    revalidatePath('/tickets')
    return { ok: true, id: result.ticketId }
  } catch (e) {
    console.error('[recurring-tickets] run-now failed', e)
    return { ok: false, error: 'Failed to spawn ticket' }
  }
}

/**
 * Spawn exactly one ticket from a template. Does NOT advance the schedule —
 * the caller updates lastRunAt/runCount/nextRunAt. Keeps the cron loop and
 * the manual "Run now" button on a shared code path.
 */
export async function spawnFromTemplate(
  templateId: string,
  actorUserId: string,
): Promise<
  | { ok: true; ticketId: string; ticketNumber: number }
  | { ok: false; error: string }
> {
  const t = await prisma.tH_RecurringTicketTemplate.findUnique({
    where: { id: templateId },
  })
  if (!t) return { ok: false, error: 'Template not found' }

  const result = await createTicketCore({
    clientId: t.clientId,
    title: t.title,
    description: t.description,
    priority: t.priority,
    type: t.type,
    assignedToId: t.assignedToId,
    explicitContractId: t.contractId,
    createdById: actorUserId,
    sendClientEmail: false, // recurring tickets are internal ops by default
    recurringTemplateId: t.id,
  })
  if (!result.ok) return result

  // createTicketCore doesn't accept siteId/contactId; attach them now if set.
  if (t.siteId || t.contactId) {
    await prisma.tH_Ticket.update({
      where: { id: result.ticketId },
      data: {
        ...(t.siteId ? { siteId: t.siteId } : {}),
        ...(t.contactId ? { contactId: t.contactId } : {}),
      },
    })
  }
  return result
}
