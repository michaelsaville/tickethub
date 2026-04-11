'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'

export type TaxRateResult = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<TaxRateResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

function parseState(raw: string): string | null {
  const s = raw.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(s)) return null
  return s
}

function parseBps(raw: string): number | null {
  // Accept either "6" / "6.00" (percent) or "600" (bps). If the user
  // typed a percent value <= 30, interpret as percent. Otherwise bps.
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= 30) return Math.round(n * 100)
  return Math.round(n)
}

export async function upsertTaxRate(
  _prev: TaxRateResult | null,
  formData: FormData,
): Promise<TaxRateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const state = parseState((formData.get('state') as string) ?? '')
  if (!state) return { ok: false, error: 'State must be a 2-letter code' }

  const rateRaw = (formData.get('rateBps') as string) ?? ''
  const rateBps = parseBps(rateRaw)
  if (rateBps === null) return { ok: false, error: 'Invalid rate' }

  const label = ((formData.get('label') as string) ?? '').trim() || null

  try {
    await prisma.tH_TaxRate.upsert({
      where: { state },
      create: { state, rateBps, label },
      update: { rateBps, label },
    })
    revalidatePath('/settings/tax-rates')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tax-rates] upsert failed', e)
    return { ok: false, error: 'Failed to save' }
  }
}

export async function deleteTaxRate(state: string): Promise<TaxRateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  try {
    await prisma.tH_TaxRate.delete({ where: { state: state.toUpperCase() } })
    revalidatePath('/settings/tax-rates')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tax-rates] delete failed', e)
    return { ok: false, error: 'Failed to delete' }
  }
}

export async function updateTaxRateValue(
  state: string,
  rateBps: number,
): Promise<TaxRateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  try {
    await prisma.tH_TaxRate.update({
      where: { state: state.toUpperCase() },
      data: { rateBps },
    })
    revalidatePath('/settings/tax-rates')
    return { ok: true }
  } catch (e) {
    console.error('[actions/tax-rates] update failed', e)
    return { ok: false, error: 'Failed to update' }
  }
}
