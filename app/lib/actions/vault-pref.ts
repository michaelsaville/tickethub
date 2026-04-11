'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type VaultPrefResult = { ok: true; showVaultLink: boolean } | { ok: false; error: string }

export async function updateVaultPref(formData: FormData): Promise<VaultPrefResult> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const showVaultLink = formData.get('showVaultLink') === 'on'

  try {
    await prisma.tH_User.update({
      where: { id: userId },
      data: { showVaultLink },
    })
    revalidatePath('/settings/vault')
    revalidatePath('/', 'layout')
    return { ok: true, showVaultLink }
  } catch (e) {
    console.error('[actions/vault-pref] save failed', e)
    return { ok: false, error: 'Failed to save preference' }
  }
}
