import Link from 'next/link'

export default function InvoiceNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-mono text-2xl text-slate-100">Invoice not found</h1>
      <Link href="/invoices" className="th-btn-primary">
        ← Back to invoices
      </Link>
    </div>
  )
}
