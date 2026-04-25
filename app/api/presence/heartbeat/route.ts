import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'

/**
 * POST /api/presence/heartbeat
 *
 * Updates the calling user's lastHeartbeatAt to now. Called by every
 * open TicketHub tab on a 60s cadence (paused when the tab is hidden).
 * Drives the green/yellow/away dot on the dispatch board + on-call panel.
 *
 * Returns 204 — no body needed.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 })
  }
  await prisma.tH_User.update({
    where: { id: session.user.id },
    data: { lastHeartbeatAt: new Date() },
  })
  return new NextResponse(null, { status: 204 })
}
