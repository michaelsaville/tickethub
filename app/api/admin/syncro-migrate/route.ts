import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { syncroConfigured } from '@/app/lib/syncro'
import {
  migrateCustomers,
  migrateContacts,
  migrateSites,
  migrateTickets,
  runFullMigration,
} from '@/app/lib/syncro-migrate'

/**
 * GET /api/admin/syncro-migrate
 *
 * Returns current migration stats — how many records have a Syncro source ID.
 */
export async function GET() {
  const { error } = await requireAuth('GLOBAL_ADMIN')
  if (error) return error

  const [clients, contacts, sites, tickets] = await Promise.all([
    prisma.tH_Client.count({ where: { syncroId: { not: null } } }),
    prisma.tH_Contact.count({ where: { syncroContactId: { not: null } } }),
    prisma.tH_Site.count({ where: { syncroSiteId: { not: null } } }),
    prisma.tH_Ticket.count({ where: { syncroId: { not: null } } }),
  ])

  return NextResponse.json({
    configured: syncroConfigured(),
    stats: { clients, contacts, sites, tickets },
  })
}

/**
 * POST /api/admin/syncro-migrate
 *
 * Run a migration scope: customers, contacts, sites, tickets, or all.
 */
export async function POST(req: Request) {
  const { error } = await requireAuth('GLOBAL_ADMIN')
  if (error) return error

  if (!syncroConfigured()) {
    return NextResponse.json({ error: 'Syncro not configured' }, { status: 422 })
  }

  let scope: string
  try {
    const body = await req.json()
    scope = body.scope ?? 'all'
  } catch {
    scope = 'all'
  }

  try {
    if (scope === 'all') {
      const results = await runFullMigration()
      return NextResponse.json({ success: true, scope, ...results })
    }

    let result
    switch (scope) {
      case 'customers':
        result = await migrateCustomers()
        break
      case 'contacts':
        result = await migrateContacts()
        break
      case 'sites':
        result = await migrateSites()
        break
      case 'tickets':
        result = await migrateTickets()
        break
      default:
        return NextResponse.json({ error: `Unknown scope: ${scope}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, scope, [scope]: result })
  } catch (e: any) {
    console.error('[syncro-migrate] Migration failed:', e)
    return NextResponse.json(
      { error: e.message || 'Migration failed' },
      { status: 500 },
    )
  }
}
