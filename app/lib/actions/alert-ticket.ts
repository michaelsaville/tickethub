'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createTicketCore } from '@/app/lib/tickets-core'

export interface CreateTicketFromAlertInput {
  clientName: string
  title: string
  description: string
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  assignedToId?: string | null
  alertId: string // for tracking which alert created which ticket
}

export async function createTicketFromAlert(
  input: CreateTicketFromAlertInput,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: 'Unauthorized' }

  try {
    // Match DocHub client name to TicketHub client
    const client = await prisma.tH_Client.findFirst({
      where: { name: { equals: input.clientName, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!client) {
      return {
        ok: false,
        error: `No TicketHub client matching "${input.clientName}". Create the client in TicketHub first.`,
      }
    }

    const ticketRes = await createTicketCore({
      clientId: client.id,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'MEDIUM',
      type: 'INCIDENT',
      assignedToId: input.assignedToId ?? null,
      createdById: userId,
      sendClientEmail: false, // internal alert, not client-facing
    })

    if (!ticketRes.ok) {
      return { ok: false, error: ticketRes.error }
    }

    revalidatePath('/inbox')
    return { ok: true, ticketId: ticketRes.ticketId }
  } catch (e: any) {
    console.error('[actions/alert-ticket] failed', e)
    return { ok: false, error: 'Failed to create ticket' }
  }
}
