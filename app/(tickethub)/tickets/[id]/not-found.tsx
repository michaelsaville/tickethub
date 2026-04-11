import Link from 'next/link'

export default function TicketNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-mono text-2xl text-slate-100">Ticket not found</h1>
      <p className="text-sm text-th-text-secondary">
        This ticket does not exist or has been deleted.
      </p>
      <Link href="/tickets" className="th-btn-primary">
        ← Back to tickets
      </Link>
    </div>
  )
}
