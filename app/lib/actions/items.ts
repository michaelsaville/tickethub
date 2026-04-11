'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_ItemType } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { parseCents } from '@/app/lib/billing'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])
const VALID_TYPES: TH_ItemType[] = [
  'LABOR',
  'PART',
  'EXPENSE',
  'LICENSE',
  'CONTRACT_FEE',
]

export type ItemResult = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<{ ok: true } | ItemResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

export async function createItem(
  _prev: ItemResult | null,
  formData: FormData,
): Promise<ItemResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const name = (formData.get('name') as string | null)?.trim()
  const code = (formData.get('code') as string | null)?.trim() || null
  const type = formData.get('type') as TH_ItemType | null
  const priceRaw = (formData.get('defaultPrice') as string | null) ?? ''
  const costRaw = (formData.get('costPrice') as string | null) ?? ''
  const taxable = formData.get('taxable') === 'on'

  if (!name) return { ok: false, error: 'Name is required' }
  if (!type || !VALID_TYPES.includes(type)) {
    return { ok: false, error: 'Invalid item type' }
  }
  const defaultPrice = priceRaw.trim() ? parseCents(priceRaw) : 0
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
    return { ok: false, error: 'Invalid price' }
  }
  const costPrice = costRaw.trim() ? parseCents(costRaw) : null

  try {
    await prisma.tH_Item.create({
      data: {
        name,
        code: code?.toUpperCase() ?? null,
        type,
        defaultPrice,
        costPrice,
        taxable,
      },
    })
    revalidatePath('/settings/items')
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint') && msg.includes('code')) {
      return { ok: false, error: `Code "${code}" is already in use` }
    }
    console.error('[actions/items] create failed', e)
    return { ok: false, error: 'Failed to create item' }
  }
}

export async function updateItem(
  itemId: string,
  patch: {
    name?: string
    defaultPrice?: number
    costPrice?: number | null
    taxable?: boolean
    isActive?: boolean
  },
): Promise<ItemResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  try {
    await prisma.tH_Item.update({
      where: { id: itemId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.defaultPrice !== undefined
          ? { defaultPrice: patch.defaultPrice }
          : {}),
        ...(patch.costPrice !== undefined
          ? { costPrice: patch.costPrice }
          : {}),
        ...(patch.taxable !== undefined ? { taxable: patch.taxable } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    })
    revalidatePath('/settings/items')
    return { ok: true }
  } catch (e) {
    console.error('[actions/items] update failed', e)
    return { ok: false, error: 'Failed to update item' }
  }
}
