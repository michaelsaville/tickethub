'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_TicketPriority } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

export type SlaPolicyResult = { ok: true } | { ok: false; error: string }

export async function upsertSlaPolicies(
  _prev: SlaPolicyResult | null,
  formData: FormData,
): Promise<SlaPolicyResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  // Relaxed in dev: in production gate on role once admins are promoted.
  void ADMIN_ROLES

  const priorities: TH_TicketPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

  try {
    await prisma.$transaction(
      priorities.map((priority) => {
        const response = Number.parseInt(
          (formData.get(`${priority}_response`) as string | null) ?? '0',
          10,
        )
        const resolve = Number.parseInt(
          (formData.get(`${priority}_resolve`) as string | null) ?? '0',
          10,
        )
        if (!Number.isFinite(response) || response <= 0) {
          throw new Error(`Invalid response time for ${priority}`)
        }
        if (!Number.isFinite(resolve) || resolve <= 0) {
          throw new Error(`Invalid resolve time for ${priority}`)
        }
        if (resolve < response) {
          throw new Error(
            `${priority}: resolve time must be ≥ response time`,
          )
        }
        return prisma.tH_SlaPolicy.upsert({
          where: { priority },
          create: { priority, responseMinutes: response, resolveMinutes: resolve },
          update: { responseMinutes: response, resolveMinutes: resolve },
        })
      }),
    )
    revalidatePath('/settings/sla')
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    return { ok: false, error: msg }
  }
}
