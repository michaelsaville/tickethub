'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ClientWithContacts = {
  id: string
  name: string
  shortCode: string | null
  contacts: Array<{
    id: string
    firstName: string
    lastName: string
    email: string | null
  }>
}

export function NewReminderForm({
  clients,
}: {
  clients: ClientWithContacts[]
}) {
  const router = useRouter()
  const [clientId, setClientId] = useState('')
  const [contactId, setContactId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [actionUrl, setActionUrl] = useState('')
  const [recurrence, setRecurrence] = useState('EVERY_3_DAYS')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedClient = clients.find((c) => c.id === clientId)
  const contacts = selectedClient?.contacts ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contactId || !title.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          title: title.trim(),
          body: body.trim() || undefined,
          actionUrl: actionUrl.trim() || undefined,
          recurrence,
        }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        router.push('/reminders')
      }
    } catch {
      setError('Failed to create reminder')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="th-card max-w-lg space-y-4">
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Client *
        </label>
        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value)
            setContactId('')
          }}
          required
          className="th-input"
        >
          <option value="" disabled>
            Select a client...
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.shortCode ? ` (${c.shortCode})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Contact *
        </label>
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          required
          disabled={!clientId}
          className="th-input"
        >
          <option value="" disabled>
            {clientId ? 'Select a contact...' : 'Select a client first'}
          </option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
              {c.email ? ` (${c.email})` : ' — no email'}
            </option>
          ))}
        </select>
        {contactId && contacts.find((c) => c.id === contactId && !c.email) && (
          <p className="mt-1 text-xs text-priority-urgent">
            This contact has no email address. Reminders won't be delivered.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="th-input"
          placeholder="e.g., Approve server upgrade estimate"
        />
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Details
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="th-input resize-y"
          placeholder="Additional context or instructions..."
        />
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Action URL
        </label>
        <input
          type="url"
          value={actionUrl}
          onChange={(e) => setActionUrl(e.target.value)}
          className="th-input"
          placeholder="https://..."
        />
        <p className="mt-1 text-xs text-th-text-muted">
          Link to the item needing attention (estimate, document, etc.)
        </p>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Reminder Frequency
        </label>
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
          className="th-input"
        >
          <option value="ONCE">Once (send once, then mark done)</option>
          <option value="DAILY">Daily</option>
          <option value="EVERY_3_DAYS">Every 3 days</option>
          <option value="WEEKLY">Weekly</option>
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !contactId || !title.trim()}
          className="th-btn-primary disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Reminder'}
        </button>
        <a href="/reminders" className="th-btn-ghost">
          Cancel
        </a>
      </div>
    </form>
  )
}
