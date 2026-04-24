'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import {
  chargeSavedCardForInvoice,
  createSetupIntentForClient,
  detachSavedPaymentMethod,
  saveAttachedPaymentMethod,
  stripeConfigured,
} from '@/app/lib/stripe'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

export type SetupIntentResult =
  | { ok: true; clientSecret: string; publishableKey: string }
  | { ok: false; error: string }

/**
 * Kick off the Stripe Elements flow: mint a SetupIntent and hand back
 * its client_secret + our publishable key. The caller (client modal)
 * uses these to call `stripe.confirmCardSetup(clientSecret, { payment_method })`.
 */
export async function createCardSetupIntent(
  clientId: string,
): Promise<SetupIntentResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!stripeConfigured()) return { ok: false, error: 'Stripe not configured' }
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return { ok: false, error: 'STRIPE_PUBLISHABLE_KEY not configured' }
  }
  try {
    const { clientSecret } = await createSetupIntentForClient(clientId)
    return { ok: true, clientSecret, publishableKey }
  } catch (e) {
    console.error('[actions/payment-methods] setup-intent failed', e)
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'SetupIntent failed',
    }
  }
}

export type AttachCardResult =
  | { ok: true; id: string; brand: string; last4: string }
  | { ok: false; error: string }

/**
 * Called by the Add-Card modal after Stripe.js reports a successful
 * confirmCardSetup. Writes the card to TH_SavedPaymentMethod. Idempotent.
 */
export async function attachCardToClient(
  clientId: string,
  paymentMethodId: string,
  setDefault: boolean,
): Promise<AttachCardResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  try {
    const row = await saveAttachedPaymentMethod(
      clientId,
      paymentMethodId,
      setDefault,
    )
    if (!row) return { ok: false, error: 'PaymentMethod has no card details' }
    revalidatePath(`/clients/${clientId}/payment-methods`)
    revalidatePath(`/clients/${clientId}`)
    return { ok: true, id: row.id, brand: row.brand, last4: row.last4 }
  } catch (e) {
    console.error('[actions/payment-methods] attach failed', e)
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Attach failed',
    }
  }
}

export async function setDefaultPaymentMethod(
  savedPaymentMethodId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  try {
    const row = await prisma.tH_SavedPaymentMethod.findUnique({
      where: { id: savedPaymentMethodId },
      select: { clientId: true },
    })
    if (!row) return { ok: false, error: 'Card not found' }
    await prisma.$transaction([
      prisma.tH_SavedPaymentMethod.updateMany({
        where: { clientId: row.clientId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.tH_SavedPaymentMethod.update({
        where: { id: savedPaymentMethodId },
        data: { isDefault: true },
      }),
    ])
    revalidatePath(`/clients/${row.clientId}/payment-methods`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/payment-methods] setDefault failed', e)
    return { ok: false, error: 'Failed to set default' }
  }
}

export async function removePaymentMethod(
  savedPaymentMethodId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  try {
    const row = await prisma.tH_SavedPaymentMethod.findUnique({
      where: { id: savedPaymentMethodId },
      select: { clientId: true },
    })
    if (!row) return { ok: false, error: 'Card not found' }
    await detachSavedPaymentMethod(savedPaymentMethodId)
    revalidatePath(`/clients/${row.clientId}/payment-methods`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/payment-methods] remove failed', e)
    return { ok: false, error: 'Failed to remove card' }
  }
}

export async function chargeInvoiceWithSavedCard(
  invoiceId: string,
  savedPaymentMethodId: string,
): Promise<
  | { ok: true; paymentIntentId: string; status: string }
  | { ok: false; error: string; code?: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  const result = await chargeSavedCardForInvoice(
    invoiceId,
    savedPaymentMethodId,
  )
  if (result.ok) {
    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/invoices')
  }
  return result
}
