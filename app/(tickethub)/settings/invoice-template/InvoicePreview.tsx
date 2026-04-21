'use client'

import type { InvoiceTemplateConfig } from '@/app/types/invoice-template'

/** Mock data for the live preview */
const MOCK = {
  orgName: 'PCC2K',
  tagline: 'Professional Computer Consultants',
  address: '123 Main St',
  cityStateZip: 'Morgantown, WV 26505',
  phone: '(304) 555-0199',
  email: 'billing@pcc2k.com',
  website: 'pcc2k.com',
  invoiceNumber: 1042,
  issueDate: 'Apr 10, 2026',
  dueDate: 'May 10, 2026',
  status: 'SENT',
  clientName: 'Acme Corporation',
  billingState: 'WV',
  lineItems: [
    {
      name: 'On-Site Support',
      description: 'Network troubleshooting and switch config',
      ticket: '#1038 · Network outage at main office',
      time: '2h 30m',
      rate: '$95.00',
      amount: '$237.50',
    },
    {
      name: 'Remote Support',
      description: 'Email migration assistance',
      ticket: '#1039 · M365 migration',
      time: '1h 15m',
      rate: '$75.00',
      amount: '$93.75',
    },
    {
      name: 'Cat6 Cable (per ft)',
      description: null,
      ticket: '#1038 · Network outage at main office',
      time: '50',
      rate: '$0.75',
      amount: '$37.50',
    },
  ],
  subtotal: '$368.75',
  taxablePortion: '$331.25',
  taxRate: '6.00%',
  taxState: 'WV',
  salesTax: '$19.88',
  grandTotal: '$388.63',
  notes: 'Payment due within 30 days. Thank you for your business!',
}

function getField(
  config: InvoiceTemplateConfig,
  sectionId: string,
  fieldKey: string,
): boolean {
  const section = config.sections.find((s) => s.id === sectionId)
  if (!section || !section.enabled) return false
  return section.fields[fieldKey] !== false
}

function isSectionEnabled(
  config: InvoiceTemplateConfig,
  sectionId: string,
): boolean {
  const section = config.sections.find((s) => s.id === sectionId)
  return section?.enabled ?? false
}

export function InvoicePreview({
  config,
  logoUrl,
}: {
  config: InvoiceTemplateConfig
  logoUrl: string | null
}) {
  const { primaryColor, fontFamily } = config.globalStyles

  const fontFamilyCSS =
    fontFamily === 'Helvetica'
      ? 'Helvetica, Arial, sans-serif'
      : fontFamily === 'Times-Roman'
        ? '"Times New Roman", Times, serif'
        : '"Courier New", Courier, monospace'

  const sortedSections = [...config.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  return (
    <div
      className="mx-auto bg-white shadow-lg"
      style={{
        width: '100%',
        maxWidth: 520,
        aspectRatio: config.globalStyles.pageSize === 'LETTER' ? '8.5/11' : '210/297',
        padding: '28px',
        fontFamily: fontFamilyCSS,
        fontSize: '9px',
        color: '#111',
        overflow: 'hidden',
      }}
    >
      {sortedSections.map((section) => {
        if (!section.enabled) return null
        switch (section.id) {
          case 'header':
            return <HeaderSection key="header" config={config} logoUrl={logoUrl} primaryColor={primaryColor} />
          case 'billTo':
            return <BillToSection key="billTo" config={config} />
          case 'lineItems':
            return <LineItemsSection key="lineItems" config={config} primaryColor={primaryColor} />
          case 'totals':
            return <TotalsSection key="totals" config={config} />
          case 'notes':
            return <NotesSection key="notes" primaryColor={primaryColor} />
          case 'footer':
            return <FooterSection key="footer" config={config} />
          default:
            return null
        }
      })}
    </div>
  )
}

function HeaderSection({
  config,
  logoUrl,
  primaryColor,
}: {
  config: InvoiceTemplateConfig
  logoUrl: string | null
  primaryColor: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '16px',
        paddingBottom: '10px',
        borderBottom: `2px solid ${primaryColor}`,
      }}
    >
      <div style={{ maxWidth: '55%' }}>
        {logoUrl && getField(config, 'header', 'logo') && (
          <img
            src={logoUrl}
            alt="Logo"
            style={{ maxHeight: '36px', maxWidth: '120px', marginBottom: '4px' }}
          />
        )}
        {getField(config, 'header', 'orgName') && (
          <div
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: primaryColor,
            }}
          >
            {MOCK.orgName}
          </div>
        )}
        {getField(config, 'header', 'tagline') && (
          <div style={{ fontSize: '7px', color: '#666', marginTop: '1px' }}>
            {MOCK.tagline}
          </div>
        )}
        {getField(config, 'header', 'address') && (
          <>
            <div style={{ fontSize: '7px', color: '#333', marginTop: '1px' }}>
              {MOCK.address}
            </div>
            <div style={{ fontSize: '7px', color: '#333' }}>
              {MOCK.cityStateZip}
            </div>
          </>
        )}
        {getField(config, 'header', 'phone') && (
          <div style={{ fontSize: '7px', color: '#333' }}>{MOCK.phone}</div>
        )}
        {getField(config, 'header', 'email') && (
          <div style={{ fontSize: '7px', color: '#333' }}>{MOCK.email}</div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        {getField(config, 'header', 'invoiceNumber') && (
          <>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                letterSpacing: '1.5px',
              }}
            >
              INVOICE
            </div>
            <div
              style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '2px' }}
            >
              #{MOCK.invoiceNumber}
            </div>
          </>
        )}
        {getField(config, 'header', 'dates') && (
          <>
            <div style={{ fontSize: '7px', color: '#555', marginTop: '2px' }}>
              Issued {MOCK.issueDate}
            </div>
            <div style={{ fontSize: '7px', color: '#555' }}>
              Due {MOCK.dueDate}
            </div>
          </>
        )}
        {getField(config, 'header', 'status') && (
          <div style={{ fontSize: '7px', color: '#555' }}>
            Status: {MOCK.status}
          </div>
        )}
      </div>
    </div>
  )
}

