import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { TemplateList } from './TemplateList'

export const dynamic = 'force-dynamic'

export default async function ChecklistTemplatesPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Checklist Templates</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to manage checklist templates.
        </p>
      </div>
    )
  }

  const templates = await prisma.tH_ChecklistTemplate.findMany({
    orderBy: { name: 'asc' },
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
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Checklist Templates
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Create reusable SOP checklists. Apply them to any ticket to pre-populate
          checklist items.
        </p>
      </header>

      <TemplateList templates={templates} />
    </div>
  )
}
