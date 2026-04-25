import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { PODetailClient } from './PODetailClient'

export const dynamic = 'force-dynamic'

export default async function PurchaseOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  const { id } = await params
  const po = await prisma.tH_PurchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, contactEmail: true } },
      createdBy: { select: { name: true } },
      lines: {
        orderBy: { createdAt: 'asc' },
        include: {
          ticketPart: {
            select: {
              id: true,
              status: true,
              ticket: { select: { id: true, ticketNumber: true, title: true } },
            },
          },
        },
      },
    },
  })
  if (!po) notFound()

  const totalCents = po.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/purchase-orders"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Purchase orders
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl text-slate-100">PO-{po.poNumber}</h1>
          <span className="text-sm text-th-text-secondary">
            <Link
              href={`/vendors`}
              className="hover:text-accent"
            >
              {po.vendor.name}
            </Link>
          </span>
          {po.externalRef && (
            <span className="text-xs text-th-text-muted">
              ↗ {po.externalRef}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-th-text-secondary">
          Created by {po.createdBy.name} ·{' '}
          {new Date(po.createdAt).toLocaleString()}
        </div>
      </header>

      <PODetailClient
        po={JSON.parse(JSON.stringify({ ...po, totalCents }))}
      />
    </div>
  )
}
