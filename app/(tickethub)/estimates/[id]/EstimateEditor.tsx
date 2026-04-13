'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents } from '@/app/lib/billing'
import { rateForState, computeTax } from '@/app/lib/tax'

type CatalogItem = { id: string; name: string; type: string; defaultPrice: number; taxable: boolean }

type LineItem = {
  itemId: string
  name: string
  type: string
  description: string
  quantity: number
  unitPrice: number
  taxable: boolean
}

type EstimateData = {
  id: string
  estimateNumber: number
  title: string
  description: string | null
  notes: string | null
  validUntil: string | null
  status: string
  client: { id: string; name: string; billingState: string | null }
  items: Array<{
    id: string
    itemId: string
    description: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
    sortOrder: number
    item: { id: string; name: string; type: string }
  }>
}

export default function EstimateEditor({
  estimate,
  catalogItems,
}: {
  estimate: EstimateData
  catalogItems: CatalogItem[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState(estimate.title)
  const [description, setDescription] = useState(estimate.description || '')
  const [notes, setNotes] = useState(estimate.notes || '')
  const [validUntil, setValidUntil] = useState(
    estimate.validUntil ? new Date(estimate.validUntil).toISOString().split('T')[0] : ''
  )
  const [lines, setLines] = useState<LineItem[]>(
    estimate.items.map(i => {
      const catalog = catalogItems.find(c => c.id === i.itemId)
      return {
        itemId: i.itemId,
        name: i.item.name,
        type: i.item.type,
        description: i.description || '',
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxable: catalog?.taxable ?? false,
      }
    })
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [addItemId, setAddItemId] = useState('')

  function addLine() {
    const item = catalogItems.find(i => i.id === addItemId)
    if (!item) return
    setLines(prev => [...prev, {
      itemId: item.id,
      name: item.name,
      type: item.type,
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
  const taxRate = rateForState(estimate.client.billingState)
  const taxAmount = computeTax(taxableSubtotal, taxRate)
  const totalAmount = subtotal + taxAmount

  async function save() {
    if (!title.trim()) { setError('Title is required'); return }
    if (lines.length === 0) { setError('Add at least one line item'); return }
    setSaving(true)
    setError('')

    const res = await fetch(`/api/estimates/${estimate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        notes: notes.trim() || null,
        validUntil: validUntil || null,
        items: lines.map((l, i) => ({
          itemId: l.itemId,
          description: l.description.trim() || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    })

    if (res.ok) {
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }))
      setError(err.error || 'Failed to save')
    }
    setSaving(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main form */}
      <div className="lg:col-span-2 space-y-4">
        <div className="th-card p-4 space-y-3">
          <div>
            <label className="text-xs text-th-secondary block mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="th-input w-full" />
          </div>
          <div>
            <label className="text-xs text-th-secondary block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="th-input w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-th-secondary uppercase tracking-wider mb-1">Client</div>
              <div className="font-medium text-sm">{estimate.client.name}</div>
            </div>
            <div>
              <label className="text-xs text-th-secondary block mb-1">Valid Until</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="th-input w-full" />
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

        {/* Notes */}
        <div className="th-card p-4">
          <label className="text-xs text-th-secondary uppercase tracking-wider mb-2 block font-medium">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Payment terms, scope notes..." className="th-input w-full" />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="th-card p-4">
          <div className="text-xs text-th-secondary uppercase tracking-wider mb-3 font-medium">Totals</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-th-secondary">Subtotal</span><span className="font-mono">{formatCents(subtotal)}</span></div>
            {taxableSubtotal > 0 && (
              <div className="flex justify-between"><span className="text-th-secondary">Taxable</span><span className="font-mono text-th-secondary">{formatCents(taxableSubtotal)}</span></div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between"><span className="text-th-secondary">Tax ({estimate.client.billingState} {(taxRate / 100).toFixed(2)}%)</span><span className="font-mono">{formatCents(taxAmount)}</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-th-border text-lg font-bold">
              <span>Total</span>
              <span className="font-mono">{formatCents(totalAmount)}</span>
            </div>
          </div>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button onClick={save} disabled={saving || !title.trim() || lines.length === 0} className="th-btn-primary w-full py-3 rounded-lg font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
