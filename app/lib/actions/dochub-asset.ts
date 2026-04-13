'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

type Result = { ok: true } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function linkDochubAsset(
  ticketId: string,
  assetId: string,
  assetName: string,
): Promise<Result> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  await prisma.tH_Ticket.update({
    where: { id: ticketId },
    data: {
      dochubAssetId: assetId,
      dochubAssetName: assetName,
    },
  })

  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

export async function unlinkDochubAsset(ticketId: string): Promise<Result> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  await prisma.tH_Ticket.update({
    where: { id: ticketId },
    data: {
      dochubAssetId: null,
      dochubAssetName: null,
    },
  })

  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}
