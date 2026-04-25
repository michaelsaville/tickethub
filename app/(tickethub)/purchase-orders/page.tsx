import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { POListClient } from './POListClient'

export const dynamic = 'force-dynamic'

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; vendorId?: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  const sp = await searchParams
  const where: { status?: any; vendorId?: string } = {}
  if (sp.status && sp.status !== 'all') where.status = sp.status
  if (sp.vendorId) where.vendorId = sp.vendorId

  const [pos, vendors] = await Promise.all([
    prisma.tH_PurchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        poNumber: true,
        status: true,
        externalRef: true,
        sentAt: true,
        expectedAt: true,
        receivedAt: true,
        createdAt: true,
        vendor: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        lines: {
          select: { quantity: true, receivedQuantity: true, unitCost: true },
        },
      },
    }),
    prisma.tH_Vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const rows = pos.map((p) => {
    const totalCents = p.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    const totalUnits = p.lines.reduce((s, l) => s + l.quantity, 0)
    const receivedUnits = p.lines.reduce((s, l) => s + l.receivedQuantity, 0)
    return {
      id: p.id,
      poNumber: p.poNumber,
      status: p.status,
      externalRef: p.externalRef,
      sentAt: p.sentAt,
      expectedAt: p.expectedAt,
      receivedAt: p.receivedAt,
      createdAt: p.createdAt,
      vendor: p.vendor,
      createdBy: p.createdBy,
      totalCents,
      totalUnits,
      receivedUnits,
    }
  })

  const activeStatus = sp.status ?? 'all'

  return (
    <div className="p-6">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-th-text-secondary hover:text-accent"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 font-mono text-2xl text-slate-100">
            Purchase orders
          </h1>
          <p className="mt-1 text-xs text-th-text-muted">
            Group parts into vendor POs. Receiving a line auto-flips the
            linked ticket part to RECEIVED so the existing convert-to-charge
            flow on the ticket page keeps working unchanged.
          </p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30"
        >
          + New PO
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {[
          { key: 'all', label: 'All' },
          { key: 'DRAFT', label: 'Draft' },
          { key: 'SENT', label: 'Sent' },
          { key: 'PARTIAL', label: 'Partial' },
          { key: 'RECEIVED', label: 'Received' },
          { key: 'CLOSED', label: 'Closed' },
          { key: 'CANCELLED', label: 'Cancelled' },
        ].map((b) => (
          <Link
            key={b.key}
            href={
              b.key === 'all' ? '/purchase-orders' : `/purchase-orders?status=${b.key}`
            }
            className={
              activeStatus === b.key
                ? 'rounded-md bg-accent/10 px-3 py-1 text-accent ring-1 ring-accent/30'
                : 'rounded-md px-3 py-1 text-th-text-secondary hover:bg-th-elevated hover:text-slate-200'
            }
          >
            {b.label}
          </Link>
        ))}
      </div>

      <POListClient rows={JSON.parse(JSON.stringify(rows))} vendors={vendors} />
    </div>
  )
}
