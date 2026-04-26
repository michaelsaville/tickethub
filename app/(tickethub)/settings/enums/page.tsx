import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import {
  listEnumDisplays,
  type EnumDisplay,
  type EnumName,
} from '@/app/lib/enum-overrides'
import { EnumOverridesEditor } from './EnumOverridesEditor'

export const dynamic = 'force-dynamic'

const SECTIONS: { name: EnumName; title: string; description: string }[] = [
  {
    name: 'TICKET_STATUS',
    title: 'Ticket Status',
    description:
      'Lifecycle states. Renaming labels and recoloring is safe; SLA logic and status transitions are unaffected. Hidden values disappear from new pickers but still render correctly on existing tickets.',
  },
  {
    name: 'TICKET_PRIORITY',
    title: 'Ticket Priority',
    description: 'Used by SLA targets and dispatch sorting.',
  },
  {
    name: 'TICKET_TYPE',
    title: 'Ticket Type',
    description:
      'Hide types you don’t use. Color overrides aren’t wired to type badges yet.',
  },
]

export default async function EnumOverridesPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/settings')
  }

  const sections: { name: EnumName; title: string; description: string; values: EnumDisplay[] }[] = []
  for (const s of SECTIONS) {
    const values = await listEnumDisplays(s.name, { includeHidden: true })
    sections.push({ ...s, values })
  }

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
          Status, Priority &amp; Type Customization
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Rename, recolor, or hide built-in ticket enum values. The
          underlying values stay the same — only how they render changes.
          Hide values you don&apos;t use to clean up pickers without
          breaking historical tickets.
        </p>
      </header>

      <div className="space-y-8">
        {sections.map((s) => (
          <EnumOverridesEditor key={s.name} section={s} />
        ))}
      </div>
    </div>
  )
}
