import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { ContractsList } from './ContractsList'

export const dynamic = 'force-dynamic'

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const { id } = await params

  const client = await prisma.tH_Client.findUnique({
    where: { id },
    include: {
      contracts: {
        orderBy: [{ isGlobal: 'desc' }, { createdAt: 'desc' }],
        include: {
          _count: { select: { charges: true, tickets: true } },
        },
      },
    },
  })
  if (!client) notFound()

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href={`/clients/${client.id}`}
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← {client.name}
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Contracts</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {client.contracts.length}{' '}
          {client.contracts.length === 1 ? 'contract' : 'contracts'}
        </p>
      </header>

      <ContractsList
        clientId={client.id}
        contracts={client.contracts.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          monthlyFee: c.monthlyFee,
          blockHours: c.blockHours,
          blockHoursUsed: c.blockHoursUsed,
          isGlobal: c.isGlobal,
          notes: c.notes,
          autoInvoiceEnabled: c.autoInvoiceEnabled,
          autoSendInvoice: c.autoSendInvoice,
          billingDayOfMonth: c.billingDayOfMonth,
          lastAutoInvoicedAt: c.lastAutoInvoicedAt,
          chargeCount: c._count.charges,
          ticketCount: c._count.tickets,
        }))}
      />
    </div>
  )
}
