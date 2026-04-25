'use server'

import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { notifyOnCall, ticketUrl } from '@/app/lib/notify-server'

export async function pageOnCall(input: {
  ticketId: string
  ticketNumber: number
  ticketTitle: string
}): Promise<
  | { ok: true; deliveredTo: 'on_call' | 'team'; userName?: string }
  | { ok: false; error: string }
> {
  const { session, error } = await requireAuth()
  if (error || !session) return { ok: false, error: 'Not authenticated' }

  const result = await notifyOnCall({
    title: `TH-${input.ticketNumber}: ${input.ticketTitle}`,
    body: `${session.user.name ?? session.user.email} paged you about this ticket.`,
    url: ticketUrl(input.ticketId),
    priority: 'high',
  })

  let userName: string | undefined
  if (result.deliveredTo === 'on_call' && result.userId) {
    const u = await prisma.tH_User.findUnique({
      where: { id: result.userId },
      select: { name: true },
    })
    userName = u?.name ?? undefined
  }

  return { ok: true, deliveredTo: result.deliveredTo, userName }
}
