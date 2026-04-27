import { prisma } from '@/app/lib/prisma'
import EstimateBuilder from './EstimateBuilder'
import { ClientPicker } from '@/app/components/shared/ClientPicker'

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams

  // Step 1: Pick a client
  if (!clientId) {
    const clients = await prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true, billingState: true },
    })

    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="mb-1 font-mono text-2xl text-slate-100">
          New Estimate
        </h1>
        <p className="mb-4 text-sm text-th-text-secondary">
          Pick a client to start the estimate.
        </p>
        <ClientPicker
          mode="navigate"
          clients={clients}
          hrefTemplate="/estimates/new?clientId={id}"
          label="Client"
        />
      </div>
    )
  }

  // Step 2: Build estimate with item picker
  const client = await prisma.tH_Client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, billingState: true },
  })
  if (!client) return <div className="p-8 text-red-400">Client not found</div>

  const contacts = await prisma.tH_Contact.findMany({
    where: { clientId, isActive: true },
    orderBy: { isPrimary: 'desc' },
    select: { id: true, firstName: true, lastName: true, email: true, isPrimary: true },
  })

  const contracts = await prisma.tH_Contract.findMany({
    where: { clientId, status: 'ACTIVE' },
    orderBy: { isGlobal: 'desc' },
    select: { id: true, name: true, type: true, isGlobal: true },
  })

  const items = await prisma.tH_Item.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, type: true, defaultPrice: true, taxable: true },
  })

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">New Estimate</h1>
      <p className="text-sm text-th-secondary mb-6">{client.name}</p>
      <EstimateBuilder
        client={client}
        contacts={contacts}
        contracts={contracts}
        catalogItems={items}
      />
    </div>
  )
}
