import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { NewPOForm } from './NewPOForm'

export const dynamic = 'force-dynamic'

export default async function NewPurchaseOrderPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  const [vendors, orphanParts] = await Promise.all([
    prisma.tH_Vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, termsDays: true },
    }),
    // Parts not yet on a PO and still in PENDING_ORDER, so the form can
    // offer to bundle them into the new PO.
    prisma.tH_TicketPart.findMany({
      where: {
        status: 'PENDING_ORDER',
        poLine: { is: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        quantity: true,
        unitCost: true,
        vendor: true,
        ticket: { select: { id: true, ticketNumber: true } },
      },
    }),
  ])

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/purchase-orders"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Purchase orders
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">New PO</h1>
        <p className="mt-1 text-xs text-th-text-muted">
          Pick a vendor, add lines (or pull pending parts), save as DRAFT.
          You can mark sent / receive against the PO once saved.
        </p>
      </header>

      {vendors.length === 0 ? (
        <div className="rounded-md border border-dashed border-th-border p-12 text-center text-sm">
          <p className="text-th-text-secondary">
            No active vendors yet.{' '}
            <Link href="/vendors" className="text-accent hover:underline">
              Create one first
            </Link>
            .
          </p>
        </div>
      ) : (
        <NewPOForm
          vendors={vendors}
          orphanParts={JSON.parse(JSON.stringify(orphanParts))}
        />
      )}
    </div>
  )
}
