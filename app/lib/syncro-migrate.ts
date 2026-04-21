import 'server-only'

import { prisma } from '@/app/lib/prisma'
import { syncroFetch, syncroConfigured } from '@/app/lib/syncro'
import type {
  TH_TicketStatus,
  TH_TicketPriority,
  TH_TicketType,
} from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────

export interface MigrationResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface FullMigrationResult {
  customers: MigrationResult
  contacts: MigrationResult
  sites: MigrationResult
  tickets: MigrationResult
  estimates: MigrationResult
  estimateItems: MigrationResult
  invoices: MigrationResult
}

// ── Status / Priority / Type mappings ─────────────────────────────────────

function mapStatus(raw: string | null | undefined): { status: TH_TicketStatus; board: string | null } {
  if (!raw) return { status: 'OPEN', board: null }

  let board: string | null = null
  let keyword = raw.trim()

  if (keyword.includes('|')) {
    const parts = keyword.split('|')
    board = parts[0].trim() || null
    keyword = parts.slice(1).join('|').trim()
  }

  const lower = keyword.toLowerCase()

  let status: TH_TicketStatus
  if (lower === 'new') {
    status = 'NEW'
  } else if (lower === 'in progress') {
    status = 'IN_PROGRESS'
  } else if (lower === 'pending review' || lower === 'customer reply') {
    status = 'OPEN'
  } else if (lower === 'waiting on customer') {
    status = 'WAITING_CUSTOMER'
  } else if (lower === 'scheduled') {
    status = 'OPEN'
  } else if (lower === 'pending parts' || lower === 'hold') {
    status = 'WAITING_THIRD_PARTY'
  } else if (lower === 'resolved') {
    status = 'RESOLVED'
  } else {
    status = 'OPEN'
  }

  return { status, board }
}

function mapPriority(_raw: string | null | undefined): TH_TicketPriority {
  return 'MEDIUM'
}

function mapType(raw: string | null | undefined): TH_TicketType {
  if (!raw) return 'INCIDENT'
  const lower = raw.trim().toLowerCase()
  if (lower === 'maintenance' || lower === 'regular maintenance') return 'MAINTENANCE'
  if (lower === 'remote support') return 'SERVICE_REQUEST'
  return 'INCIDENT'
}

// ── Syncro paginated fetch ────────────────────────────────────────────────

async function fetchAllPages(endpoint: string, perPage = 100, maxPages = 200): Promise<any[]> {
  const all: any[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= maxPages) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const res = await syncroFetch(`${endpoint}${sep}page=${page}&per_page=${perPage}`)
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

// ── Migrate Customers ─────────────────────────────────────────────────────

export async function migrateCustomers(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }
  const customers = await fetchAllPages('/customers')

  for (const c of customers) {
    if (c.disabled) {
      result.skipped++
      continue
    }

    try {
      const existing = await prisma.tH_Client.findUnique({
        where: { syncroId: c.id },
      })

      if (existing) {
        result.skipped++
        continue
      }

      const name =
        c.business_name?.trim() ||
        [c.firstname, c.lastname].filter(Boolean).join(' ').trim() ||
        c.fullname?.trim() ||
        `Customer ${c.id}`

      const billingState = c.state?.trim()?.toUpperCase()?.slice(0, 2) || null

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

      result.imported++
    } catch (e: any) {
      result.errors.push(`Customer ${c.id}: ${e.message}`)
    }
  }

  return result
}

// ── Migrate Contacts ──────────────────────────────────────────────────────

export async function migrateContacts(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }

  const clients = await prisma.tH_Client.findMany({
    where: { syncroId: { not: null } },
    select: { id: true, syncroId: true },
  })

  for (const client of clients) {
    try {
      const contacts = await fetchAllPages(`/customers/${client.syncroId}/contacts`)

      for (const con of contacts) {
        try {
          const existing = await prisma.tH_Contact.findUnique({
            where: { syncroContactId: con.id },
          })

          if (existing) {
            result.skipped++
            continue
          }

          const firstName =
            con.first_name?.trim() || con.name?.split(' ')[0]?.trim() || 'Unknown'
          const lastName =
            con.last_name?.trim() || con.name?.split(' ').slice(1).join(' ').trim() || ''

          await prisma.tH_Contact.create({
            data: {
              clientId: client.id,
              syncroContactId: con.id,
              firstName,
              lastName,
              email: con.email?.trim() || null,
              phone: con.phone?.trim() || con.mobile?.trim() || null,
              jobTitle: con.title?.trim() || null,
              isPrimary: con.primary ?? false,
            },
          })

          result.imported++
        } catch (e: any) {
          result.errors.push(`Contact ${con.id}: ${e.message}`)
        }
      }
    } catch (e: any) {
      result.errors.push(`Customer ${client.syncroId} contacts: ${e.message}`)
    }
  }

  return result
}