function BillToSection({ config }: { config: InvoiceTemplateConfig }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          fontSize: '6px',
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '2px',
        }}
      >
        Bill To
      </div>
      {getField(config, 'billTo', 'clientName') && (
        <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
          {MOCK.clientName}
        </div>
      )}
      {getField(config, 'billTo', 'billingState') && (
        <div style={{ fontSize: '7px', color: '#333' }}>
          Tax State: {MOCK.billingState}
        </div>
      )}
    </div>
  )
}

function LineItemsSection({
  config,
  primaryColor,
}: {
  config: InvoiceTemplateConfig
  primaryColor: string
}) {
  const showDesc = getField(config, 'lineItems', 'description')
  const showQty = getField(config, 'lineItems', 'quantity')
  const showRate = getField(config, 'lineItems', 'rate')
  const showAmount = getField(config, 'lineItems', 'amount')
  const showTicket = getField(config, 'lineItems', 'ticketRef')

  return (
    <div
      style={{
        marginTop: '6px',
        borderTop: '1px solid #ddd',
        borderBottom: '1px solid #ddd',
      }}
    >
      <div
        style={{
          display: 'flex',
          backgroundColor: '#f5f5f5',
          padding: '4px 3px',
          borderBottom: '1px solid #ddd',
          fontSize: '6px',
          fontWeight: 'bold',
          color: '#444',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}
      >
        {showDesc && <div style={{ flex: 1 }}>Description</div>}
        {showQty && (
          <div style={{ width: '42px', textAlign: 'right' }}>Qty / Time</div>
        )}
        {showRate && (
          <div style={{ width: '48px', textAlign: 'right' }}>Rate</div>
        )}
        {showAmount && (
          <div style={{ width: '54px', textAlign: 'right' }}>Amount</div>
        )}
      </div>
      {MOCK.lineItems.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            padding: '4px 3px',
            borderBottom: '0.5px solid #eee',
            fontSize: '7px',
          }}
        >
          {showDesc && (
            <div style={{ flex: 1 }}>
              <div>{line.name}</div>
              {line.description && (
                <div style={{ color: '#666', marginTop: '1px', fontSize: '6px' }}>
                  {line.description}
                </div>
              )}
              {showTicket && line.ticket && (
                <div style={{ color: '#888', marginTop: '1px', fontSize: '6px' }}>
                  {line.ticket}
                </div>
              )}
            </div>
          )}
          {showQty && (
            <div style={{ width: '42px', textAlign: 'right' }}>{line.time}</div>
          )}
          {showRate && (
            <div style={{ width: '48px', textAlign: 'right' }}>{line.rate}</div>
          )}
          {showAmount && (
            <div style={{ width: '54px', textAlign: 'right' }}>
              {line.amount}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TotalsSection({ config }: { config: InvoiceTemplateConfig }) {
  return (
    <div style={{ marginTop: '10px', marginLeft: 'auto', width: '180px' }}>
      {getField(config, 'totals', 'subtotal') && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '2px 0',
            fontSize: '7px',
          }}
        >
          <span style={{ color: '#555' }}>Subtotal</span>
          <span>{MOCK.subtotal}</span>
        </div>
      )}
      {getField(config, 'totals', 'taxablePortion') && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '2px 0',
            fontSize: '7px',
          }}
        >
          <span style={{ color: '#555' }}>
            Taxable ({MOCK.taxRate} {MOCK.taxState})
          </span>
          <span>{MOCK.taxablePortion}</span>
        </div>
      )}
      {getField(config, 'totals', 'salesTax') && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '2px 0',
            fontSize: '7px',
          }}
        >
          <span style={{ color: '#555' }}>Sales Tax</span>
          <span>{MOCK.salesTax}</span>
        </div>
      )}
      {getField(config, 'totals', 'grandTotal') && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '5px',
            marginTop: '3px',
            borderTop: '2px solid #111',
          }}
        >
          <span style={{ fontSize: '9px', fontWeight: 'bold' }}>TOTAL DUE</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>
            {MOCK.grandTotal}
          </span>
        </div>
      )}
    </div>
  )
}

function NotesSection({ primaryColor }: { primaryColor: string }) {
  return (
    <div
      style={{
        marginTop: '16px',
        padding: '7px',
        borderLeft: `3px solid ${primaryColor}`,
        backgroundColor: `${primaryColor}15`,
      }}
    >
      <div
        style={{
          fontSize: '6px',
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '2px',
        }}
      >
        Notes
      </div>
      <div style={{ fontSize: '7px', color: '#333' }}>{MOCK.notes}</div>
    </div>
  )
}

function FooterSection({ config }: { config: InvoiceTemplateConfig }) {
  const parts: string[] = []
  if (getField(config, 'footer', 'orgName')) parts.push(MOCK.orgName)
  if (getField(config, 'footer', 'website')) parts.push(MOCK.website)
  if (getField(config, 'footer', 'email'))
    parts.push(`Questions? ${MOCK.email}`)

  if (parts.length === 0) return null

  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: '6px',
        borderTop: '1px solid #eee',
        textAlign: 'center',
        fontSize: '6px',
        color: '#888',
      }}
    >
      {parts.join(' · ')}
    </div>
  )
}
