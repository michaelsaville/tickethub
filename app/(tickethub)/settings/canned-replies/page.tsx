import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { CannedRepliesList } from './CannedRepliesList'

export const dynamic = 'force-dynamic'

export default async function CannedRepliesPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const isAdmin = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')
  const myId = session!.user.id

  const rows = await prisma.tH_CannedReply.findMany({
    where: {
      OR: [{ ownerId: myId }, { isShared: true }],
    },
    orderBy: [{ isShared: 'asc' }, { category: 'asc' }, { title: 'asc' }],
  })

  const replies = rows.map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    body: r.body,
    category: r.category,
    isShared: r.isShared,
    ownerId: r.ownerId,
    useCount: r.useCount,
    isOwn: r.ownerId === myId,
  }))

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
          Canned Replies
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Saved replies you can drop into a ticket comment by typing{' '}
          <span className="font-mono text-accent">/your-key</span> at the start
          of a line. Personal replies are visible only to you; shared replies
          are visible to all techs.
        </p>
      </header>

      <CannedRepliesList replies={replies} isAdmin={isAdmin} />
    </div>
  )
}
