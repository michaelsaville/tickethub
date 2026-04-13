import { NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

export type DochubAlertCategory = 'ssl' | 'domain' | 'warranty' | 'credential' | 'license' | 'operational'
export type DochubAlertUrgency = 'expired' | 'critical' | 'warning' | 'upcoming'

export interface DochubAlert {
  id: string
  category: DochubAlertCategory
  label: string
  sublabel: string | null
  message: string | null
  urgency: DochubAlertUrgency
  expiresAt: string | null
  clientName: string
  dochubClientId: string
}

/**
 * GET /api/dochub-alerts
 *
 * Cross-schema query: reads DocHub's public schema to find expirations
 * and active operational alarms. Returns normalized alert items that
 * the TicketHub inbox can display alongside emails.
 *
 * Only returns actionable items (expired, critical ≤7d, warning ≤30d).
 */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const now = new Date()
    const thirtyDaysOut = new Date(now.getTime() + 30 * 86_400_000)

    // SSL certs expiring within 30 days
    const sslCerts: { id: string; domain: string; sslExpiresAt: Date; sslIssuer: string | null; clientId: string; clientName: string }[] =
      await prisma.$queryRawUnsafe(`
        SELECT w.id, w.domain, w."sslExpiresAt", w."sslIssuer", c.id AS "clientId", c.name AS "clientName"
        FROM public."Website" w
        JOIN public."Client" c ON c.id = w."clientId"
        WHERE w."sslExpiresAt" IS NOT NULL AND w."sslExpiresAt" <= $1
        ORDER BY w."sslExpiresAt" ASC
      `, thirtyDaysOut)

    // Domains expiring within 30 days
    const domains: { id: string; domain: string; expiresAt: Date; label: string | null; clientId: string; clientName: string }[] =
      await prisma.$queryRawUnsafe(`
        SELECT w.id, w.domain, w."expiresAt", w.label, c.id AS "clientId", c.name AS "clientName"
        FROM public."Website" w
        JOIN public."Client" c ON c.id = w."clientId"
        WHERE w."expiresAt" IS NOT NULL AND w."expiresAt" <= $1
        ORDER BY w."expiresAt" ASC
      `, thirtyDaysOut)

    // Warranties expiring within 30 days
    const warranties: { id: string; name: string; friendlyName: string | null; warrantyExpiry: Date; clientId: string; clientName: string }[] =
      await prisma.$queryRawUnsafe(`
        SELECT a.id, a.name, a."friendlyName", a."warrantyExpiry", c.id AS "clientId", c.name AS "clientName"
        FROM public."Asset" a
        JOIN public."Location" l ON l.id = a."locationId"
        JOIN public."Client" c ON c.id = l."clientId"
        WHERE a."warrantyExpiry" IS NOT NULL AND a."warrantyExpiry" <= $1
          AND a.status NOT IN ('RETIRED', 'DISPOSED')
        ORDER BY a."warrantyExpiry" ASC
      `, thirtyDaysOut)

    // Credentials expiring within 30 days
    const credentials: { id: string; label: string; username: string | null; expiryDate: Date; clientId: string; clientName: string }[] =
      await prisma.$queryRawUnsafe(`
        SELECT cr.id, cr.label, cr.username, cr."expiryDate", c.id AS "clientId", c.name AS "clientName"
        FROM public."Credential" cr
        JOIN public."Client" c ON c.id = cr."clientId"
        WHERE cr."isRetired" = false AND cr."expiryDate" IS NOT NULL AND cr."expiryDate" <= $1
        ORDER BY cr."expiryDate" ASC
      `, thirtyDaysOut)

    // Licenses expiring within 30 days
    const licenses: { id: string; name: string; vendor: string | null; expiryDate: Date; clientId: string; clientName: string }[] =
      await prisma.$queryRawUnsafe(`
        SELECT l.id, l.name, l.vendor, l."expiryDate", c.id AS "clientId", c.name AS "clientName"
        FROM public."License" l
        JOIN public."Client" c ON c.id = l."clientId"
        WHERE l."isActive" = true AND l."expiryDate" IS NOT NULL AND l."expiryDate" <= $1
        ORDER BY l."expiryDate" ASC
      `, thirtyDaysOut)

    // Active operational alarms
    const alarms: { id: string; type: string; message: string; severity: string; details: string | null; clientId: string; clientName: string }[] =
      await prisma.$queryRawUnsafe(`
        SELECT a.id, a.type, a.message, a.severity, a.details, c.id AS "clientId", c.name AS "clientName"
        FROM public."Alarm" a
        JOIN public."Client" c ON c.id = a."clientId"
        WHERE a.status = 'ACTIVE'
        ORDER BY a.severity DESC, a."createdAt" DESC
      `)

    function computeUrgency(expiresAt: Date): DochubAlertUrgency {
      const days = (expiresAt.getTime() - now.getTime()) / 86_400_000
      if (days < 0) return 'expired'
      if (days <= 7) return 'critical'
      return 'warning'
    }

    function alarmUrgency(severity: string): DochubAlertUrgency {
      if (severity === 'CRITICAL') return 'critical'
      if (severity === 'WARNING') return 'warning'
      return 'upcoming'
    }

    const items: DochubAlert[] = [
      ...sslCerts.map(w => ({
        id: `ssl-${w.id}`, category: 'ssl' as const, label: w.domain,
        sublabel: w.sslIssuer, message: null, urgency: computeUrgency(w.sslExpiresAt),
        expiresAt: w.sslExpiresAt.toISOString(), clientName: w.clientName, dochubClientId: w.clientId,
      })),
      ...domains.map(w => ({
        id: `domain-${w.id}`, category: 'domain' as const, label: w.domain,
        sublabel: w.label, message: null, urgency: computeUrgency(w.expiresAt),
        expiresAt: w.expiresAt.toISOString(), clientName: w.clientName, dochubClientId: w.clientId,
      })),
      ...warranties.map(a => ({
        id: `warranty-${a.id}`, category: 'warranty' as const, label: a.friendlyName ?? a.name,
        sublabel: null, message: null, urgency: computeUrgency(a.warrantyExpiry),
        expiresAt: a.warrantyExpiry.toISOString(), clientName: a.clientName, dochubClientId: a.clientId,
      })),
      ...credentials.map(c => ({
        id: `credential-${c.id}`, category: 'credential' as const, label: c.label,
        sublabel: c.username, message: null, urgency: computeUrgency(c.expiryDate),
        expiresAt: c.expiryDate.toISOString(), clientName: c.clientName, dochubClientId: c.clientId,
      })),
      ...licenses.map(l => ({
        id: `license-${l.id}`, category: 'license' as const, label: l.name,
        sublabel: l.vendor, message: null, urgency: computeUrgency(l.expiryDate),
        expiresAt: l.expiryDate.toISOString(), clientName: l.clientName, dochubClientId: l.clientId,
      })),
      ...alarms.map(a => ({
        id: `alarm-${a.id}`, category: 'operational' as const, label: a.type,
        sublabel: a.details, message: a.message, urgency: alarmUrgency(a.severity),
        expiresAt: null, clientName: a.clientName, dochubClientId: a.clientId,
      })),
    ]

    // Sort: expired first, then critical, warning, upcoming
    const order = { expired: 0, critical: 1, warning: 2, upcoming: 3 }
    items.sort((a, b) => order[a.urgency] - order[b.urgency])

    return NextResponse.json({ data: items })
  } catch (e) {
    console.error('[api/dochub-alerts] cross-schema query failed', e)
    return NextResponse.json({ data: [] })
  }
}
