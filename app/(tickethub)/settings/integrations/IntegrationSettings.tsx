'use client'

import { useState, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────

interface SettingStatus {
  key: string
  source: 'db' | 'env' | 'none'
  maskedValue: string
}

interface IntegrationGroup {
  name: string
  description: string
  keys: { key: string; label: string }[]
  webhookUrl?: string
  oauthUrl?: string
  oauthLabel?: string
}

// ─── Integration groups ─────────────────────────────────────────────────

function getGroups(baseUrl: string): IntegrationGroup[] {
  return [
    {
      name: 'AI (Anthropic)',
      description: 'Claude AI for ticket classification, smart search, and resolution suggestions',
      keys: [{ key: 'ANTHROPIC_API_KEY', label: 'API Key' }],
    },
    {
      name: 'ConnectWise RMM',
      description: 'Auto-create tickets from RMM alert webhooks',
      keys: [
        { key: 'CONNECTWISE_RMM_API_KEY', label: 'API Key' },
        { key: 'CONNECTWISE_RMM_BASE_URL', label: 'Base URL' },
        { key: 'CONNECTWISE_RMM_COMPANY_ID', label: 'Company ID' },
        { key: 'CONNECTWISE_RMM_WEBHOOK_SECRET', label: 'Webhook Secret' },
      ],
      webhookUrl: `${baseUrl}/api/webhooks/connectwise-rmm`,
    },
    {
      name: 'QuickBooks Online',
      description: 'Accounting sync for invoices and payments',
      keys: [
        { key: 'QBO_CLIENT_ID', label: 'Client ID' },
        { key: 'QBO_CLIENT_SECRET', label: 'Client Secret' },
      ],
      oauthUrl: '/api/qbo/authorize',
      oauthLabel: 'Connect QuickBooks',
    },
    {
      name: 'Amazon PA-API',
      description: 'Parts procurement and pricing lookup',
      keys: [
        { key: 'AMAZON_ACCESS_KEY', label: 'Access Key' },
        { key: 'AMAZON_SECRET_KEY', label: 'Secret Key' },
        { key: 'AMAZON_PARTNER_TAG', label: 'Partner Tag' },
      ],
    },
    {
      name: 'Notifications',
      description: 'Pushover for critical/high-priority push notifications',
      keys: [{ key: 'PUSHOVER_APP_TOKEN', label: 'Pushover App Token' }],
    },
  ]
}

// ─── Component ──────────────────────────────────────────────────────────

interface Props {
  initialStatuses: SettingStatus[]
  baseUrl: string
}

export default function IntegrationSettings({ initialStatuses, baseUrl }: Props) {
  const [statuses, setStatuses] = useState<SettingStatus[]>(initialStatuses)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ key: string; msg: string; ok: boolean } | null>(null)

  const groups = getGroups(baseUrl)

  const statusMap = new Map(statuses.map((s) => [s.key, s]))

  const refreshStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/integrations')
      if (res.ok) {
        const data = await res.json()
        setStatuses(data)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSave = async (key: string) => {
    if (!editValue.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/settings/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValue }),
      })
      if (res.ok) {
        setFeedback({ key, msg: 'Saved', ok: true })
        setEditingKey(null)
        setEditValue('')
        await refreshStatuses()
      } else {
        const data = await res.json()
        setFeedback({ key, msg: data.error ?? 'Failed to save', ok: false })
      }
    } catch {
      setFeedback({ key, msg: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (key: string) => {
    if (!confirm(`Clear the stored value for ${key}? This will fall back to the environment variable if one is set.`)) {
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/settings/integrations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (res.ok) {
        setFeedback({ key, msg: 'Cleared', ok: true })
        await refreshStatuses()
      } else {
        const data = await res.json()
        setFeedback({ key, msg: data.error ?? 'Failed to clear', ok: false })
      }
    } catch {
      setFeedback({ key, msg: 'Network error', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        // Determine if the group has all required keys set
        const allSet = group.keys.every((k) => {
          const s = statusMap.get(k.key)
          return s && s.source !== 'none'
        })

        return (
          <div
            key={group.name}
            className="rounded-lg border border-th-border bg-th-surface"
          >
            {/* Group header */}
            <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-slate-100">
                    {group.name}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                      allSet
                        ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20'
                    }`}
                  >
                    {allSet ? 'Configured' : 'Incomplete'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-th-text-secondary">
                  {group.description}
                </p>
              </div>

              {group.oauthUrl && (
                <a
                  href={group.oauthUrl}
                  className="th-btn-primary px-3 py-1.5 text-xs"
                >
                  {group.oauthLabel}
                </a>
              )}
            </div>

            {/* Keys */}
            <div className="divide-y divide-th-border">
              {group.keys.map(({ key, label }) => {
                const status = statusMap.get(key)
                const isSet = status && status.source !== 'none'
                const isEditing = editingKey === key
                const fb = feedback?.key === key ? feedback : null

                return (
                  <div key={key} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Status indicator */}
                        <span
                          className={`flex-shrink-0 h-2 w-2 rounded-full ${
                            isSet ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-200">
                            {label}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <code className="text-[11px] text-th-text-muted font-mono">
                              {key}
                            </code>
                            {status?.source === 'db' && (
                              <span className="text-[10px] text-blue-400 font-mono">
                                (database)
                              </span>
                            )}
                            {status?.source === 'env' && (
                              <span className="text-[10px] text-amber-400 font-mono">
                                (env var)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isEditing && (
                          <>
                            <span className="text-xs text-th-text-muted font-mono">
                              {status?.maskedValue ?? 'Not set'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingKey(key)
                                setEditValue('')
                                setFeedback(null)
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {isSet ? 'Edit' : 'Set'}
                            </button>
                            {status?.source === 'db' && (
                              <button
                                onClick={() => handleDelete(key)}
                                disabled={saving}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                              >
                                Clear
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Edit mode */}
                    {isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="password"
                          className="th-input flex-1 text-xs py-1.5"
                          placeholder={`Enter ${label}...`}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(key)
                            if (e.key === 'Escape') handleCancel()
                          }}
                        />
                        <button
                          onClick={() => handleSave(key)}
                          disabled={saving || !editValue.trim()}
                          className="th-btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-3 py-1.5 text-xs text-th-text-secondary hover:text-slate-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Feedback */}
                    {fb && (
                      <div
                        className={`mt-1 text-[11px] ${
                          fb.ok ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {fb.msg}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Webhook URL */}
            {group.webhookUrl && (
              <div className="border-t border-th-border px-4 py-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Webhook URL
                </div>
                <code className="mt-0.5 block break-all rounded bg-th-elevated px-2 py-1 text-[11px] text-slate-300">
                  {group.webhookUrl}
                </code>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
