import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatRate } from '@/app/lib/tax'
import { rateForStateAsync } from '@/app/lib/tax-server'
import { InvoicePicker, type PickerCharge } from './InvoicePicker'

export const dynamic = 'force-dynamic'

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const canSeeAmounts = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')

  const sp = await searchParams
  if (!sp.clientId) {
    const clients = await prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true, billingState: true },
    })
    return (
      <div className="p-6">
        <Link
          href="/invoices"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Invoices
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">New Invoice</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Pick a client — you can choose which billable charges to include.
        </p>
        <ul className="mt-6 divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/invoices/new?clientId=${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-th-elevated"
              >
                <span className="flex-1 text-slate-100">{c.name}</span>
                <span className="font-mono text-xs text-th-text-muted">
                  {c.billingState ?? 'no tax state'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const client = await prisma.tH_Client.findUnique({
    where: { id: sp.clientId },
    include: {
      contracts: {
        include: {
          charges: {
            where: { status: 'BILLABLE' },
            include: {
              item: { select: { name: true, taxable: true, type: true } },
              ticket: { select: { id: true, ticketNumber: true, title: true } },
            },
            orderBy: { workDate: 'asc' },
          },
        },
      },
    },
  })
  if (!client) notFound()

  const pickerCharges: PickerCharge[] = client.contracts.flatMap((contract) =>
    contract.charges.map((c) => ({
      id: c.id,
      type: c.type,
      itemName: c.item.name,
      itemTaxable: c.item.taxable,
      description: c.description,
      quantity: c.quantity,
      timeChargedMinutes: c.timeChargedMinutes,
      unitPrice: c.unitPrice,
      totalPrice: c.totalPrice,
      contractId: contract.id,
      contractName: contract.name,
      contractType: contract.type,
      isGlobalContract: contract.isGlobal,
      ticketId: c.ticket?.id ?? null,
      ticketNumber: c.ticket?.ticketNumber ?? null,
      ticketTitle: c.ticket?.title ?? null,
    })),
  )

  const taxRate = await rateForStateAsync(client.billingState)
  const canInvoice =
    pickerCharges.length > 0 && Boolean(client.billingState) && taxRate !== 0
  const stateReason = !client.billingState
    ? "Client has no Tax State set — set it on the client detail page first."
    : taxRate === 0
      ? `No tax rate configured for ${client.billingState}.`
      : null

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/invoices"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Invoices
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          New Invoice — {client.name}
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {pickerCharges.length} BILLABLE{' '}
          {pickerCharges.length === 1 ? 'charge' : 'charges'} · tax state{' '}
          <span className="font-mono text-slate-200">
            {client.billingState ?? '—'}
          </span>{' '}
          · rate{' '}
          <span className="font-mono text-slate-200">
            {formatRate(taxRate)}
          </span>
        </p>
      </header>

      <InvoicePicker
        clientId={client.id}
        billingState={client.billingState}
        taxRate={taxRate}
        charges={pickerCharges}
        canSeeAmounts={canSeeAmounts}
        canInvoice={canInvoice}
        stateReason={stateReason}
      />
    </div>
  )
}
