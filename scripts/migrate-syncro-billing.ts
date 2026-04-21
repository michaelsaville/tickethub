/**
 * One-shot CLI for importing Syncro estimates + invoices into TicketHub.
 * Preserves source `number` as estimateNumber/invoiceNumber and bumps the
 * Postgres sequence so the next natural-path estimate/invoice continues
 * above Syncro's max.
 *
 * Usage from repo root (inside a throwaway node container on the
 * dochub_default network):
 *
 *   docker run --rm --network dochub_default \
 *     -v /home/msaville/tickethub:/app -w /app \
 *     -u "$(id -u):$(id -g)" -e HOME=/tmp \
 *     --env-file /home/msaville/tickethub/.env.local \
 *     node:20-alpine node_modules/.bin/tsx scripts/migrate-syncro-billing.ts [scope]
 *
 * scope: estimates | invoices | both (default)
 */

import { migrateEstimates, migrateInvoices } from '../app/lib/syncro-migrate'

async function main() {
  const scope = (process.argv[2] ?? 'both') as 'estimates' | 'invoices' | 'both'
  const started = Date.now()

  if (scope === 'estimates' || scope === 'both') {
    console.log('[syncro-billing] migrating estimates…')
    const res = await migrateEstimates()
    console.log(`[syncro-billing] estimates: imported=${res.imported} skipped=${res.skipped} errors=${res.errors.length}`)
    for (const e of res.errors.slice(0, 20)) console.log(`  - ${e}`)
    if (res.errors.length > 20) console.log(`  … +${res.errors.length - 20} more`)
  }

  if (scope === 'invoices' || scope === 'both') {
    console.log('[syncro-billing] migrating invoices…')
    const res = await migrateInvoices()
    console.log(`[syncro-billing] invoices: imported=${res.imported} skipped=${res.skipped} errors=${res.errors.length}`)
    for (const e of res.errors.slice(0, 20)) console.log(`  - ${e}`)
    if (res.errors.length > 20) console.log(`  … +${res.errors.length - 20} more`)
  }

  console.log(`[syncro-billing] done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main()
  .catch((e) => { console.error('[syncro-billing] FAILED:', e); process.exit(1) })
  .finally(() => process.exit(0))
