import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { VaultPrefForm } from './VaultPrefForm'

export const dynamic = 'force-dynamic'

export default async function VaultSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const user = await prisma.tH_User.findUnique({
    where: { id: session!.user.id },
    select: { showVaultLink: true },
  })
  if (!user) redirect('/api/auth/signin')

  const dochubUrl = process.env.NEXT_PUBLIC_DOCHUB_URL || 'https://dochub.pcc2k.com'

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link href="/settings" className="text-xs text-th-text-secondary hover:text-accent">
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Password Vault Shortcut</h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          The vault itself lives in DocHub — passkey-protected, with your encrypted credentials and
          live TOTP codes. TicketHub can show a quick link to it in the sidebar. Turn it off if you
          don't want the shortcut.
        </p>
      </header>

      <VaultPrefForm initialShowVaultLink={user.showVaultLink} dochubUrl={dochubUrl} />
    </div>
  )
}
