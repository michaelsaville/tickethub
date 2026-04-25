import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { VendorsClient } from './VendorsClient'

export const dynamic = 'force-dynamic'

export default async function VendorsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  const vendors = await prisma.tH_Vendor.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      website: true,
      termsDays: true,
      notes: true,
      isActive: true,
      _count: {
        select: { purchaseOrders: true, ticketParts: true },
      },
    },
  })

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
          <h1 className="mt-2 font-mono text-2xl text-slate-100">Vendors</h1>
          <p className="mt-1 text-xs text-th-text-muted">
            Catalog of suppliers used on POs and parts. Net-N terms here
            default the expected-arrival on new POs.
          </p>
        </div>
      </header>

      <VendorsClient vendors={JSON.parse(JSON.stringify(vendors))} />
    </div>
  )
}
