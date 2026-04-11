import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { UsersList } from './UsersList'

export const dynamic = 'force-dynamic'

export default async function UsersSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Users</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to manage users.
        </p>
      </div>
    )
  }

  const users = await prisma.tH_User.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      hourlyRate: true,
      isActive: true,
      createdAt: true,
    },
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
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Users</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {users.length} {users.length === 1 ? 'user' : 'users'}. New sign-ins
          are auto-provisioned as <span className="font-mono">TECH</span>.
        </p>
      </header>

      <UsersList users={users} currentUserId={session!.user.id} />
    </div>
  )
}
