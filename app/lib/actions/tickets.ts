'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import type {
  TH_TicketPriority,
  TH_TicketStatus,
  TH_TicketType,
} from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { computeSlaDates } from '@/app/lib/sla-server'
import { notifyAdmins, notifyUser, ticketUrl } from '@/app/lib/notify-server'
import { createComment } from '@/app/lib/comments-core'
import { updateTicketStatusCore } from '@/app/lib/tickets-core'
import { sendTicketClientEmail } from '@/app/lib/ticket-email'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export type CreateTicketResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string }

export async function createTicket(
  _prev: CreateTicketResult | null,
  formData: FormData,
): Promise<CreateTicketResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const clientId = formData.get('clientId') as string | null
  const title = (formData.get('title') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const priority = (formData.get('priority') as TH_TicketPriority | null) ?? 'MEDIUM'
  const type = (formData.get('type') as TH_TicketType | null) ?? 'INCIDENT'
  const assignedToId = (formData.get('assignedToId') as string | null) || null
  const explicitContractId = (formData.get('contractId') as string | null) || null

  if (!clientId) return { ok: false, error: 'Client is required' }
  if (!title) return { ok: false, error: 'Title is required' }

  try {
    // Contract resolution: honor explicit pick if it belongs to the same
    // client, otherwise fall back to the client's Global Contract.
    let contractId: string | null = null
    if (explicitContractId) {
      const chosen = await prisma.tH_Contract.findUnique({
        where: { id: explicitContractId },
        select: { id: true, clientId: true, status: true },
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
    const globalContract = contractId ? { id: contractId } : null

    const { slaResponseDue, slaResolveDue } = await computeSlaDates(priority)

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.tH_Ticket.create({
        data: {
          clientId,
          contractId: globalContract?.id ?? null,
          title,
          description,
          priority,
          type,
          assignedToId,
          createdById: userId,
          status: assignedToId ? 'OPEN' : 'NEW',
          slaResponseDue,
          slaResolveDue,
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId: t.id,
          userId,
          type: 'CREATED',
          data: { priority, type },
        },
      })
      if (assignedToId) {
        await tx.tH_TicketEvent.create({
          data: {
            ticketId: t.id,
            userId,
            type: 'ASSIGNED',
            data: { assignedToId },
          },
        })
      }
      return t
    })

    // Notification fan-out — runs after the tx commits, fire-and-forget
    const client = await prisma.tH_Client.findUnique({
      where: { id: clientId },
      select: { name: true, shortCode: true },
    })
    const clientLabel = client?.shortCode ?? client?.name ?? 'a client'
    if (assignedToId && assignedToId !== userId) {
      notifyUser(assignedToId, {
        title: `Assigned: #${ticket.ticketNumber}`,
        body: `${clientLabel} — ${ticket.title}`,
        url: ticketUrl(ticket.id),
        priority: priority === 'URGENT' ? 'high' : 'normal',
        category: 'ASSIGNED',
      })
    }
    const isHot = priority === 'URGENT' || priority === 'HIGH'
    await notifyAdmins({
      title: isHot
        ? `${priority} ticket: #${ticket.ticketNumber}`
        : `New ticket: #${ticket.ticketNumber}`,
      body: `${clientLabel} — ${ticket.title}`,
      url: ticketUrl(ticket.id),
      priority:
        priority === 'URGENT' ? 'critical' : priority === 'HIGH' ? 'high' : 'normal',
      category: isHot ? 'NEW_HIGH' : 'INFO',
    })

    void sendTicketClientEmail({
      ticketId: ticket.id,
      mode: 'NEW_TICKET',
      messageText: description ?? ticket.title,
    })

    await emit({
      type: EVENT_TYPES.TICKET_CREATED,
      entityType: 'ticket',
      entityId: ticket.id,
      actorId: userId,
      payload: {
        clientId,
        contractId: globalContract?.id ?? null,
        priority,
        ticketType: type,
        status: assignedToId ? 'OPEN' : 'NEW',
        assigneeId: assignedToId,
      },
    })
    if (assignedToId) {
      await emit({
        type: EVENT_TYPES.TICKET_ASSIGNED,
        entityType: 'ticket',
        entityId: ticket.id,
        actorId: userId,
        payload: { assigneeId: assignedToId, previousAssigneeId: null },
      })
    }

    revalidatePath('/tickets')
    revalidatePath(`/clients/${clientId}`)
    redirect(`/tickets/${ticket.id}`)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('[actions/tickets] create failed', e)
    return { ok: false, error: 'Failed to create ticket' }
  }
}

export async function addComment(
  ticketId: string,
  body: string,
  isInternal: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  const res = await createComment(userId, ticketId, body, isInternal)
  if (res.ok) {
    revalidatePath(`/tickets/${ticketId}`)
    if (!isInternal) {
      void sendTicketClientEmail({
        ticketId,
        mode: 'STAFF_REPLY',
        messageText: body,
      })
    }
  }
  return res
}

export async function updateTicketStatus(
  ticketId: string,
  status: TH_TicketStatus,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  const res = await updateTicketStatusCore(userId, ticketId, status)
  if (res.ok) {
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/tickets')
  }
  return res
}

export async function assignTicket(
  ticketId: string,
  assignedToId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.tH_Ticket.findUnique({
        where: { id: ticketId },
        select: { assignedToId: true, status: true },
      })
      if (!current) throw new Error('Not found')
      if (current.assignedToId === assignedToId) {
        return { changed: false as const }
      }
      await tx.tH_Ticket.update({
        where: { id: ticketId },
        data: {
          assignedToId,
          // First assignment moves NEW → OPEN
          status:
            current.status === 'NEW' && assignedToId ? 'OPEN' : current.status,
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'ASSIGNED',
          data: { from: current.assignedToId, to: assignedToId },
        },
      })
      return { changed: true as const, from: current.assignedToId }
    })

    if (result.changed) {
      await emit({
        type: assignedToId
          ? EVENT_TYPES.TICKET_ASSIGNED
          : EVENT_TYPES.TICKET_UNASSIGNED,
        entityType: 'ticket',
        entityId: ticketId,
        actorId: userId,
        payload: {
          assigneeId: assignedToId,
          previousAssigneeId: result.from,
        },
      })
    }

    // Notify the newly-assigned tech (if it's not the person making the
    // assignment). Fetch ticket metadata after the tx commits.
    if (assignedToId && assignedToId !== userId) {
      const info = await prisma.tH_Ticket.findUnique({
        where: { id: ticketId },
        select: {
          ticketNumber: true,
          title: true,
          priority: true,
          client: { select: { name: true, shortCode: true } },
        },
      })
      if (info) {
        const clientLabel = info.client.shortCode ?? info.client.name
        notifyUser(assignedToId, {
          title: `Assigned: #${info.ticketNumber}`,
          body: `${clientLabel} — ${info.title}`,
          url: ticketUrl(ticketId),
          priority: info.priority === 'URGENT' ? 'high' : 'normal',
          category: 'ASSIGNED',
        })
      }
    }

    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/tickets')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] assign failed', e)
    return { ok: false, error: 'Failed to assign' }
  }
}

