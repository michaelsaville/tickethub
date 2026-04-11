import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/app/lib/auth'

/**
 * Enforce authentication (and optional minimum role) for API routes
 * and server components that need a role gate.
 *
 *   const { session, error } = await requireAuth()
 *   if (error) return error
 *
 *   const { session, error } = await requireAuth('TICKETHUB_ADMIN')
 *   if (error) return error
 */
const ROLE_LEVEL: Record<string, number> = {
  DEACTIVATED: 0,
  VIEWER: 1,
  TECH: 2,
  DISPATCHER: 3,
  TICKETHUB_ADMIN: 4,
  GLOBAL_ADMIN: 5,
}

export function hasMinRole(role: string, minRole: string): boolean {
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0)
}

export async function requireAuth(minRole?: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (minRole) {
    const userLevel = ROLE_LEVEL[session.user.role] ?? 0
    if (userLevel < (ROLE_LEVEL[minRole] ?? 0)) {
      return {
        session: null,
        error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      }
    }
  }
  return { session, error: null as null }
}
