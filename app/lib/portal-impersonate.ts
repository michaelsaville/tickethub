import 'server-only'
import { createHmac } from 'node:crypto'

/**
 * Mirror of portal/app/lib/portal-impersonate.ts — keep the two in
 * sync. Uses PORTAL_BFF_SECRET (already shared with the portal for
 * BFF calls) as the signing secret since TH ↔ portal trust boundary
 * is the same. 2-minute TTL is plenty for a click-through.
 */

export interface ImpersonationClaims {
  dochubClientId: string
  clientName: string
  staffEmail: string
  staffName: string
  iat: number
  exp: number
}

const TTL_SECONDS = 120

export function signImpersonationToken(
  claims: Omit<ImpersonationClaims, 'iat' | 'exp'>,
  secret: string,
): string {
  if (!secret) throw new Error('PORTAL_BFF_SECRET missing')
  const now = Math.floor(Date.now() / 1000)
  const full: ImpersonationClaims = { ...claims, iat: now, exp: now + TTL_SECONDS }
  const payload = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}
