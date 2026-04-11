'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type SiteResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function createSite(
  clientId: string,
  _prev: SiteResult | null,
  formData: FormData,
): Promise<SiteResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  const name = (formData.get('name') as string | null)?.trim()
  const address = (formData.get('address') as string | null)?.trim() || null
  const city = (formData.get('city') as string | null)?.trim() || null
  const state = (formData.get('state') as string | null)?.trim() || null
  const zip = (formData.get('zip') as string | null)?.trim() || null
  const notes = (formData.get('notes') as string | null)?.trim() || null

  if (!name) return { ok: false, error: 'Site name is required' }

  try {
    await prisma.tH_Site.create({
      data: { clientId, name, address, city, state, zip, notes },
    })
    revalidatePath(`/clients/${clientId}`)
    revalidatePath(`/clients/${clientId}/sites`)
    redirect(`/clients/${clientId}/sites`)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('[actions/sites] create failed', e)
    return { ok: false, error: 'Failed to create site' }
  }
}

export async function deleteSite(
  clientId: string,
  siteId: string,
): Promise<SiteResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  try {
    // Hard delete a site only if no tickets reference it; otherwise orphan the FK.
    const ref = await prisma.tH_Ticket.count({ where: { siteId } })
    if (ref > 0) {
      return { ok: false, error: `Site has ${ref} ticket(s); cannot delete` }
    }
    await prisma.tH_Site.delete({ where: { id: siteId } })
    revalidatePath(`/clients/${clientId}`)
    revalidatePath(`/clients/${clientId}/sites`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/sites] delete failed', e)
    return { ok: false, error: 'Failed to delete site' }
  }
}