// ── Migrate Sites ─────────────────────────────────────────────────────────

export async function migrateSites(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }

  const clients = await prisma.tH_Client.findMany({
    where: { syncroId: { not: null } },
    select: { id: true, syncroId: true },
  })

  for (const client of clients) {
    try {
      const res = await syncroFetch(`/customers/${client.syncroId}/addresses`)
      if (!res.ok) {
        result.errors.push(`Customer ${client.syncroId} addresses: HTTP ${res.status}`)
        continue
      }
      const json = await res.json()
      const addresses: any[] = json.addresses ?? json.customer_addresses ?? []

      for (const addr of addresses) {
        try {
          const existing = await prisma.tH_Site.findUnique({
            where: { syncroSiteId: addr.id },
          })

          if (existing) {
            result.skipped++
            continue
          }

          await prisma.tH_Site.create({
            data: {
              clientId: client.id,
              syncroSiteId: addr.id,
              name: addr.name?.trim() || 'Site',
              address: [addr.address1, addr.address2].filter(Boolean).join(', ') || null,
              city: addr.city?.trim() || null,
              state: addr.state?.trim() || null,
              zip: addr.zip?.trim() || null,
            },
          })

          result.imported++
        } catch (e: any) {
          result.errors.push(`Address ${addr.id}: ${e.message}`)
        }
      }
    } catch (e: any) {
      result.errors.push(`Customer ${client.syncroId} addresses: ${e.message}`)
    }
  }

  return result
}

// ── Migrate Tickets ───────────────────────────────────────────────────────

