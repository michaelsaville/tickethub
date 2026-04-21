'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { signImpersonationToken } from '@/app/lib/portal-impersonate'

/**
 * Staff "view as client" tunnel. Resolves the TH_Client's name, looks
 * up the matching DocHub Client.id (same Postgres DB, different
 * schema), signs a short-lived token, and 302s the staff member to
 * the portal's /impersonate endpoint which finishes the hand-off.
 *
 * Gated on a real TH staff session; any role is allowed (ADMIN / TECH
 * both need to reproduce client views for support). If the client
 * doesn't exist in DocHub, staff gets a redirect back to the client
 * page with an error query param the UI can pick up.
 */
export async function startPortalImpersonationAction(formData: FormData) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const tickethubClientId = String(formData.get('tickethubClientId') ?? '')
  if (!tickethubClientId) redirect('/clients?impersonate=missing-id')

  const thClient = await prisma.tH_Client.findUnique({
    where: { id: tickethubClientId },
    select: { name: true },
  })
  if (!thClient) redirect('/clients?impersonate=client-not-found')

  // Cross-schema lookup for the DocHub Client row that matches by name.
  // Same DB, same connection — no BFF round-trip needed.
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM public."Client" WHERE name = $1 LIMIT 1`,
    thClient.name,
  )
  const dochubClientId = rows[0]?.id
  if (!dochubClientId) {
    redirect(`/clients/${tickethubClientId}?impersonate=no-dochub-client`)
  }

  const secret = process.env.PORTAL_BFF_SECRET ?? ''
  const token = signImpersonationToken(
    {
      dochubClientId,
      clientName: thClient.name,
      staffEmail: session!.user.email ?? 'unknown@pcc2k.com',
      staffName: session!.user.name ?? 'Unknown',
    },
    secret,
  )

  const base = process.env.PORTAL_BASE_URL ?? 'https://portal.pcc2k.com'
  redirect(`${base.replace(/\/+$/, '')}/impersonate?token=${encodeURIComponent(token)}`)
}
