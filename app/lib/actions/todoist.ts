'use server'

import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createTodoistTask } from '@/app/lib/todoist'

type Result = { ok: true; taskId?: string } | { ok: false; error: string }

const PRIORITY_MAP: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

const BASE_URL = process.env.NEXTAUTH_URL || 'https://tickethub.pcc2k.com'

export async function createTodoistTaskFromTicket(ticketId: string): Promise<Result> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: {
      ticketNumber: true,
      title: true,
      description: true,
      priority: true,
      client: { select: { name: true } },
    },
  })
  if (!ticket) return { ok: false, error: 'Ticket not found' }

  const taskId = await createTodoistTask(userId, {
    title: `#${ticket.ticketNumber} ${ticket.title}`,
    description: `Client: ${ticket.client.name}${ticket.description ? `\n${ticket.description.slice(0, 200)}` : ''}`,
    ticketUrl: `${BASE_URL}/tickets/${ticketId}`,
    priority: PRIORITY_MAP[ticket.priority] ?? 1,
  })

  if (!taskId) {
    return { ok: false, error: 'Failed to create Todoist task. Check your API token in Settings → Integrations.' }
  }

  return { ok: true, taskId }
}
