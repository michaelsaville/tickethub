'use client'

import { useCallback, useEffect, useState } from 'react'

type Scope = 'customers' | 'contacts' | 'sites' | 'tickets' | 'all'

interface MigrationResult {
  imported: number
  skipped: number
  errors: string[]
}

interface Stats {
  clients: number
  contacts: number
  sites: number
  tickets: number
}

export function SyncroMigratePanel() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [configured, setConfigured] = useState(true)
  const [running, setRunning] = useState<Scope | null>(null)
  const [results, setResults] = useState<Record<string, MigrationResult>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/syncro-migrate')
      if (!res.ok) return
      const data = await res.json()
      setStats(data.stats)
      setConfigured(data.configured)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  async function runMigration(scope: Scope) {
    setRunning(scope)
    setError(null)
    setResults({})

    try {
      const res = await fetch('/api/admin/syncro-migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Migration failed')
        return
      }

      // Extract results from response
      const newResults: Record<string, MigrationResult> = {}
      for (const key of ['customers', 'contacts', 'sites', 'tickets']) {
        if (data[key]) newResults[key] = data[key]
      }
      setResults(newResults)

      // Refresh stats
      await fetchStats()
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setRunning(null)
    }
  }

  const SCOPES: { scope: Scope; label: string }[] = [
    { scope: 'customers', label: 'Import Customers' },
    { scope: 'contacts', label: 'Import Contacts' },
    { scope: 'sites', label: 'Import Sites' },
    { scope: 'tickets', label: 'Import Tickets' },
    { scope: 'all', label: 'Import All' },
  ]

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="rounded-lg border border-yellow-600/40 bg-yellow-900/20 px-4 py-3">
        <p className="text-sm text-yellow-200">
          This is a one-way import. Syncro remains the source of truth until
          migration is complete.
        </p>
      </div>

      {!configured && (
        <div className="rounded-lg border border-red-600/40 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-200">
            Syncro is not configured. Set SYNCRO_API_KEY and SYNCRO_SUBDOMAIN
            environment variables.
          </p>
        </div>
      )}

      {/* Current stats */}
      <div className="th-card p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-th-text-muted">
          Migration Status
        </h2>
        {stats ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBox label="Clients" value={stats.clients} />
            <StatBox label="Contacts" value={stats.contacts} />
            <StatBox label="Sites" value={stats.sites} />
            <StatBox label="Tickets" value={stats.tickets} />
          </div>
        ) : (
          <p className="text-sm text-th-text-secondary">Loading stats...</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="th-card p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-th-text-muted">
          Run Migration
        </h2>
        <div className="flex flex-wrap gap-3">
          {SCOPES.map(({ scope, label }) => (
            <button
              key={scope}
              onClick={() => runMigration(scope)}
              disabled={!!running || !configured}
              className={`th-btn-primary px-4 py-2 text-sm disabled:opacity-50 ${
                scope === 'all' ? 'ring-1 ring-accent/50' : ''
              }`}
            >
              {running === scope ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Running...
                </span>
              ) : (
                label
              )}
            </button>
          ))}
        </div>

        {running && (
          <p className="mt-3 text-sm text-th-text-secondary">
            Migration in progress. This may take a few minutes for large datasets.
            Do not close this page.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-600/40 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {/* Results */}
      {Object.keys(results).length > 0 && (
        <div className="th-card p-4">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-th-text-muted">
            Results
          </h2>
          <div className="space-y-3">
            {Object.entries(results).map(([key, r]) => (
              <div key={key}>
                <h3 className="text-sm font-medium capitalize text-slate-100">
                  {key}
                </h3>
                <p className="text-sm text-th-text-secondary">
                  <span className="text-green-400">{r.imported} imported</span>
                  {' / '}
                  <span className="text-th-text-muted">{r.skipped} skipped</span>
                  {r.errors.length > 0 && (
                    <>
                      {' / '}
                      <span className="text-red-400">
                        {r.errors.length} error{r.errors.length !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </p>
                {r.errors.length > 0 && (
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-red-300">
                    {r.errors.slice(0, 20).map((err, i) => (
                      <li key={i} className="truncate">
                        {err}
                      </li>
                    ))}
                    {r.errors.length > 20 && (
                      <li className="text-th-text-muted">
                        ...and {r.errors.length - 20} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="font-mono text-2xl text-slate-100">{value}</div>
      <div className="text-xs text-th-text-secondary">{label} imported</div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
