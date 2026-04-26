'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createTicketCore } from '@/app/lib/tickets-core'

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export interface CreateTicketFromPendingInput {
  pendingId: string
  clientId: string
  title: string
  description?: string
  assignedToId?: string | null
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  /** If true, also create a TH_Contact on the chosen client for the
   *  sender (so future emails from them auto-create). */
  addContact?: boolean
  contactFirstName?: string
  contactLastName?: string
}

export async function createTicketFromPending(
  input: CreateTicketFromPendingInput,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  try {
    const pending = await prisma.tH_PendingInboundEmail.findUnique({
      where: { id: input.pendingId },
    })
    if (!pending) return { ok: false, error: 'Pending email not found' }
    if (pending.status !== 'PENDING') {
      return { ok: false, error: 'This email has already been handled' }
    }

    const ticketRes = await createTicketCore({
      clientId: input.clientId,
      title: input.title.trim() || pending.subject || '(no subject)',
      description:
        input.description?.trim() ||
        `From: ${pending.fromName ?? pending.fromEmail} <${pending.fromEmail}>\n\n` +
          pending.bodyText,
      priority: input.priority ?? 'MEDIUM',
      assignedToId: input.assignedToId ?? null,
      createdById: userId,
    })
    if (!ticketRes.ok) {
      return { ok: false, error: ticketRes.error }
    }

    if (input.addContact && input.contactFirstName) {
      // Defensive — don't duplicate an existing contact on this client.
      const existing = await prisma.tH_Contact.findFirst({
        where: {
          clientId: input.clientId,
          email: { equals: pending.fromEmail, mode: 'insensitive' },
        },
        select: { id: true },
      })
      if (!existing) {
        await prisma.tH_Contact.create({
          data: {
            clientId: input.clientId,
            firstName: input.contactFirstName.trim(),
            lastName: (input.contactLastName ?? '').trim(),
            email: pending.fromEmail,
            isPrimary: false,
            isActive: true,
          },
        })
      }
    }

    await prisma.tH_PendingInboundEmail.update({
      where: { id: input.pendingId },
      data: {
        status: 'APPROVED',
        matchedTicketId: ticketRes.ticketId,
        handledById: userId,
        handledAt: new Date(),
      },
    })

    revalidatePath('/inbox')
    revalidatePath('/tickets')
    return { ok: true, ticketId: ticketRes.ticketId }
  } catch (e) {
    console.error('[actions/inbox] createTicketFromPending failed', e)
    return { ok: false, error: 'Failed to create ticket' }
  }
}

export async function dismissPending(
  pendingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    await prisma.tH_PendingInboundEmail.update({
      where: { id: pendingId },
      data: {
        status: 'DISMISSED',
        handledById: userId,
        handledAt: new Date(),
      },
    })
    revalidatePath('/inbox')
    return { ok: true }
  } catch (e) {
    console.error('[actions/inbox] dismissPending failed', e)
    return { ok: false, error: 'Failed to dismiss' }
  }
}

/**
 * Dismiss many pending emails in one transaction. Caller should already
 * have filtered to PENDING-status rows; we re-filter on `status: PENDING`
 * defensively so we don't trample APPROVED rows that raced into being.
 */
export async function bulkDismissPending(
  ids: string[],
): Promise<{ ok: boolean; dismissed?: number; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'No emails selected' }
  }
  if (ids.length > 500) {
    return { ok: false, error: 'Too many selected (max 500 per batch)' }
  }
  try {
    const res = await prisma.tH_PendingInboundEmail.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: {
        status: 'DISMISSED',
        handledById: userId,
        handledAt: new Date(),
      },
    })
    revalidatePath('/inbox')
    return { ok: true, dismissed: res.count }
  } catch (e) {
    console.error('[actions/inbox] bulkDismissPending failed', e)
    return { ok: false, error: 'Failed to bulk dismiss' }
  }
}

export async function blockSender(
  pendingId: string,
  scope: 'EMAIL' | 'DOMAIN',
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const pending = await prisma.tH_PendingInboundEmail.findUnique({
      where: { id: pendingId },
      select: { fromEmail: true },
    })
    if (!pending) return { ok: false, error: 'Not found' }

    const value =
      scope === 'DOMAIN'
        ? pending.fromEmail.split('@')[1]?.toLowerCase() ?? ''
        : pending.fromEmail.toLowerCase()
    if (!value) return { ok: false, error: 'Invalid sender' }

    await prisma.tH_BlockedSender.upsert({
      where: { value },
      create: {
        value,
        kind: scope,
        reason: 'Blocked from inbox UI',
        createdById: userId,
      },
      update: {},
    })

    // Dismiss the current row, AND auto-dismiss any other PENDING rows
    // from the same sender/domain so the dashboard stays clean.
    const pattern =
      scope === 'DOMAIN'
        ? { endsWith: `@${value}`, mode: 'insensitive' as const }
        : { equals: value, mode: 'insensitive' as const }
    await prisma.tH_PendingInboundEmail.updateMany({
      where: {
        status: 'PENDING',
        fromEmail: pattern,
      },
      data: {
        status: 'DISMISSED',
        handledById: userId,
        handledAt: new Date(),
      },
    })
    revalidatePath('/inbox')
    return { ok: true }
  } catch (e) {
    console.error('[actions/inbox] blockSender failed', e)
    return { ok: false, error: 'Failed to block sender' }
  }
}

export async function updateInboundForwardEmails(
  emails: string[],
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const normalized = Array.from(
      new Set(
        emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^\S+@\S+\.\S+$/.test(e)),
      ),
    )
    await prisma.tH_User.update({
      where: { id: userId },
      data: { inboundForwardEmails: normalized },
    })
    revalidatePath('/settings/notifications')
    return { ok: true }
  } catch (e) {
    console.error('[actions/inbox] updateInboundForwardEmails failed', e)
    return { ok: false, error: 'Failed to save' }
  }
}
