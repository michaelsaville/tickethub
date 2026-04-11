import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { NewClientForm } from './NewClientForm'

export default async function NewClientPage() {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/clients"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Back to clients
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">New Client</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          A Global Contract is created automatically so you can start logging
          work immediately.
        </p>
      </header>

      <NewClientForm />
    </div>
  )
}
