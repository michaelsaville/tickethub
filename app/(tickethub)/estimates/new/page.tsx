import { prisma } from '@/app/lib/prisma'
import EstimateBuilder from './EstimateBuilder'

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
      select: { id: true, name: true, billingState: true },
    })

    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold mb-6">New Estimate — Select Client</h1>
        <div className="th-card divide-y divide-th-border">
          {clients.map(c => (
            <a
              key={c.id}
              href={`/estimates/new?clientId=${c.id}`}
              className="block px-4 py-3 hover:bg-th-elevated transition-colors"
            >
              <span className="font-medium">{c.name}</span>
              {c.billingState && (
                <span className="ml-2 text-xs text-th-secondary">{c.billingState}</span>
              )}
            </a>
          ))}
        </div>
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
