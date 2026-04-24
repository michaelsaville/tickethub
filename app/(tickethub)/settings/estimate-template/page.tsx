import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { getInvoiceTemplateConfig } from '@/app/lib/actions/invoice-template'
import { getEstimateTemplateConfig } from '@/app/lib/actions/estimate-template'
import { EstimateBuilder } from './EstimateBuilder'

export const dynamic = 'force-dynamic'

export default async function EstimateTemplatePage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Estimate Template</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to customize the estimate template.
        </p>
      </div>
    )
  }

  const [{ config }, { logoUrl }] = await Promise.all([
    getEstimateTemplateConfig(),
    getInvoiceTemplateConfig(),
  ])

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
          Estimate Template
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Customize the estimate PDF layout. Drag sections to reorder, toggle
          fields on or off, and set your brand colors. The logo is shared with
          the invoice template.
        </p>
      </header>

      <EstimateBuilder initialConfig={config} logoUrl={logoUrl} />
    </div>
  )
}
