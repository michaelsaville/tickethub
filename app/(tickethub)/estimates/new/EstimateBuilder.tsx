'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents } from '@/app/lib/billing'

type CatalogItem = { id: string; name: string; type: string; defaultPrice: number; taxable: boolean }
type Contact = { id: string; firstName: string; lastName: string; email: string | null; isPrimary: boolean }
type Contract = { id: string; name: string; type: string; isGlobal: boolean }
type Client = { id: string; name: string; billingState: string | null }

type LineItem = {
  itemId: string
  name: string
  description: string
  quantity: number
  unitPrice: number
  taxable: boolean
}

export default function EstimateBuilder({
  client, contacts, contracts, catalogItems,
}: {
  client: Client
  contacts: Contact[]
  contracts: Contract[]
  catalogItems: CatalogItem[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contactId, setContactId] = useState(contacts.find(c => c.isPrimary)?.id || '')
  const [contractId, setContractId] = useState(contracts.find(c => c.isGlobal)?.id || '')
  const [validDays, setValidDays] = useState('30')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Add item picker
  const [addItemId, setAddItemId] = useState('')

  function addLine() {
    const item = catalogItems.find(i => i.id === addItemId)
    if (!item) return
    setLines(prev => [...prev, {
      itemId: item.id,
      name: item.name,
      description: '',
      quantity: 1,
      unitPrice: item.defaultPrice,
      taxable: item.taxable,
    }])
    setAddItemId('')
  }

  function updateLine(idx: number, field: string, value: any) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lines.reduce((s, l) => s + Math.round(l.unitPrice * l.quantity), 0)
  const taxableSubtotal = lines.filter(l => l.taxable).reduce((s, l) => s + Math.round(l.unitPrice * l.quantity), 0)

  async function submit() {
    if (!title.trim()) { setError('Title is required'); return }
    if (lines.length === 0) { setError('Add at least one line item'); return }
    setSaving(true)
    setError('')

    const validUntil = validDays ? new Date(Date.now() + parseInt(validDays) * 86400000).toISOString() : null

    const res = await fetch('/api/estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: client.id,
        contactId: contactId || null,
        contractId: contractId || null,
        title: title.trim(),
        description: description.trim() || null,
        validUntil,
        notes: notes.trim() || null,
        items: lines.map(l => ({
          itemId: l.itemId,
          description: l.description.trim() || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    })

    if (res.ok) {
      const data = await res.json()
      router.push(`/estimates/${data.id}`)
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }))
      setError(err.error || 'Failed to create estimate')
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main form */}
      <div className="lg:col-span-2 space-y-4">
        <div className="th-card p-4 space-y-3">
          <div>
            <label className="text-xs text-th-secondary block mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Server Replacement Proposal" className="th-input w-full" />
          </div>
          <div>
            <label className="text-xs text-th-secondary block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional summary..." className="th-input w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-th-secondary block mb-1">Contact</label>
              <select value={contactId} onChange={e => setContactId(e.target.value)} className="th-input w-full">
                <option value="">None</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.isPrimary ? ' (primary)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-th-secondary block mb-1">Contract</label>
              <select value={contractId} onChange={e => setContractId(e.target.value)} className="th-input w-full">
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="th-card p-4">
          <div className="text-xs text-th-secondary uppercase tracking-wider mb-3 font-medium">Line Items</div>

          {lines.length > 0 && (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-xs text-th-secondary uppercase">
                  <th className="pb-2 text-left">Item</th>
                  <th className="pb-2 text-left w-48">Description</th>
                  <th className="pb-2 text-right w-20">Qty</th>
                  <th className="pb-2 text-right w-28">Unit Price</th>
                  <th className="pb-2 text-right w-24">Total</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-th-border">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-sm">{l.name}</div>
                      <div className="text-xs text-th-muted">{l.taxable ? 'Taxable' : 'Tax-exempt'}</div>
                    </td>
                    <td className="py-2 pr-2">
                      <input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Optional note" className="th-input w-full text-xs" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0.01" step="0.01" value={l.quantity} onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)} className="th-input w-full text-right text-xs" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" step="0.01" value={(l.unitPrice / 100).toFixed(2)} onChange={e => updateLine(i, 'unitPrice', Math.round(parseFloat(e.target.value || '0') * 100))} className="th-input w-full text-right text-xs" />
                    </td>
                    <td className="py-2 text-right font-mono text-xs">{formatCents(Math.round(l.unitPrice * l.quantity))}</td>
                    <td className="py-2 text-center">
                      <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add item row */}
          <div className="flex gap-2">
            <select value={addItemId} onChange={e => setAddItemId(e.target.value)} className="th-input flex-1">
              <option value="">Select item to add...</option>
              {catalogItems.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.type}) — {formatCents(i.defaultPrice)}</option>
              ))}
            </select>
            <button onClick={addLine} disabled={!addItemId} className="th-btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar summary */}
      <div className="space-y-4">
        <div className="th-card p-4">
          <div className="text-xs text-th-secondary uppercase tracking-wider mb-3 font-medium">Summary</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-th-secondary">Subtotal</span><span className="font-mono">{formatCents(subtotal)}</span></div>
            {taxableSubtotal > 0 && (
              <div className="flex justify-between"><span className="text-th-secondary">Taxable</span><span className="font-mono text-th-secondary">{formatCents(taxableSubtotal)}</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-th-border text-base font-semibold">
              <span>Estimated Total</span>
              <span className="font-mono">{formatCents(subtotal)}</span>
            </div>
            <p className="text-xs text-th-muted">Tax calculated at send time based on client state ({client.billingState || 'not set'})</p>
          </div>
        </div>

        <div className="th-card p-4 space-y-3">
          <div>
            <label className="text-xs text-th-secondary block mb-1">Valid For (days)</label>
            <input type="number" value={validDays} onChange={e => setValidDays(e.target.value)} className="th-input w-full" />
          </div>
          <div>
            <label className="text-xs text-th-secondary block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Payment terms, scope notes..." className="th-input w-full" />
          </div>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button onClick={submit} disabled={saving || !title.trim() || lines.length === 0} className="th-btn-primary w-full py-3 rounded-lg font-medium disabled:opacity-50">
          {saving ? 'Creating...' : 'Create Estimate'}
        </button>
      </div>
    </div>
  )
}
