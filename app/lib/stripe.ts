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

// ─── Stored payment methods ─────────────────────────────────────────────
// Card details never touch our server — Stripe Elements tokenizes them
// client-side, returning a PaymentMethod ID we attach to a Customer.

/**
 * Create (or reuse) a Stripe Customer for a TH_Client. Caches the
 * customer id on TH_Client.stripeCustomerId so repeat calls are cheap.
 */
export async function ensureStripeCustomer(clientId: string): Promise<string> {
  if (!stripeConfigured()) throw new Error('Stripe not configured')
  const existing = await prisma.tH_Client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, billingEmail: true, stripeCustomerId: true },
  })
  if (!existing) throw new Error('Client not found')
  if (existing.stripeCustomerId) return existing.stripeCustomerId

  const s = stripe()
  const customer = await s.customers.create({
    name: existing.name,
    ...(existing.billingEmail ? { email: existing.billingEmail } : {}),
    metadata: { tickethubClientId: clientId },
  })
  await prisma.tH_Client.update({
    where: { id: clientId },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

/**
 * Mint a SetupIntent for a client so the admin "Add card" UI can confirm
 * it via Stripe Elements. Returns the client_secret the Elements form
 * needs, plus the customer id for the publishable-key-scoped flow.
 */
export async function createSetupIntentForClient(clientId: string): Promise<{
  clientSecret: string
  customerId: string
}> {
  if (!stripeConfigured()) throw new Error('Stripe not configured')
  const customerId = await ensureStripeCustomer(clientId)
  const s = stripe()
  const intent = await s.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: { tickethubClientId: clientId },
  })
  if (!intent.client_secret) {
    throw new Error('SetupIntent missing client_secret')
  }
  return { clientSecret: intent.client_secret, customerId }
}

/**
 * After a successful Stripe Elements confirmCardSetup call, fetch the
 * PaymentMethod metadata and store it in TH_SavedPaymentMethod. Idempotent
 * on stripePaymentMethodId via the unique constraint.
 */
export async function saveAttachedPaymentMethod(
  clientId: string,
  paymentMethodId: string,
  setDefault: boolean,
): Promise<{ id: string; brand: string; last4: string } | null> {
  if (!stripeConfigured()) throw new Error('Stripe not configured')
  const s = stripe()
  const pm = await s.paymentMethods.retrieve(paymentMethodId)
  const card = pm.card
  if (!card) return null

  // Flip existing default off if we're setting this one as default.
  if (setDefault) {
    await prisma.tH_SavedPaymentMethod.updateMany({
      where: { clientId, isDefault: true },
      data: { isDefault: false },
    })
  }
  // Upsert so the same confirmCardSetup hitting us twice doesn't dupe.
  const row = await prisma.tH_SavedPaymentMethod.upsert({
    where: { stripePaymentMethodId: paymentMethodId },
    create: {
      clientId,
      stripePaymentMethodId: paymentMethodId,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      cardholderName: pm.billing_details?.name ?? null,
      isDefault: setDefault,
    },
    update: {
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      cardholderName: pm.billing_details?.name ?? null,
      ...(setDefault ? { isDefault: true } : {}),
    },
    select: { id: true, brand: true, last4: true },
  })
  return row
}

/**
 * Detach a card from the Stripe Customer and drop our row. Safe to call
 * when Stripe already forgot about it — we log and continue.
 */
export async function detachSavedPaymentMethod(
  savedPaymentMethodId: string,
): Promise<void> {
  const row = await prisma.tH_SavedPaymentMethod.findUnique({
    where: { id: savedPaymentMethodId },
    select: { stripePaymentMethodId: true },
  })
  if (!row) return
  if (stripeConfigured()) {
    try {
      await stripe().paymentMethods.detach(row.stripePaymentMethodId)
    } catch (e) {
      console.error('[stripe] detach failed', row.stripePaymentMethodId, e)
    }
  }
  await prisma.tH_SavedPaymentMethod.delete({
    where: { id: savedPaymentMethodId },
  })
}

/**
 * Charge a saved card for an invoice. Returns a descriptive result that
 * the UI can render. Success flips invoice to PAID via the existing
 * payment_intent.succeeded webhook — we don't duplicate that write here.
 *
 * If 3DS / bank authentication is required (`requires_action`), we
 * surface a clear error so staff can fall back to the Payment Link.
 */
export async function chargeSavedCardForInvoice(
  invoiceId: string,
  savedPaymentMethodId: string,
): Promise<
  | { ok: true; paymentIntentId: string; status: Stripe.PaymentIntent.Status }
  | { ok: false; error: string; code?: string }
> {
  if (!stripeConfigured()) return { ok: false, error: 'Stripe not configured' }

  const invoice = await prisma.tH_Invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      status: true,
      clientId: true,
    },
  })
  if (!invoice) return { ok: false, error: 'Invoice not found' }
  if (invoice.totalAmount <= 0) return { ok: false, error: 'Invoice total is zero' }
  if (invoice.status === 'PAID') return { ok: false, error: 'Invoice already paid' }
  if (invoice.status === 'VOID' || invoice.status === 'DRAFT') {
    return { ok: false, error: `Cannot charge a ${invoice.status} invoice` }
  }

  const card = await prisma.tH_SavedPaymentMethod.findFirst({
    where: { id: savedPaymentMethodId, clientId: invoice.clientId },
    select: { stripePaymentMethodId: true },
  })
  if (!card) return { ok: false, error: 'Saved card not found for this client' }

  const customerId = await ensureStripeCustomer(invoice.clientId)
  const s = stripe()

  try {
    const intent = await s.paymentIntents.create({
      amount: invoice.totalAmount,
      currency: 'usd',
      customer: customerId,
      payment_method: card.stripePaymentMethodId,
      confirm: true,
      off_session: true,
      description: `Invoice #${invoice.invoiceNumber}`,
      metadata: { tickethubInvoiceId: invoice.id },
    })
    // Update lastUsedAt on success + succeeded/processing states.
    if (intent.status === 'succeeded' || intent.status === 'processing') {
      await prisma.tH_SavedPaymentMethod.update({
        where: { id: savedPaymentMethodId },
        data: { lastUsedAt: new Date() },
      })
    }
    return {
      ok: true,
      paymentIntentId: intent.id,
      status: intent.status,
    }
  } catch (e) {
    // Stripe throws a StripeCardError when the card requires_action, is
    // declined, etc. Surface the reason so staff know whether to ask the
    // client for 3DS in-browser, or retry with a different card.
    if (e && typeof e === 'object' && 'type' in e) {
      const err = e as Stripe.errors.StripeError
      return {
        ok: false,
        error: err.message || 'Stripe charge failed',
        code: err.code ?? undefined,
      }
    }
    console.error('[stripe] chargeSavedCard failed', e)
    return { ok: false, error: 'Stripe charge failed' }
  }
}

export { cancelUrl, successUrl }
