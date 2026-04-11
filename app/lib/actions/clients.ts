'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type CreateClientResult =
  | { ok: true; clientId: string }
  | { ok: false; error: string }

export async function createClient(
  _prevState: CreateClientResult | null,
  formData: FormData,
): Promise<CreateClientResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }

  const name = (formData.get('name') as string | null)?.trim()
  const shortCodeRaw = (formData.get('shortCode') as string | null)?.trim()
  const internalNotes = (formData.get('internalNotes') as string | null)?.trim() || null

  if (!name) return { ok: false, error: 'Name is required' }
  const shortCode = shortCodeRaw ? shortCodeRaw.toUpperCase() : null

  try {
    const created = await prisma.$transaction(async (tx) => {
      const client = await tx.tH_Client.create({
        data: { name, shortCode, internalNotes },
      })
      // PLANNING.md §4 Decision 4 — every client gets a Global Contract
      // on creation so work can be logged immediately with zero setup.
      await tx.tH_Contract.create({
        data: {
          clientId: client.id,
          name: 'Global',
          type: 'GLOBAL',
          status: 'ACTIVE',
          isGlobal: true,
          notes: 'Auto-created on client creation. Billing fallback with no cap.',
        },
      })
      return client
    })
    revalidatePath('/clients')
    redirect(`/clients/${created.id}`)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'digest' in e) throw e // let redirect pass through
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint') && msg.includes('shortCode')) {
      return { ok: false, error: `Short code "${shortCode}" is already in use` }
    }
    console.error('[actions/clients] create failed', e)
    return { ok: false, error: 'Failed to create client' }
  }
}

export async function updateClientNotes(
  clientId: string,
  internalNotes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  try {
    await prisma.tH_Client.update({
      where: { id: clientId },
      data: { internalNotes: internalNotes?.trim() || null },
    })
    revalidatePath(`/clients/${clientId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/clients] update notes failed', e)
    return { ok: false, error: 'Failed to update notes' }
  }
}