export async function migrateTickets(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }

  // Find the system user (oldest GLOBAL_ADMIN) for createdById
  const systemUser = await prisma.tH_User.findFirst({
    where: { role: 'GLOBAL_ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  if (!systemUser) {
    result.errors.push('No GLOBAL_ADMIN user found to use as ticket creator')
    return result
  }

  // Build lookup of syncroId → TH_Client.id
  const clients = await prisma.tH_Client.findMany({
    where: { syncroId: { not: null } },
    select: { id: true, syncroId: true },
  })
  const clientMap = new Map(clients.map(c => [c.syncroId!, c.id]))

  // Paginate through Syncro tickets (up to 100 pages at 50/page = 5000)
  const tickets = await fetchAllPages('/tickets', 50, 100)

  for (const t of tickets) {
    try {
      // Check dedup
      const existing = await prisma.tH_Ticket.findUnique({
        where: { syncroId: t.id },
      })

      if (existing) {
        result.skipped++
        continue
      }

      // Match client
      const clientId = clientMap.get(t.customer_id)
      if (!clientId) {
        result.skipped++
        continue
      }

      const { status, board } = mapStatus(t.status)
      const priority = mapPriority(t.priority)
      const type = mapType(t.problem_type)

      const closedAt =
        status === 'RESOLVED' && t.resolved_at
          ? new Date(t.resolved_at)
          : null

      const ticket = await prisma.tH_Ticket.create({
        data: {
          clientId,
          createdById: systemUser.id,
          title: t.subject?.trim() || `Syncro Ticket #${t.number || t.id}`,
          status,
          priority,
          type,
          board: board || null,
          syncroId: t.id,
          closedAt,
          createdAt: t.created_at ? new Date(t.created_at) : undefined,
        },
      })

      // Import comments
      const comments: any[] = t.comments ?? []
      for (const comment of comments) {
        try {
          const body =
            comment.rich_text_preview?.trim() ||
            comment.body?.trim() ||
            ''
          if (!body) continue

          await prisma.tH_TicketComment.create({
            data: {
              ticketId: ticket.id,
              authorId: systemUser.id,
              body,
              isInternal: comment.hidden ?? false,
              createdAt: comment.created_at
                ? new Date(comment.created_at)
                : undefined,
            },
          })
        } catch (e: any) {
          // Non-fatal: log but don't fail the ticket
          console.error(`[syncro-migrate] Comment on ticket ${t.id}: ${e.message}`)
        }
      }

      result.imported++
    } catch (e: any) {
      result.errors.push(`Ticket ${t.id}: ${e.message}`)
    }
  }

  return result
}

// ── Estimates ──────────────────────────────────────────────────────────────

/** Parse "123.45" → 12345 (cents). NaN-safe (returns 0). */
function toCents(raw: string | number | null | undefined): number {
  if (raw == null) return 0
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Parse Syncro's numeric "number" field ("1044") → 1044. Returns null for non-integer. */
function parseEstimateOrInvoiceNumber(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = parseInt(String(raw).replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Syncro estimate statuses seen in the wild: Fresh, Sent, Approved, Declined.
 * "Fresh" (unsent draft in our mental model) still comes through as actionable
 * on the portal once the client sees it; mapping to SENT is correct for any
 * non-draft historical state. Declined/Approved pass through directly.
 */
function mapEstimateStatus(raw: string | null | undefined): 'SENT' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED' {
  switch ((raw ?? '').toLowerCase()) {
    case 'approved': return 'APPROVED'
    case 'declined': return 'DECLINED'
    case 'expired':  return 'EXPIRED'
    case 'converted': return 'CONVERTED'
    default: return 'SENT'
  }
}

/**
 * Bump a Postgres serial sequence so the next nextval() returns
 * MAX(column) + 1. No-op when the table is empty (MAX returns NULL
 * and pg_get_serial_sequence stays at its bootstrap value of 1).
 *
 * Called after estimate + invoice import so the next estimate/invoice
 * created the natural way continues Syncro's numbering instead of
 * colliding with an imported row.
 */
async function bumpSerialSequence(table: string, column: string): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<{ next: bigint | null }[]>(
    `SELECT setval(
       pg_get_serial_sequence('${table}', '${column}'),
       COALESCE((SELECT MAX("${column}") FROM ${table}), 1),
       (SELECT MAX("${column}") IS NOT NULL FROM ${table})
     ) AS next`,
  )
  const n = rows[0]?.next
  return typeof n === 'bigint' ? Number(n) : n ?? null
}

export async function migrateEstimates(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }

  const clients = await prisma.tH_Client.findMany({
    where: { syncroId: { not: null } },
    select: { id: true, syncroId: true },
  })
  const clientMap = new Map(clients.map(c => [c.syncroId!, c.id]))

  // Up to 200 pages at 100/page = 20_000 estimates. Syncro's estimates
  // endpoint returns all statuses when no filter is passed.
  const estimates = await fetchAllPages('/estimates', 100, 200)

  for (const e of estimates) {
    try {
      const clientId = clientMap.get(e.customer_id)
      if (!clientId) {
        result.skipped++
        continue
      }

      // Syncro's `number` is a short decimal string; preserving it as
      // TH's estimateNumber is the whole point per user instruction.
      const estimateNumber = parseEstimateOrInvoiceNumber(e.number)
      if (estimateNumber == null) {
        result.skipped++
        continue
      }

      // Dedup: either externalRef OR estimateNumber collision (run twice
      // safely). externalRef is the source-of-truth for Syncro imports.
      const existing = await prisma.tH_Estimate.findFirst({
        where: {
          OR: [
            { externalRef: `syncro:${e.id}` },
            { estimateNumber },
          ],
        },
        select: { id: true },
      })
      if (existing) {
        result.skipped++
        continue
      }

      const subtotal = toCents(e.subtotal)
      const tax      = toCents(e.tax)
      const total    = toCents(e.total)
      const status   = mapEstimateStatus(e.status)
      const createdAt = e.created_at ? new Date(e.created_at) : new Date()
      const sentAt = status !== 'SENT'
        ? createdAt
        : e.created_at ? new Date(e.created_at) : null

      await prisma.tH_Estimate.create({
        data: {
          estimateNumber,
          clientId,
          status,
          title: e.name?.trim() || `Estimate #${e.number}`,
          subtotal,
          taxableSubtotal: subtotal,
          taxAmount: tax,
          totalAmount: total,
          sentAt,
          approvedAt: status === 'APPROVED' ? (e.updated_at ? new Date(e.updated_at) : createdAt) : null,
          declinedAt: status === 'DECLINED' ? (e.updated_at ? new Date(e.updated_at) : createdAt) : null,
          convertedAt: status === 'CONVERTED' ? (e.updated_at ? new Date(e.updated_at) : createdAt) : null,
          externalRef: `syncro:${e.id}`,
          createdAt,
        },
      })

      result.imported++
    } catch (err: any) {
      result.errors.push(`Estimate ${e.id}: ${err.message}`)
    }
  }

  // Bump the sequence so the next natural-path estimate gets a number
  // above whatever Syncro's max was. No-op if we imported nothing.
  try {
    await bumpSerialSequence('tickethub.th_estimates', 'estimateNumber')
  } catch (err: any) {
    result.errors.push(`Sequence bump failed: ${err.message}`)
  }

  return result
}

/**
 * Backfill TH_EstimateItem rows for previously-imported Syncro
 * estimates. Requires a second HTTP fetch per estimate (Syncro's list
 * endpoint omits line_items) so this is broken out from
 * migrateEstimates() to keep the first pass fast.
 *
 * Uses a single synthetic TH_Item ("Imported line item", code
 * syncro-import-legacy, type EXPENSE) so the catalog doesn't bloat
 * with per-line-item rows nobody will ever reuse. The actual Syncro
 * name goes into TH_EstimateItem.description; the portal detail view
 * shows both columns.
 */
export async function migrateEstimateItems(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }

  const legacyItem = await prisma.tH_Item.upsert({
    where: { code: 'syncro-import-legacy' },
    update: {},
    create: {
      name: 'Imported line item',
      code: 'syncro-import-legacy',
      type: 'EXPENSE',
      defaultPrice: 0,
      taxable: true,
      isActive: false, // don't show in staff "add item" pickers
    },
    select: { id: true },
  })

  const estimates = await prisma.tH_Estimate.findMany({
    where: { externalRef: { startsWith: 'syncro:' } },
    select: {
      id: true,
      externalRef: true,
      _count: { select: { items: true } },
    },
  })

  for (const est of estimates) {
    if (est._count.items > 0) { result.skipped++; continue }
    const syncroId = est.externalRef?.replace(/^syncro:/, '')
    if (!syncroId) { result.skipped++; continue }

    try {
      const res = await syncroFetch(`/estimates/${syncroId}`)
      if (!res.ok) {
        result.errors.push(`Estimate ${syncroId}: HTTP ${res.status}`)
        continue
      }
      const json = (await res.json()) as { estimate?: { line_items?: any[] } }
      const items: any[] = json.estimate?.line_items ?? []

      if (items.length === 0) { result.skipped++; continue }

      await prisma.tH_EstimateItem.createMany({
        data: items.map((li, idx) => ({
          estimateId: est.id,
          itemId: legacyItem.id,
          description: li.name?.trim() || null,
          quantity: parseFloat(li.quantity ?? '1') || 1,
          unitPrice: toCents(li.price),
          totalPrice: toCents(li.price) * (parseFloat(li.quantity ?? '1') || 1) || toCents(li.price),
          sortOrder: typeof li.position === 'number' ? li.position : idx,
        })),
      })
      result.imported += items.length
    } catch (err: any) {
      result.errors.push(`Estimate ${syncroId}: ${err.message}`)
    }
  }

  return result
}

