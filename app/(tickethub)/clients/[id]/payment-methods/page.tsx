import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { stripeConfigured } from '@/app/lib/stripe'
import { PaymentMethodsList } from './PaymentMethodsList'

export const dynamic = 'force-dynamic'

export default async function PaymentMethodsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Payment Methods</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to manage saved payment methods.
        </p>
      </div>
    )
  }

  const { id } = await params
  const client = await prisma.tH_Client.findUnique({
    where: { id },
    include: {
      savedPaymentMethods: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      },
    },
  })
  if (!client) notFound()

  const stripeReady =
    stripeConfigured() && !!process.env.STRIPE_PUBLISHABLE_KEY

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href={`/clients/${client.id}`}
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← {client.name}
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Payment Methods
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Saved cards for <span className="text-slate-200">{client.name}</span>.
          Card details never touch our server — Stripe Elements tokenizes them
          client-side. Only the brand, last 4, and expiry are stored here.
        </p>
      </header>

      {!stripeReady && (
        <div className="mb-6 rounded-lg border border-priority-urgent/40 bg-priority-urgent/10 p-4 text-sm text-priority-urgent">
          Stripe is not configured — set{' '}
          <code className="font-mono">STRIPE_SECRET_KEY</code> and{' '}
          <code className="font-mono">STRIPE_PUBLISHABLE_KEY</code> in
          .env.local to enable saved cards.
        </div>
      )}

      <PaymentMethodsList
        clientId={client.id}
        methods={client.savedPaymentMethods.map((m) => ({
          id: m.id,
          brand: m.brand,
          last4: m.last4,
          expMonth: m.expMonth,
          expYear: m.expYear,
          cardholderName: m.cardholderName,
          isDefault: m.isDefault,
          lastUsedAt: m.lastUsedAt,
          createdAt: m.createdAt,
        }))}
        stripeReady={stripeReady}
      />
    </div>
  )
}
