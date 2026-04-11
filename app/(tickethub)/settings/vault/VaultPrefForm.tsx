'use client'

import { useState, useTransition } from 'react'
import { updateVaultPref, type VaultPrefResult } from '@/app/lib/actions/vault-pref'

export function VaultPrefForm({
  initialShowVaultLink,
  dochubUrl,
}: {
  initialShowVaultLink: boolean
  dochubUrl: string
}) {
  const [enabled, setEnabled] = useState(initialShowVaultLink)
  const [result, setResult] = useState<VaultPrefResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(next: boolean) {
    setEnabled(next)
    const fd = new FormData()
    if (next) fd.set('showVaultLink', 'on')
    startTransition(async () => {
      const r = await updateVaultPref(fd)
      setResult(r)
      if (!r.ok) setEnabled(!next)
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border border-th-border bg-th-surface p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-100">
              Show vault shortcut in sidebar
            </div>
            <div className="mt-1 text-xs text-th-text-secondary">
              Adds a "Password Vault" link under Knowledge Base / Schedule that opens
              the DocHub personal vault in a new tab. The vault is the same one you
              already use in DocHub — this is just a shortcut.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={isPending}
            onClick={() => save(!enabled)}
            className={
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ' +
              (enabled ? 'bg-accent' : 'bg-th-elevated') +
              (isPending ? ' opacity-60' : '')
            }
          >
            <span
              className={
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ' +
                (enabled ? 'translate-x-5' : 'translate-x-0')
              }
            />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-th-border bg-th-surface p-5 text-xs text-th-text-secondary">
        Vault location:{' '}
        <a
          href={`${dochubUrl}/settings?section=my-vault`}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          {dochubUrl}/settings?section=my-vault
        </a>
      </div>

      {result && !result.ok && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {result.error}
        </div>
      )}
      {result && result.ok && (
        <div className="text-xs text-th-text-muted">Saved.</div>
      )}
    </div>
  )
}