export async function updateTicketContract(
  ticketId: string,
  contractId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const ticket = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, clientId: true, contractId: true },
    })
    if (!ticket) return { ok: false, error: 'Not found' }
    if (contractId) {
      const contract = await prisma.tH_Contract.findUnique({
        where: { id: contractId },
        select: { clientId: true },
      })
      if (!contract || contract.clientId !== ticket.clientId) {
        return { ok: false, error: 'Contract does not belong to this client' }
      }
    }
    if (ticket.contractId === contractId) return { ok: true }
    await prisma.$transaction([
      prisma.tH_Ticket.update({
        where: { id: ticketId },
        data: { contractId },
      }),
      prisma.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'CONTRACT_CHANGE',
          data: { from: ticket.contractId, to: contractId },
        },
      }),
    ])
    await emit({
      type: EVENT_TYPES.TICKET_CONTRACT_CHANGED,
      entityType: 'ticket',
      entityId: ticketId,
      actorId: userId,
      payload: { from: ticket.contractId, to: contractId },
    })
    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] updateContract failed', e)
    return { ok: false, error: 'Failed to update contract' }
  }
}

export async function updateTicketBoard(
  ticketId: string,
  board: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const current = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: { board: true },
    })
    if (!current) return { ok: false, error: 'Not found' }
    const next = board && board.trim() ? board.trim() : null
    if (current.board === next) return { ok: true }
    await prisma.$transaction([
      prisma.tH_Ticket.update({
        where: { id: ticketId },
        data: { board: next },
      }),
      prisma.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'BOARD_CHANGE',
          data: { from: current.board, to: next },
        },
      }),
    ])
    await emit({
      type: EVENT_TYPES.TICKET_BOARD_CHANGED,
      entityType: 'ticket',
      entityId: ticketId,
      actorId: userId,
      payload: { from: current.board, to: next },
    })
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/tickets')
    revalidatePath('/schedule')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] updateBoard failed', e)
    return { ok: false, error: 'Failed to update board' }
  }
}

export async function updateTicketPriority(
  ticketId: string,
  priority: TH_TicketPriority,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const current = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: { priority: true },
    })
    if (!current) return { ok: false, error: 'Not found' }
    if (current.priority === priority) return { ok: true }
    await prisma.$transaction([
      prisma.tH_Ticket.update({
        where: { id: ticketId },
        data: { priority },
      }),
      prisma.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'PRIORITY_CHANGE',
          data: { from: current.priority, to: priority },
        },
      }),
    ])
    await emit({
      type: EVENT_TYPES.TICKET_PRIORITY_CHANGED,
      entityType: 'ticket',
      entityId: ticketId,
      actorId: userId,
      payload: { from: current.priority, to: priority },
    })
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/tickets')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] updatePriority failed', e)
    return { ok: false, error: 'Failed to update priority' }
  }
}
