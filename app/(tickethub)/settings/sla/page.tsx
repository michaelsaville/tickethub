import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { TH_TicketPriority } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { DEFAULT_POLICIES } from '@/app/lib/sla'
import { SlaPoliciesForm } from './SlaPoliciesForm'

export const dynamic = 'force-dynamic'

const PRIORITIES: TH_TicketPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

export default async function SlaSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">SLA Policies</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required.
        </p>
      </div>
    )
  }

  const rows = await prisma.tH_SlaPolicy.findMany()
  const byPriority = new Map(rows.map((r) => [r.priority, r]))
  const values = PRIORITIES.map((p) => {
    const row = byPriority.get(p)
    return {
      priority: p,
      responseMinutes: row?.responseMinutes ?? DEFAULT_POLICIES[p].responseMinutes,
      resolveMinutes: row?.resolveMinutes ?? DEFAULT_POLICIES[p].resolveMinutes,
      isDefault: !row,
    }
  })

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">SLA Policies</h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Response and resolve targets applied automatically when a ticket is
          created. Priority changes do not recalculate existing deadlines.
          Tickets paused in <span className="font-mono">WAITING_*</span> statuses
          have their deadlines shifted forward by the pause duration on resume.
        </p>
      </header>

      <SlaPoliciesForm initial={values} />
    </div>
  )
}
