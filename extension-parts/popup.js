// TicketHub Parts Scraper — Popup Script

let product = null
let baseUrl = ''

// ─── Init ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.sync.get(['tickethubUrl'])
  baseUrl = stored.tickethubUrl || ''

  if (!baseUrl) {
    showView('setup-view')
    document.getElementById('save-url-btn').addEventListener('click', saveUrl)
    return
  }

  // Try to scrape from the active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url?.match(/amazon\.com/)) {
      showView('no-product-view')
      return
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PRODUCT' })
    if (!response || !response.title) {
      showView('no-product-view')
      return
    }

    product = response
    renderProduct()
    await loadTickets()
    showView('main-view')
  } catch (e) {
    showView('no-product-view')
  }
})

// ─── Setup ───────────────────────────────────────────────────────────────

async function saveUrl() {
  const input = document.getElementById('base-url')
  const url = input.value.trim().replace(/\/$/, '')
  if (!url) return

  await chrome.storage.sync.set({ tickethubUrl: url })
  baseUrl = url

  // Reload popup
  window.location.reload()
}

// ─── Render ──────────────────────────────────────────────────────────────

function renderProduct() {
  if (!product) return

  document.getElementById('product-img').src = product.imageUrl || ''
  document.getElementById('product-title').textContent = product.title
  document.getElementById('product-meta').textContent =
    `ASIN: ${product.asin || '?'}  ·  ${product.vendor}`
  document.getElementById('product-price').textContent = formatCents(product.priceCents)

  updateClientPrice()

  // Wire up markup/qty changes
  document.getElementById('markup').addEventListener('input', updateClientPrice)
  document.getElementById('qty').addEventListener('input', updateClientPrice)
  document.getElementById('add-btn').addEventListener('click', addPart)
}

function updateClientPrice() {
  const markup = parseFloat(document.getElementById('markup').value) || 0
  const qty = parseInt(document.getElementById('qty').value) || 1
  const unitClient = Math.round(product.priceCents * (1 + markup / 100))
  document.getElementById('client-price').value = formatCents(unitClient * qty)
}

function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2)
}

// ─── Load tickets ────────────────────────────────────────────────────────

async function loadTickets() {
  const select = document.getElementById('ticket-select')
  try {
    const res = await fetch(`${baseUrl}/api/tickets?status=open&limit=50`, {
      credentials: 'include',
    })
    if (!res.ok) {
      select.innerHTML = '<option value="">Failed to load — check login</option>'
      return
    }
    const json = await res.json()
    const tickets = json.data ?? json ?? []

    select.innerHTML = '<option value="">Select a ticket...</option>'
    for (const t of tickets) {
      const opt = document.createElement('option')
      opt.value = t.id
      const clientName = t.client?.shortCode || t.client?.name || ''
      opt.textContent = `#${t.ticketNumber} ${clientName} — ${t.title}`
      select.appendChild(opt)
    }
  } catch (e) {
    select.innerHTML = '<option value="">Error loading tickets</option>'
  }
}

// ─── Add part ────────────────────────────────────────────────────────────

async function addPart() {
  const ticketId = document.getElementById('ticket-select').value
  if (!ticketId) {
    setStatus('Select a ticket first', 'err')
    return
  }
  if (!product) return

  const qty = parseInt(document.getElementById('qty').value) || 1
  const markup = parseFloat(document.getElementById('markup').value) || 0
  const unitCost = product.priceCents
  const unitPrice = Math.round(unitCost * (1 + markup / 100))

  const btn = document.getElementById('add-btn')
  btn.disabled = true
  btn.textContent = 'Adding...'

  try {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketId}/parts`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: product.title,
        asin: product.asin,
        vendor: product.vendor,
        vendorUrl: product.productUrl,
        imageUrl: product.imageUrl,
        quantity: qty,
        unitCost,
        unitPrice,
      }),
    })

    if (res.ok) {
      setStatus('Part added to ticket!', 'ok')
      btn.textContent = 'Added ✓'
    } else {
      const err = await res.json().catch(() => ({}))
      setStatus(err.error || `Failed (${res.status})`, 'err')
      btn.disabled = false
      btn.textContent = 'Add Part to Ticket'
    }
  } catch (e) {
    setStatus('Network error — are you logged into TicketHub?', 'err')
    btn.disabled = false
    btn.textContent = 'Add Part to Ticket'
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function showView(id) {
  for (const v of ['setup-view', 'no-product-view', 'main-view']) {
    document.getElementById(v).style.display = v === id ? 'block' : 'none'
  }
}

function setStatus(msg, type) {
  const el = document.getElementById('status')
  el.textContent = msg
  el.className = 'status ' + (type || '')
}
