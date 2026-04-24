'use client'

import type { EstimateTemplateConfig } from '@/app/types/estimate-template'

const MOCK = {
  orgName: 'Precision Computers',
  tagline: 'Precision Computers',
  address: 'PO Box 128',
  cityStateZip: 'Cumberland, MD 21502',
  phone: '(814) 322-6908',
  email: 'billing@pcc2k.com',
  website: 'https://pcc2k.com',
  estimateNumber: 214,
  date: 'Apr 23, 2026',
  validUntil: 'May 23, 2026',
  status: 'SENT',
  clientName: 'Acme Corporation',
  contactName: 'Jane Doe',
  title: 'Network refresh — main office',
  description: 'Replace core switch, add new WAP coverage in east wing, re-terminate four MDF drops.',
  lineItems: [
    { name: 'Cisco Catalyst 1300 (24-port)', description: 'Core replacement', qty: '1', rate: '$1,120.00', amount: '$1,120.00' },
    { name: 'UniFi U6-Pro', description: 'East wing coverage', qty: '3', rate: '$179.00', amount: '$537.00' },
    { name: 'On-site labor', description: null, qty: '6', rate: '$95.00', amount: '$570.00' },
  ],
  subtotal: '$2,227.00',
  salesTax: '$133.62',
  grandTotal: '$2,360.62',
  notes: 'Pricing valid for 30 days. 50% deposit required to schedule.',
}

function getField(
  config: EstimateTemplateConfig,
  sectionId: string,
  fieldKey: string,
): boolean {
  const section = config.sections.find((s) => s.id === sectionId)
  if (!section || !section.enabled) return false
  return section.fields[fieldKey] !== false
}

export function EstimatePreview({
  config,
  logoUrl,
}: {
  config: EstimateTemplateConfig
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
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {sortedSections.map((section) => {
        if (!section.enabled) return null
        switch (section.id) {
          case 'header':
            return <HeaderSection key="header" config={config} logoUrl={logoUrl} primaryColor={primaryColor} />
          case 'billTo':
            return <BillToSection key="billTo" config={config} />
          case 'titleDescription':
            return <TitleDescSection key="titleDescription" config={config} />
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
  config: EstimateTemplateConfig
  logoUrl: string | null
  primaryColor: string
}) {
  const showLogo = logoUrl && getField(config, 'header', 'logo')
  const showOrgName = getField(config, 'header', 'orgName')
  const showPhone = getField(config, 'header', 'phone')
  const showEmail = getField(config, 'header', 'email')
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
        {showLogo ? (
          <img
            src={logoUrl!}
            alt="Logo"
            style={{ maxHeight: '36px', maxWidth: '160px', marginBottom: '4px', objectFit: 'contain' }}
          />
        ) : (
          showOrgName && (
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: primaryColor }}>
              {MOCK.orgName}
            </div>
          )
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
        {(showPhone || showEmail) && (
          <div style={{ fontSize: '7px', color: '#333', marginTop: '1px' }}>
            {showPhone && MOCK.phone}
            {showPhone && showEmail && ' · '}
            {showEmail && MOCK.email}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        {getField(config, 'header', 'estimateNumber') && (
          <>
            <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '1.5px' }}>
              ESTIMATE
            </div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '2px' }}>
              #{MOCK.estimateNumber}
            </div>
          </>
        )}
        {getField(config, 'header', 'dates') && (
          <>
            <div style={{ fontSize: '7px', color: '#555', marginTop: '2px' }}>
              Date: {MOCK.date}
            </div>
            <div style={{ fontSize: '7px', color: '#555' }}>
              Valid Until: {MOCK.validUntil}
            </div>
          </>
        )}
        {getField(config, 'header', 'status') && (
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: primaryColor, marginTop: '3px' }}>
            {MOCK.status}
          </div>
        )}
      </div>
    </div>
  )
}

function BillToSection({ config }: { config: EstimateTemplateConfig }) {
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
        Prepared For
      </div>
      {getField(config, 'billTo', 'clientName') && (
        <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{MOCK.clientName}</div>
      )}
      {getField(config, 'billTo', 'contactName') && (
        <div style={{ fontSize: '7px', color: '#555' }}>{MOCK.contactName}</div>
      )}
    </div>
  )
}

function TitleDescSection({ config }: { config: EstimateTemplateConfig }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      {getField(config, 'titleDescription', 'title') && (
        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>
          {MOCK.title}
        </div>
      )}
      {getField(config, 'titleDescription', 'description') && (
        <div style={{ fontSize: '8px', color: '#555' }}>{MOCK.description}</div>
      )}
    </div>
  )
}

function LineItemsSection({
  config,
  primaryColor,
}: {
  config: EstimateTemplateConfig
  primaryColor: string
}) {
  const showDesc = getField(config, 'lineItems', 'description')
  const showQty = getField(config, 'lineItems', 'quantity')
  const showRate = getField(config, 'lineItems', 'rate')
  const showAmount = getField(config, 'lineItems', 'amount')
  const softBg = `${primaryColor}15`

  return (
    <div style={{ marginTop: '6px', borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>
      <div
        style={{
          display: 'flex',
          backgroundColor: softBg,
          padding: '4px 3px',
          borderBottom: '1px solid #ddd',
          fontSize: '6px',
          fontWeight: 'bold',
          color: '#444',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}
      >
        {showDesc && <div style={{ flex: 1 }}>Item</div>}
        {showQty && <div style={{ width: '42px', textAlign: 'right' }}>Qty</div>}
        {showRate && <div style={{ width: '54px', textAlign: 'right' }}>Rate</div>}
        {showAmount && <div style={{ width: '60px', textAlign: 'right' }}>Amount</div>}
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
            </div>
          )}
          {showQty && <div style={{ width: '42px', textAlign: 'right' }}>{line.qty}</div>}
          {showRate && <div style={{ width: '54px', textAlign: 'right' }}>{line.rate}</div>}
          {showAmount && <div style={{ width: '60px', textAlign: 'right' }}>{line.amount}</div>}
        </div>
      ))}
    </div>
  )
}

function TotalsSection({ config }: { config: EstimateTemplateConfig }) {
  return (
    <div style={{ marginTop: '10px', marginLeft: 'auto', width: '180px' }}>
      {getField(config, 'totals', 'subtotal') && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '7px' }}>
          <span style={{ color: '#555' }}>Subtotal</span>
          <span>{MOCK.subtotal}</span>
        </div>
      )}
      {getField(config, 'totals', 'salesTax') && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '7px' }}>
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
          <span style={{ fontSize: '9px', fontWeight: 'bold' }}>TOTAL</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{MOCK.grandTotal}</span>
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

function FooterSection({ config }: { config: EstimateTemplateConfig }) {
  const parts: string[] = []
  if (getField(config, 'footer', 'orgName')) parts.push(MOCK.orgName)
  if (getField(config, 'footer', 'website')) parts.push(MOCK.website)
  if (getField(config, 'footer', 'validity'))
    parts.push(`This estimate is valid until ${MOCK.validUntil}`)

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
