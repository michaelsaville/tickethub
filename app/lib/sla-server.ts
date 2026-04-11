import 'server-only'
import type { TH_TicketPriority } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { DEFAULT_POLICIES } from '@/app/lib/sla'

/** Resolve the SLA policy for a priority, falling back to DEFAULT_POLICIES. */
export async function resolveSlaPolicy(priority: TH_TicketPriority) {
  const row = await prisma.tH_SlaPolicy.findUnique({
    where: { priority },
    select: { responseMinutes: true, resolveMinutes: true },
  })
  return row ?? DEFAULT_POLICIES[priority]
}

/** Compute due dates for a new or repriced ticket. */
export async function computeSlaDates(
  priority: TH_TicketPriority,
  now: Date = new Date(),
) {
  const policy = await resolveSlaPolicy(priority)
  return {
    slaResponseDue: new Date(now.getTime() + policy.responseMinutes * 60_000),
    slaResolveDue: new Date(now.getTime() + policy.resolveMinutes * 60_000),
  }
}
