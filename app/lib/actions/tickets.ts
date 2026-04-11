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
import { isPausingStatus } from '@/app/lib/sla'
import { computeSlaDates } from '@/app/lib/sla-server'
import { notifyAdmins, notifyUser, ticketUrl } from '@/app/lib/notify-server'

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
    if (priority === 'URGENT' || priority === 'HIGH') {
      notifyAdmins({
        title: `${priority} ticket: #${ticket.ticketNumber}`,
        body: `${clientLabel} — ${ticket.title}`,
        url: ticketUrl(ticket.id),
        priority: priority === 'URGENT' ? 'critical' : 'high',
        category: 'NEW_HIGH',
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
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Comment is empty' }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tH_TicketComment.create({
        data: { ticketId, authorId: userId, body: trimmed, isInternal },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: isInternal ? 'INTERNAL_NOTE' : 'COMMENT',
        },
      })
      // A staff comment clears the unread flag
      await tx.tH_Ticket.update({
        where: { id: ticketId },
        data: { isUnread: false },
      })
    })

    // Notify the assignee (if it's not the author) that the ticket has
    // new activity. Internal notes also notify — they're staff-only and
    // the assignee may want the context.
    const ticketInfo = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticketNumber: true,
        title: true,
        assignedToId: true,
        client: { select: { name: true, shortCode: true } },
      },
    })
    if (
      ticketInfo?.assignedToId &&
      ticketInfo.assignedToId !== userId
    ) {
      const clientLabel =
        ticketInfo.client.shortCode ?? ticketInfo.client.name
      notifyUser(ticketInfo.assignedToId, {
        title: `${isInternal ? 'Internal note' : 'Comment'}: #${ticketInfo.ticketNumber}`,
        body: `${clientLabel} — ${trimmed.slice(0, 120)}`,
        url: ticketUrl(ticketId),
        priority: 'normal',
        category: 'COMMENT',
      })
    }

    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] addComment failed', e)
    return { ok: false, error: 'Failed to add comment' }
  }
}

export async function updateTicketStatus(
  ticketId: string,
  status: TH_TicketStatus,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
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

      // Pause transition: entering a WAITING_* status
      let slaPausedAt: Date | null | undefined = undefined
      let slaResolveDue: Date | null | undefined = undefined
      let slaResponseDue: Date | null | undefined = undefined

      if (!wasPaused && shouldBePaused) {
        slaPausedAt = now
      } else if (wasPaused && !shouldBePaused) {
        // Resume: shift the deadlines forward by the pause duration
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
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/tickets')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] updateStatus failed', e)
    return { ok: false, error: 'Failed to update status' }
  }
}

export async function assignTicket(
  ticketId: string,
  assignedToId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.tH_Ticket.findUnique({
        where: { id: ticketId },
        select: { assignedToId: true, status: true },
      })
      if (!current) throw new Error('Not found')
      if (current.assignedToId === assignedToId) return
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
    })

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
    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] updateContract failed', e)
    return { ok: false, error: 'Failed to update contract' }
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
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/tickets')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tickets] updatePriority failed', e)
    return { ok: false, error: 'Failed to update priority' }
  }
}
