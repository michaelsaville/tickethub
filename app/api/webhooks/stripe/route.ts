import { NextResponse, type NextRequest } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/app/lib/prisma'
import { stripe, stripeConfigured, deactivatePaymentLink } from '@/app/lib/stripe'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

export const dynamic = 'force-dynamic'

/**
 * Stripe → TicketHub webhook. Fires when a Payment Link is redeemed and
 * the checkout completes. Required headers:
 *
 *   Stripe-Signature: t=<ts>,v1=<hex>
 *
 * STRIPE_WEBHOOK_SECRET must match the "Signing secret" on the webhook
 * endpoint configured in the Stripe dashboard.
 *
 * This route is excluded from the withAuth matcher because it's
 * authenticated by signature verification, not session cookie.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'stripe not configured' }, { status: 503 })
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not set' }, { status: 500 })
  }

  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.error('[webhook/stripe] signature verification failed', err)
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const invoiceId = session.metadata?.tickethubInvoiceId
      if (!invoiceId) {
        console.warn('[webhook/stripe] checkout.session.completed missing invoiceId metadata', session.id)
        break
      }
      // Guard: session.payment_status tells us if the session was paid
      // synchronously (card) vs. pending (bank transfer). Only flip the
      // row on confirmed paid — pending sessions will re-fire another
      // event when funds clear.
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        console.log('[webhook/stripe] session not yet paid', session.id, session.payment_status)
        break
      }

      const invoice = await prisma.tH_Invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, status: true, stripePaymentLinkId: true },
      })
      if (!invoice) {
        console.warn('[webhook/stripe] invoice not found for session metadata', invoiceId)
        break
      }
      if (invoice.status === 'PAID') break // already handled; idempotent

      await prisma.tH_Invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        },
      })

      // Fire-and-forget: kill the link so stale email URLs can't be
      // reused. Intentionally not awaited — we've already done the
      // DB write that actually matters.
      void deactivatePaymentLink(invoice.stripePaymentLinkId)

      await emit({
        type: EVENT_TYPES.INVOICE_PAID,
        entityType: 'invoice',
        entityId: invoice.id,
        actorId: null,
        payload: {
          from: invoice.status,
          to: 'PAID',
          via: 'STRIPE_LINK',
          stripeSessionId: session.id,
        },
      })

      console.log('[webhook/stripe] invoice paid', invoice.id, session.id)
      break
    }
    case 'payment_intent.succeeded': {
      // Primary path for the "Charge saved card" flow (PaymentIntent with
      // off_session: true) and a backup for Payment-Link redemption.
      const pi = event.data.object as Stripe.PaymentIntent
      const invoiceId = pi.metadata?.tickethubInvoiceId
      if (!invoiceId) break
      const invoice = await prisma.tH_Invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, status: true, stripePaymentLinkId: true },
      })
      if (!invoice || invoice.status === 'PAID') break
      await prisma.tH_Invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt: new Date(), stripePaymentIntentId: pi.id },
      })
      // Kill any stale Payment Link so it can't be redeemed after we've
      // already collected via saved card.
      void deactivatePaymentLink(invoice.stripePaymentLinkId)

      await emit({
        type: EVENT_TYPES.INVOICE_PAID,
        entityType: 'invoice',
        entityId: invoice.id,
        actorId: null,
        payload: {
          from: invoice.status,
          to: 'PAID',
          via: 'SAVED_CARD',
          stripePaymentIntentId: pi.id,
        },
      })
      break
    }
    default:
      // Any other event type — log for observability, no-op.
      console.log('[webhook/stripe] unhandled event', event.type)
  }

  return NextResponse.json({ received: true })
}
