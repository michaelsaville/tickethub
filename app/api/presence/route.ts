import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'
import { statusFromHeartbeat } from '@/app/lib/presence'

/**
 * GET /api/presence
 *
 * Returns presence status for every active TH_User. Polled by client
 * surfaces (dispatch board, on-call panel) on a 60s cadence to refresh
 * the green/yellow/away dot. Auth-only — no body.
 *
 * Response: { [userId]: { status, lastHeartbeatAt } }
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const users = await prisma.tH_User.findMany({
    where: { isActive: true },
    select: { id: true, lastHeartbeatAt: true },
  })
  const now = new Date()
  const map: Record<
    string,
    { status: 'active' | 'idle' | 'away'; lastHeartbeatAt: string | null }
  > = {}
  for (const u of users) {
    map[u.id] = {
      status: statusFromHeartbeat(u.lastHeartbeatAt, now),
      lastHeartbeatAt: u.lastHeartbeatAt
        ? u.lastHeartbeatAt.toISOString()
        : null,
    }
  }
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
