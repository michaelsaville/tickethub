import { prisma } from '@/app/lib/prisma'
import { EstimatePortalView } from './EstimatePortalView'

export const dynamic = 'force-dynamic'

export default async function EstimatePortalPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>
}) {
  const { token, id } = await params

  const portalToken = await prisma.tH_ContactPortalToken.findUnique({
    where: { token },
    select: {
      id: true,
      isActive: true,
      expiresAt: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          clientId: true,
          client: { select: { name: true } },
        },
      },
    },
  })

  if (
    !portalToken ||
    !portalToken.isActive ||
    (portalToken.expiresAt && portalToken.expiresAt < new Date())
  ) {
    return (
      <div className="min-h-screen bg-th-bg flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-mono text-slate-100">
            Link Expired or Invalid
          </h1>
          <p className="mt-2 text-sm text-th-text-secondary">
            This portal link is no longer active. Please contact PCC2K for a new
            link.
          </p>
        </div>
      </div>
    )
  }

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      items: {
        include: { item: { select: { name: true, type: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!estimate || estimate.clientId !== portalToken.contact.clientId) {
    return (
      <div className="min-h-screen bg-th-bg flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-mono text-slate-100">
            Estimate Not Found
          </h1>
          <p className="mt-2 text-sm text-th-text-secondary">
            This estimate could not be found or you do not have access to it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <EstimatePortalView
      token={token}
      estimateId={id}
      contactName={`${portalToken.contact.firstName} ${portalToken.contact.lastName}`}
      companyName={portalToken.contact.client.name}
      estimate={{
        estimateNumber: estimate.estimateNumber,
        title: estimate.title,
        description: estimate.description,
        status: estimate.status,
        subtotal: estimate.subtotal,
        taxRate: estimate.taxRate,
        taxAmount: estimate.taxAmount,
        totalAmount: estimate.totalAmount,
        validUntil: estimate.validUntil?.toISOString() ?? null,
        notes: estimate.notes,
        sentAt: estimate.sentAt?.toISOString() ?? null,
        approvedAt: estimate.approvedAt?.toISOString() ?? null,
        declinedAt: estimate.declinedAt?.toISOString() ?? null,
        convertedAt: estimate.convertedAt?.toISOString() ?? null,
        items: estimate.items.map((i) => ({
          name: i.item.name,
          type: i.item.type,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
        })),
      }}
    />
  )
}
