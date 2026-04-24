/**
 * Pre-launch spot check: compare 10 random migrated invoices against
 * their Syncro source to catch any drift before clients see them.
 *
 * Usage (same pattern as migrate-syncro-billing.ts):
 *
 *   docker run --rm --network dochub_default \
 *     -v /home/msaville/tickethub:/app -w /app \
 *     -u "$(id -u):$(id -g)" -e HOME=/tmp \
 *     --env-file /home/msaville/tickethub/.env.local \
 *     node:20-alpine node_modules/.bin/tsx scripts/spot-check-syncro-invoices.ts
 *
 * For each sampled TH invoice:
 *   - Extracts the Syncro invoice id from `externalRef = syncro:<id>`
 *   - Calls GET /api/v1/invoices/<id>
 *   - Compares invoice number, client name, total (cents), issue date
 *   - Prints PASS / WARN / FAIL per row plus a summary
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SAMPLE_SIZE = 10

function syncroConfigured(): boolean {
  return !!(process.env.SYNCRO_API_KEY && process.env.SYNCRO_SUBDOMAIN)
}

async function syncroFetch(path: string): Promise<Response> {
  const subdomain = process.env.SYNCRO_SUBDOMAIN
  const apiKey = process.env.SYNCRO_API_KEY
  if (!subdomain || !apiKey) throw new Error('Syncro env not set')
  return fetch(`https://${subdomain}.syncromsp.com/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  })
}

interface SyncroInvoiceResponse {
  invoice?: {
    id: number
    number: string | number
    customer_id: number
    customer_business_then_name?: string
    customer_name?: string
    subtotal?: string | number
    total?: string | number
    date?: string
    due_date?: string
    created_at?: string
    paid?: boolean
  }
}

function parseSyncroId(externalRef: string | null): number | null {
  if (!externalRef) return null
  const m = externalRef.match(/^syncro:(\d+)$/)
  return m ? Number(m[1]) : null
}

function dollarsToCents(value: string | number | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function fmtCents(c: number | null): string {
  if (c == null) return '—'
  return `$${(c / 100).toFixed(2)}`
}

async function main() {
  if (!syncroConfigured()) {
    console.error('[spot-check] SYNCRO_API_KEY / SYNCRO_SUBDOMAIN not set')
    process.exit(1)
  }

  const total = await prisma.tH_Invoice.count({
    where: { externalRef: { startsWith: 'syncro:' } },
  })
  console.log(`[spot-check] ${total} migrated invoices in TH`)

  // Random sample via ORDER BY random() — cheap at 338 rows.
  const sample = await prisma.$queryRaw<
    Array<{
      id: string
      externalRef: string | null
      invoiceNumber: number
      totalAmount: number
      issueDate: Date
      clientName: string
    }>
  >`
    SELECT i.id, i."externalRef", i."invoiceNumber", i."totalAmount",
           i."issueDate", c.name AS "clientName"
    FROM tickethub.th_invoices i
    JOIN tickethub.th_clients c ON c.id = i."clientId"
    WHERE i."externalRef" LIKE 'syncro:%'
    ORDER BY random()
    LIMIT ${SAMPLE_SIZE}
  `

  let pass = 0
  let warn = 0
  let fail = 0
  const rows: string[] = []

  for (const inv of sample) {
    const syncroId = parseSyncroId(inv.externalRef)
    if (!syncroId) {
      rows.push(`FAIL   TH#${inv.invoiceNumber} — unparseable externalRef ${inv.externalRef}`)
      fail++
      continue
    }

    let src: SyncroInvoiceResponse['invoice'] | null = null
    try {
      const res = await syncroFetch(`/invoices/${syncroId}`)
      if (!res.ok) {
        rows.push(`FAIL   TH#${inv.invoiceNumber} (syncro:${syncroId}) — HTTP ${res.status}`)
        fail++
        continue
      }
      const json = (await res.json()) as SyncroInvoiceResponse
      src = json.invoice ?? null
    } catch (e) {
      rows.push(`FAIL   TH#${inv.invoiceNumber} (syncro:${syncroId}) — fetch error: ${e instanceof Error ? e.message : String(e)}`)
      fail++
      continue
    }
    if (!src) {
      rows.push(`FAIL   TH#${inv.invoiceNumber} (syncro:${syncroId}) — empty response`)
      fail++
      continue
    }

    const mismatches: string[] = []
    const srcNumber = Number(src.number)
    if (Number.isFinite(srcNumber) && srcNumber !== inv.invoiceNumber) {
      mismatches.push(`number ${inv.invoiceNumber}≠${srcNumber}`)
    }
    const srcTotalCents = dollarsToCents(src.total)
    if (srcTotalCents != null && srcTotalCents !== inv.totalAmount) {
      mismatches.push(`total ${fmtCents(inv.totalAmount)}≠${fmtCents(srcTotalCents)}`)
    }
    const srcClient = (src.customer_business_then_name ?? src.customer_name ?? '').trim()
    if (srcClient && srcClient.toLowerCase() !== inv.clientName.toLowerCase()) {
      mismatches.push(`client "${inv.clientName}"≠"${srcClient}"`)
    }
    const srcDateStr = src.date ?? src.created_at
    if (srcDateStr) {
      const srcDay = new Date(srcDateStr).toISOString().slice(0, 10)
      const thDay = inv.issueDate.toISOString().slice(0, 10)
      if (srcDay !== thDay) {
        mismatches.push(`date ${thDay}≠${srcDay}`)
      }
    }

    if (mismatches.length === 0) {
      rows.push(`PASS   TH#${inv.invoiceNumber} ${fmtCents(inv.totalAmount)} ${inv.clientName}`)
      pass++
    } else if (mismatches.some((m) => m.startsWith('total') || m.startsWith('client'))) {
      rows.push(`FAIL   TH#${inv.invoiceNumber} — ${mismatches.join(', ')}`)
      fail++
    } else {
      rows.push(`WARN   TH#${inv.invoiceNumber} — ${mismatches.join(', ')}`)
      warn++
    }
  }

  console.log('\n--- SAMPLE ---')
  for (const r of rows) console.log(r)
  console.log('--- SUMMARY ---')
  console.log(`pass=${pass} warn=${warn} fail=${fail} (of ${rows.length})`)
  if (fail > 0) {
    console.log('\nFAIL indicates total/client mismatch — investigate before launch.')
    console.log('WARN is date-only drift (often Syncro created_at vs. invoice date) — usually safe.')
  }
}

main()
  .catch((e) => {
    console.error('[spot-check] ERROR:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
