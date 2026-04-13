import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/auth'
import { syncroFetch, syncroConfigured } from '@/app/lib/syncro'

/**
 * POST /api/admin/syncro-migrate
 *
 * Pull customers, contacts, and service addresses from Syncro and
 * upsert into TicketHub. Uses syncroId/syncroContactId/syncroSiteId
 * for deduplication — safe to run multiple times.
 *
 * Also auto-creates a Global Contract for each new client.
 */
export async function POST(req: Request) {
  const { error } = await requireAuth('GLOBAL_ADMIN')
  if (error) return error

  if (!syncroConfigured()) {
    return NextResponse.json({ error: 'Syncro not configured' }, { status: 422 })
  }

  const results = {
    clients: { created: 0, updated: 0, errors: [] as string[] },
    contacts: { created: 0, updated: 0, errors: [] as string[] },
    sites: { created: 0, updated: 0, errors: [] as string[] },
  }

  // ── 1. Fetch all customers from Syncro ────────────────────────────────
  const customers = await fetchAllPages('/customers')

  for (const c of customers) {
    if (c.disabled) continue

    try {
      const name = c.business_name?.trim() || c.fullname || `Customer ${c.id}`
      const billingState = c.state?.trim()?.toUpperCase()?.slice(0, 2) || null

      const existing = await prisma.tH_Client.findUnique({
        where: { syncroId: c.id },
      })

      if (existing) {
        await prisma.tH_Client.update({
          where: { id: existing.id },
          data: { name, billingState: billingState || undefined },
        })
        results.clients.updated++
      } else {
        const client = await prisma.tH_Client.create({
          data: {
            name,
            syncroId: c.id,
            billingState,
            billingEmail: c.email?.trim() || null,
          },
        })

        // Auto-create Global Contract
        await prisma.tH_Contract.create({
          data: {
            clientId: client.id,
            name: 'Global',
            type: 'GLOBAL',
            status: 'ACTIVE',
            isGlobal: true,
          },
        })

        results.clients.created++
      }
    } catch (e: any) {
      results.clients.errors.push(`Customer ${c.id}: ${e.message}`)
    }
  }

  // ── 2. Fetch contacts per customer ────────────────────────────────────
  for (const c of customers) {
    if (c.disabled) continue

    const thClient = await prisma.tH_Client.findUnique({
      where: { syncroId: c.id },
      select: { id: true },
    })
    if (!thClient) continue

    try {
      const contacts = await fetchAllPages(`/customers/${c.id}/contacts`)

      for (const con of contacts) {
        try {
          const existing = await prisma.tH_Contact.findUnique({
            where: { syncroContactId: con.id },
          })

          const data = {
            firstName: con.first_name?.trim() || con.name?.split(' ')[0] || 'Unknown',
            lastName: con.last_name?.trim() || con.name?.split(' ').slice(1).join(' ') || '',
            email: con.email?.trim() || null,
            phone: con.phone?.trim() || con.mobile?.trim() || null,
            jobTitle: con.title?.trim() || null,
          }

          if (existing) {
            await prisma.tH_Contact.update({
              where: { id: existing.id },
              data,
            })
            results.contacts.updated++
          } else {
            await prisma.tH_Contact.create({
              data: {
                clientId: thClient.id,
                syncroContactId: con.id,
                isPrimary: con.primary ?? false,
                ...data,
              },
            })
            results.contacts.created++
          }
        } catch (e: any) {
          results.contacts.errors.push(`Contact ${con.id}: ${e.message}`)
        }
      }
    } catch (e: any) {
      results.contacts.errors.push(`Customer ${c.id} contacts: ${e.message}`)
    }
  }

  // ── 3. Fetch service addresses (sites) ─────────────────────────────────
  for (const c of customers) {
    if (c.disabled) continue

    const thClient = await prisma.tH_Client.findUnique({
      where: { syncroId: c.id },
      select: { id: true },
    })
    if (!thClient) continue

    // Syncro embeds addresses in the customer object
    // Create a primary site from the customer's address
    if (c.address || c.city) {
      try {
        const siteId = c.id * 10000 // deterministic ID for primary address
        const existing = await prisma.tH_Site.findUnique({
          where: { syncroSiteId: siteId },
        })

        const data = {
          name: 'Primary Site',
          address: [c.address, c.address_2].filter(Boolean).join(', ') || null,
          city: c.city?.trim() || null,
          state: c.state?.trim() || null,
          zip: c.zip?.trim() || null,
        }

        if (existing) {
          await prisma.tH_Site.update({ where: { id: existing.id }, data })
          results.sites.updated++
        } else {
          await prisma.tH_Site.create({
            data: {
              clientId: thClient.id,
              syncroSiteId: siteId,
              ...data,
            },
          })
          results.sites.created++
        }
      } catch (e: any) {
        results.sites.errors.push(`Customer ${c.id} primary site: ${e.message}`)
      }
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    totals: {
      clientsProcessed: customers.filter((c: any) => !c.disabled).length,
      contactsFetched: results.contacts.created + results.contacts.updated,
      sitesFetched: results.sites.created + results.sites.updated,
    },
  })
}

// ── Syncro paginated fetch helper ────────────────────────────────────────

async function fetchAllPages(endpoint: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const res = await syncroFetch(`${endpoint}?page=${page}&per_page=100`)
    if (!res.ok) {
      console.error(`[syncro-migrate] ${endpoint} page ${page} failed: ${res.status}`)
      break
    }
    const json = await res.json()
    const key = Object.keys(json).find(k => Array.isArray(json[k]) && k !== 'meta')
    if (key) all.push(...json[key])
    totalPages = json.meta?.total_pages ?? 1
    page++
  }

  return all
}
