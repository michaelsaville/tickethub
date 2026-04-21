import 'server-only'
import Stripe from 'stripe'
import { prisma } from '@/app/lib/prisma'

/**
 * Lazy singleton — imports of this module should never fail just
 * because STRIPE_SECRET_KEY isn't set. Callers check stripeConfigured()
 * first and handle "not configured" gracefully (usually: still send the
 * invoice email without a pay link).
 */
let _stripe: Stripe | null = null
export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
    _stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' })
  }
  return _stripe
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

/**
 * Return URL we land on after a successful checkout. Stripe appends
 * `?session_id=cs_…` automatically when `{CHECKOUT_SESSION_ID}` appears.
 * The target page is on the portal — not TicketHub — so clients always
 * wrap up on their own domain.
 */
function successUrl(invoiceId: string): string {
  const base = process.env.PORTAL_BASE_URL ?? 'https://portal.pcc2k.com'
  return `${base.replace(/\/+$/, '')}/invoices?paid=${invoiceId}`
}

function cancelUrl(invoiceId: string): string {
  const base = process.env.PORTAL_BASE_URL ?? 'https://portal.pcc2k.com'
  return `${base.replace(/\/+$/, '')}/invoices?cancelled=${invoiceId}`
}

/**
 * Create — or reuse — a Stripe Payment Link for an invoice. Cached on
 * TH_Invoice.stripePaymentLinkUrl so the same URL stays in every email
 * for the life of the invoice. Zero-total invoices get a null URL.
 *
 * Returns the URL, or null when Stripe isn't configured / the invoice
 * isn't a fit. Never throws on configuration issues; raising inside
 * sendInvoice() would block the email going out.
 */
export async function ensurePaymentLinkForInvoice(
  invoiceId: string,
): Promise<string | null> {
  if (!stripeConfigured()) return null

  const invoice = await prisma.tH_Invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      status: true,
      stripePaymentLinkUrl: true,
      client: { select: { name: true } },
    },
  })
  if (!invoice) return null
  if (invoice.totalAmount <= 0) return null
  if (invoice.status === 'PAID' || invoice.status === 'VOID') return null
  if (invoice.stripePaymentLinkUrl) return invoice.stripePaymentLinkUrl

  try {
    const s = stripe()

    // Product + Price scoped to this invoice so the Stripe dashboard
    // stays readable — one Product per invoice, not a forever-growing
    // catalog under a single line item.
    const product = await s.products.create({
      name: `Invoice #${invoice.invoiceNumber}`,
      description: `Payment for ${invoice.client.name}`,
      metadata: { tickethubInvoiceId: invoice.id },
    })

    const price = await s.prices.create({
      product: product.id,
      unit_amount: invoice.totalAmount,
      currency: 'usd',
    })

    const link = await s.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: 'redirect',
        redirect: { url: successUrl(invoice.id) },
      },
      // Metadata flows through to checkout.session.metadata when the
      // link is redeemed — that's what the webhook reads.
      metadata: { tickethubInvoiceId: invoice.id },
      payment_intent_data: {
        metadata: { tickethubInvoiceId: invoice.id },
      },
    })

    await prisma.tH_Invoice.update({
      where: { id: invoice.id },
      data: {
        stripePaymentLinkId: link.id,
        stripePaymentLinkUrl: link.url,
      },
    })

    return link.url
  } catch (e) {
    console.error('[stripe] ensurePaymentLinkForInvoice failed', e)
    return null
  }
}

/**
 * Deactivate a Stripe Payment Link — called when an invoice transitions
 * to PAID or VOID so a stale email link can't be reused to double-pay.
 * Errors are swallowed; a live link outlasting its invoice is a minor
 * nuisance, not a data-integrity failure.
 */
export async function deactivatePaymentLink(
  paymentLinkId: string | null | undefined,
): Promise<void> {
  if (!paymentLinkId) return
  if (!stripeConfigured()) return
  try {
    await stripe().paymentLinks.update(paymentLinkId, { active: false })
  } catch (e) {
    console.error('[stripe] deactivatePaymentLink failed', paymentLinkId, e)
  }
}

export { cancelUrl, successUrl }
