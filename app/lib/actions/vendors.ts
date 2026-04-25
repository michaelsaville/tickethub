'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'

async function requireAdmin() {
  const { session, error } = await requireAuth()
  if (error || !session) throw new Error('Not authenticated')
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    throw new Error('Forbidden')
  }
  return session
}

export async function createVendor(input: {
  name: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  website?: string
  termsDays?: number
  notes?: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin()
  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'Name is required' }
  try {
    const v = await prisma.tH_Vendor.create({
      data: {
        name,
        contactName: input.contactName?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        contactPhone: input.contactPhone?.trim() || null,
        website: input.website?.trim() || null,
        termsDays:
          input.termsDays != null && Number.isFinite(input.termsDays)
            ? input.termsDays
            : null,
        notes: input.notes?.trim() || null,
      },
      select: { id: true },
    })
    revalidatePath('/vendors')
    return { ok: true, id: v.id }
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      return { ok: false, error: 'A vendor with that name already exists' }
    }
    console.error('[vendors] create failed', e)
    return { ok: false, error: 'Failed to create vendor' }
  }
}

export async function updateVendor(
  id: string,
  input: {
    name?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    website?: string
    termsDays?: number | null
    notes?: string
    isActive?: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  try {
    await prisma.tH_Vendor.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.contactName !== undefined
          ? { contactName: input.contactName?.trim() || null }
          : {}),
        ...(input.contactEmail !== undefined
          ? { contactEmail: input.contactEmail?.trim() || null }
          : {}),
        ...(input.contactPhone !== undefined
          ? { contactPhone: input.contactPhone?.trim() || null }
          : {}),
        ...(input.website !== undefined
          ? { website: input.website?.trim() || null }
          : {}),
        ...(input.termsDays !== undefined
          ? { termsDays: input.termsDays }
          : {}),
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
    revalidatePath('/vendors')
    revalidatePath(`/vendors/${id}`)
    return { ok: true }
  } catch (e) {
    console.error('[vendors] update failed', e)
    return { ok: false, error: 'Failed to update vendor' }
  }
}