// ── Invoices ───────────────────────────────────────────────────────────────

/**
 * Syncro invoices carry `is_paid` (and `verified_paid`) — when true,
 * map to PAID. Unpaid invoices with a past due_date could become
 * OVERDUE, but the portal derives "past due" visually from dueDate
 * regardless of stored status, so we leave SENT/PAID as the only
 * imported terminal states and trust downstream rendering to flag
 * overdue.
 */
function mapInvoiceStatus(inv: {
  is_paid?: boolean
  verified_paid?: boolean
  tech_marked_paid?: boolean
}): 'SENT' | 'PAID' | 'VOID' {
  if (inv.is_paid || inv.verified_paid || inv.tech_marked_paid) return 'PAID'
  return 'SENT'
}

export async function migrateInvoices(): Promise<MigrationResult> {
  if (!syncroConfigured()) throw new Error('Syncro not configured')

  const result: MigrationResult = { imported: 0, skipped: 0, errors: [] }

  const clients = await prisma.tH_Client.findMany({
    where: { syncroId: { not: null } },
    select: { id: true, syncroId: true },
  })
  const clientMap = new Map(clients.map(c => [c.syncroId!, c.id]))

  const invoices = await fetchAllPages('/invoices', 100, 300)

  for (const inv of invoices) {
    try {
      const clientId = clientMap.get(inv.customer_id)
      if (!clientId) {
        result.skipped++
        continue
      }

      const invoiceNumber = parseEstimateOrInvoiceNumber(inv.number)
      if (invoiceNumber == null) {
        result.skipped++
        continue
      }

      const existing = await prisma.tH_Invoice.findFirst({
        where: {
          OR: [
            { externalRef: `syncro:${inv.id}` },
            { invoiceNumber },
          ],
        },
        select: { id: true },
      })
      if (existing) {
        result.skipped++
        continue
      }

      const subtotal = toCents(inv.subtotal)
      const tax      = toCents(inv.tax)
      const total    = toCents(inv.total)
      const status   = mapInvoiceStatus(inv)
      const issueDate = inv.date ? new Date(inv.date) : new Date()
      const dueDate   = inv.due_date ? new Date(inv.due_date) : null
      const paidAt    = status === 'PAID' ? (inv.updated_at ? new Date(inv.updated_at) : new Date()) : null

      await prisma.tH_Invoice.create({
        data: {
          invoiceNumber,
          clientId,
          status,
          issueDate,
          dueDate,
          subtotal,
          taxableSubtotal: subtotal,
          taxAmount: tax,
          totalAmount: total,
          sentAt: issueDate,
          paidAt,
          externalRef: `syncro:${inv.id}`,
          createdAt: inv.created_at ? new Date(inv.created_at) : issueDate,
        },
      })

      result.imported++
    } catch (err: any) {
      result.errors.push(`Invoice ${inv.id}: ${err.message}`)
    }
  }

  try {
    await bumpSerialSequence('tickethub.th_invoices', 'invoiceNumber')
  } catch (err: any) {
    result.errors.push(`Sequence bump failed: ${err.message}`)
  }

  return result
}

