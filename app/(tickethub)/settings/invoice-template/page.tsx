import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { getInvoiceTemplateConfig } from '@/app/lib/actions/invoice-template'
import { InvoiceBuilder } from './InvoiceBuilder'

export const dynamic = 'force-dynamic'

export default async function InvoiceTemplatePage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Invoice Template</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to customize the invoice template.
        </p>
      </div>
    )
  }

  const { config, logoUrl } = await getInvoiceTemplateConfig()

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
          Invoice Template
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Customize the invoice PDF layout. Drag sections to reorder, toggle
          fields on or off, and set your brand colors and logo.
        </p>
      </header>

      <InvoiceBuilder initialConfig={config} initialLogoUrl={logoUrl} />
    </div>
  )
}
