import type {
  TH_TicketPriority,
  TH_TicketStatus,
  TH_TicketType,
} from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { isPausingStatus } from '@/app/lib/sla'
import { computeSlaDates } from '@/app/lib/sla-server'
import { notifyAdmins, notifyUser, ticketUrl } from '@/app/lib/notify-server'
import { sendTicketClientEmail } from '@/app/lib/ticket-email'

/**
 * Core ticket mutations shared between server actions and REST routes.
 * Routes exist so the offline sync queue can replay mutating ops via
 * plain fetch (server actions don't replay cleanly from a queue).
 */

export interface CreateTicketCoreInput {
  clientId: string
  title: string
  description?: string | null
  priority?: TH_TicketPriority
  type?: TH_TicketType
  assignedToId?: string | null
  explicitContractId?: string | null
  /** User who is creating the ticket — for auditing and CREATED event. */
  createdById: string
  /** Whether to fire the outbound "ticket opened" email to the client.
   *  Default true. The inbound pipeline's auto-create path passes true
   *  too (the client JUST emailed us — they expect a confirmation) but
   *  the loop-guard prevents their autoresponder from bouncing back. */
  sendClientEmail?: boolean
  /** Tag ticket as spawned from a recurring template (for badge + audit). */
  recurringTemplateId?: string | null
}

/**
 * Programmatic ticket creation. Mirrors the formdata `createTicket` action
 * but returns the created ticket (id + number) instead of redirecting.
 * Used by the inbound-email pipeline and the /inbox "create ticket from
 * pending" flow. No revalidatePath — the caller decides.
 */
export async function createTicketCore(
  input: CreateTicketCoreInput,
): Promise<
  | { ok: true; ticketId: string; ticketNumber: number }
  | { ok: false; error: string }
> {
  const {
    clientId,
    title,
    description = null,
    priority = 'MEDIUM',
    type = 'INCIDENT',
    assignedToId = null,
    explicitContractId = null,
    createdById,
    sendClientEmail = true,
    recurringTemplateId = null,
  } = input

  if (!clientId) return { ok: false, error: 'Client is required' }
  if (!title.trim()) return { ok: false, error: 'Title is required' }

  try {
    let contractId: string | null = null
    if (explicitContractId) {
      const chosen = await prisma.tH_Contract.findUnique({
        where: { id: explicitContractId },
        select: { id: true, clientId: true },
      })
      if (chosen && chosen.clientId === clientId) contractId = chosen.id
    }
    if (!contractId) {
      const globalContract = await prisma.tH_Contract.findFirst({
        where: { clientId, isGlobal: true },
        select: { id: true },
      })
      contractId = globalContract?.id ?? null
    }

    const { slaResponseDue, slaResolveDue } = await computeSlaDates(priority)

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.tH_Ticket.create({
        data: {
          clientId,
          contractId,
          title: title.trim(),
          description,
          priority,
          type,
          assignedToId,
          createdById,
          status: assignedToId ? 'OPEN' : 'NEW',
          slaResponseDue,
          slaResolveDue,
          recurringTemplateId,
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId: t.id,
          userId: createdById,
          type: recurringTemplateId ? 'CREATED_BY_RECURRING' : 'CREATED',
          data: { priority, type, ...(recurringTemplateId ? { recurringTemplateId } : {}) },
        },
      })
      if (assignedToId) {
        await tx.tH_TicketEvent.create({
          data: {
            ticketId: t.id,
            userId: createdById,
            type: 'ASSIGNED',
            data: { assignedToId },
          },
        })
      }
      return t
    })

    const client = await prisma.tH_Client.findUnique({
      where: { id: clientId },
      select: { name: true, shortCode: true },
    })
    const clientLabel = client?.shortCode ?? client?.name ?? 'a client'
    if (assignedToId && assignedToId !== createdById) {
      notifyUser(assignedToId, {
        title: `Assigned: #${ticket.ticketNumber}`,
        body: `${clientLabel} — ${ticket.title}`,
        url: ticketUrl(ticket.id),
        priority: priority === 'URGENT' ? 'high' : 'normal',
        category: 'ASSIGNED',
      })
    }
    const isHot = priority === 'URGENT' || priority === 'HIGH'
    notifyAdmins({
      title: isHot
        ? `${priority} ticket: #${ticket.ticketNumber}`
        : `New ticket: #${ticket.ticketNumber}`,
      body: `${clientLabel} — ${ticket.title}`,
      url: ticketUrl(ticket.id),
      priority:
        priority === 'URGENT' ? 'critical' : priority === 'HIGH' ? 'high' : 'normal',
      category: isHot ? 'NEW_HIGH' : 'INFO',
    })

    if (sendClientEmail) {
      void sendTicketClientEmail({
        ticketId: ticket.id,
        mode: 'NEW_TICKET',
        messageText: description ?? ticket.title,
      })
    }

    return { ok: true, ticketId: ticket.id, ticketNumber: ticket.ticketNumber }
  } catch (e) {
    console.error('[tickets-core] createTicketCore failed', e)
    return { ok: false, error: 'Failed to create ticket' }
  }
}

export async function updateTicketStatusCore(
  userId: string,
  ticketId: string,
  status: TH_TicketStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.tH_Ticket.findUnique({
        where: { id: ticketId },
        select: {
          status: true,
          slaPausedAt: true,
          slaResolveDue: true,
          slaResponseDue: true,
        },
      })
      if (!current) throw new Error('Not found')
      if (current.status === status) return

      const now = new Date()
      const wasPaused = current.slaPausedAt !== null
      const shouldBePaused = isPausingStatus(status)

      let slaPausedAt: Date | null | undefined = undefined
      let slaResolveDue: Date | null | undefined = undefined
      let slaResponseDue: Date | null | undefined = undefined

      if (!wasPaused && shouldBePaused) {
        slaPausedAt = now
      } else if (wasPaused && !shouldBePaused) {
        const pausedMs = now.getTime() - current.slaPausedAt!.getTime()
        if (current.slaResolveDue) {
          slaResolveDue = new Date(current.slaResolveDue.getTime() + pausedMs)
        }
        if (current.slaResponseDue) {
          slaResponseDue = new Date(
            current.slaResponseDue.getTime() + pausedMs,
          )
        }
        slaPausedAt = null
      }

      await tx.tH_Ticket.update({
        where: { id: ticketId },
        data: {
          status,
          closedAt:
            status === 'CLOSED' || status === 'CANCELLED' ? now : null,
          ...(slaPausedAt !== undefined ? { slaPausedAt } : {}),
          ...(slaResolveDue !== undefined ? { slaResolveDue } : {}),
          ...(slaResponseDue !== undefined ? { slaResponseDue } : {}),
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'STATUS_CHANGE',
          data: {
            from: current.status,
            to: status,
            ...(slaPausedAt === now ? { slaPaused: true } : {}),
            ...(slaPausedAt === null && wasPaused ? { slaResumed: true } : {}),
          },
        },
      })
    })
    return { ok: true }
  } catch (e) {
    console.error('[tickets-core] updateStatus failed', e)
    return { ok: false, error: 'Failed to update status' }
  }
}