// ── Full Migration ────────────────────────────────────────────────────────

export async function runFullMigration(
  onProgress?: (msg: string) => void,
): Promise<FullMigrationResult> {
  const log = onProgress ?? (() => {})

  log('Starting customer migration...')
  const customers = await migrateCustomers()
  log(`Customers done: ${customers.imported} imported, ${customers.skipped} skipped`)

  log('Starting contact migration...')
  const contacts = await migrateContacts()
  log(`Contacts done: ${contacts.imported} imported, ${contacts.skipped} skipped`)

  log('Starting site migration...')
  const sites = await migrateSites()
  log(`Sites done: ${sites.imported} imported, ${sites.skipped} skipped`)

  log('Starting ticket migration...')
  const tickets = await migrateTickets()
  log(`Tickets done: ${tickets.imported} imported, ${tickets.skipped} skipped`)

  log('Starting estimate migration...')
  const estimates = await migrateEstimates()
  log(`Estimates done: ${estimates.imported} imported, ${estimates.skipped} skipped`)

  log('Starting estimate line-item migration...')
  const estimateItems = await migrateEstimateItems()
  log(`Estimate items done: ${estimateItems.imported} imported, ${estimateItems.skipped} skipped`)

  log('Starting invoice migration...')
  const invoices = await migrateInvoices()
  log(`Invoices done: ${invoices.imported} imported, ${invoices.skipped} skipped`)

  return { customers, contacts, sites, tickets, estimates, estimateItems, invoices }
}
