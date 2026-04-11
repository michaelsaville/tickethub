'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createCharge } from '@/app/lib/actions/charges'

export type TimerResult =
  | { ok: true }
  | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export interface TimerSnapshot {
  id: string
  ticketId: string
  ticketNumber: number
  ticketTitle: string
  startedAt: Date
  pausedAt: Date | null
  pausedMs: number
  note: string | null
}

/**
 * Returns the current user's running or paused timer, if any. One timer
 * per user (unique index on userId).
 */
export async function getMyTimer(): Promise<TimerSnapshot | null> {
  const userId = await getUserId()
  if (!userId) return null
  const row = await prisma.tH_TicketTimer.findUnique({
    where: { userId },
  })
  if (!row) return null
  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: row.ticketId },
    select: { ticketNumber: true, title: true },
  })
  if (!ticket) return null
  return {
    id: row.id,
    ticketId: row.ticketId,
    ticketNumber: ticket.ticketNumber,
    ticketTitle: ticket.title,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    pausedMs: row.pausedMs,
    note: row.note,
  }
}

export async function startTimer(
  ticketId: string,
  note?: string,
): Promise<TimerResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const existing = await prisma.tH_TicketTimer.findUnique({
      where: { userId },
    })
    if (existing) {
      return {
        ok: false,
        error:
          existing.ticketId === ticketId
            ? 'Timer already running on this ticket'
            : 'You already have a running timer on another ticket — stop it first',
      }
    }
    const ticket = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    })
    if (!ticket) return { ok: false, error: 'Ticket not found' }

    await prisma.tH_TicketTimer.create({
      data: {
        userId,
        ticketId,
        note: note?.trim() || null,
      },
    })
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    console.error('[actions/timer] start failed', e)
    return { ok: false, error: 'Failed to start timer' }
  }
}

export async function pauseResumeTimer(): Promise<TimerResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const timer = await prisma.tH_TicketTimer.findUnique({
      where: { userId },
    })
    if (!timer) return { ok: false, error: 'No timer running' }
    const now = new Date()
    if (timer.pausedAt) {
      // Resume
      const pauseAddMs = now.getTime() - timer.pausedAt.getTime()
      await prisma.tH_TicketTimer.update({
        where: { userId },
        data: { pausedAt: null, pausedMs: timer.pausedMs + pauseAddMs },
      })
    } else {
      // Pause
      await prisma.tH_TicketTimer.update({
        where: { userId },
        data: { pausedAt: now },
      })
    }
    revalidatePath(`/tickets/${timer.ticketId}`)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    console.error('[actions/timer] pauseResume failed', e)
    return { ok: false, error: 'Failed to toggle timer' }
  }
}

export async function cancelTimer(): Promise<TimerResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const existing = await prisma.tH_TicketTimer.findUnique({
      where: { userId },
    })
    if (!existing) return { ok: true }
    await prisma.tH_TicketTimer.delete({ where: { userId } })
    revalidatePath(`/tickets/${existing.ticketId}`)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    console.error('[actions/timer] cancel failed', e)
    return { ok: false, error: 'Failed to cancel timer' }
  }
}

/**
 * Stop the timer and convert elapsed (running minus paused) into a LABOR
 * charge against the specified item. Rounded to the nearest minute.
 */
export async function stopTimerAndCharge(
  itemId: string,
  description?: string,
): Promise<TimerResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const timer = await prisma.tH_TicketTimer.findUnique({
      where: { userId },
    })
    if (!timer) return { ok: false, error: 'No timer running' }

    const now = new Date()
    let totalMs = now.getTime() - timer.startedAt.getTime() - timer.pausedMs
    if (timer.pausedAt) {
      // If currently paused, don't count the in-progress pause in total
      totalMs -= now.getTime() - timer.pausedAt.getTime()
    }
    const durationMinutes = Math.max(1, Math.round(totalMs / 60_000))

    const chargeRes = await createCharge(timer.ticketId, {
      itemId,
      durationMinutes,
      description: description?.trim() || timer.note || null,
    })
    if (!chargeRes.ok) return chargeRes

    await prisma.tH_TicketTimer.delete({ where: { userId } })
    revalidatePath(`/tickets/${timer.ticketId}`)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    console.error('[actions/timer] stopAndCharge failed', e)
    return { ok: false, error: 'Failed to stop timer' }
  }
}
