import Link from 'next/link'

export default function ClientNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-mono text-2xl text-slate-100">Client not found</h1>
      <p className="text-sm text-th-text-secondary">
        The client you are looking for does not exist or may have been removed.
      </p>
      <Link href="/clients" className="th-btn-primary">
        ← Back to clients
      </Link>
    </div>
  )
}
