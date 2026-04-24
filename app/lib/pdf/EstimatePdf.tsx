import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCents } from '@/app/lib/billing'
import { formatRate } from '@/app/lib/tax'
import { ORG } from '@/app/lib/org'
import {
  DEFAULT_ESTIMATE_TEMPLATE_CONFIG,
  type EstimateTemplateConfig,
  type EstimateSectionId,
} from '@/app/types/estimate-template'

function buildStyles(config: EstimateTemplateConfig) {
  const primary = config.globalStyles.primaryColor
  const font = config.globalStyles.fontFamily
  const bold =
    font === 'Helvetica'
      ? 'Helvetica-Bold'
      : font === 'Times-Roman'
        ? 'Times-Bold'
        : 'Courier-Bold'
  const primarySoft = primary + '15'
  return StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: font, color: '#111' },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24,
      paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: primary,
    },
    orgBlock: { maxWidth: 240 },
    logo: { maxWidth: 200, maxHeight: 60, marginBottom: 6, objectFit: 'contain' as const },
    orgName: { fontSize: 18, fontFamily: bold, color: primary },
    orgTagline: { fontSize: 9, color: '#666', marginTop: 2 },
    orgLine: { fontSize: 9, color: '#333', marginTop: 1 },
    estBlock: { alignItems: 'flex-end' as const },
    estLabel: { fontSize: 20, fontFamily: bold, letterSpacing: 2, color: '#111' },
    estNumber: { fontSize: 11, fontFamily: bold, marginTop: 4 },
    estMeta: { fontSize: 9, color: '#555', marginTop: 2 },
    billTo: { marginBottom: 20 },
    billToLabel: { fontSize: 8, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
    billToName: { fontSize: 12, fontFamily: bold },
    title: { fontSize: 14, fontFamily: bold, marginBottom: 4 },
    description: { fontSize: 10, color: '#555', marginBottom: 16 },
    table: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#ddd', borderBottomWidth: 1, borderBottomColor: '#ddd' },
    tableHeader: { flexDirection: 'row', backgroundColor: primarySoft, paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#ddd' },
    tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
    colDescription: { flex: 1 },
    colQty: { width: 60, textAlign: 'right' as const },
    colRate: { width: 70, textAlign: 'right' as const },
    colAmount: { width: 80, textAlign: 'right' as const },
    th: { fontSize: 8, fontFamily: bold, color: '#444', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    td: { fontSize: 9 },
    itemDescription: { fontSize: 9, color: '#666', marginTop: 1 },
    totals: { marginTop: 16, marginLeft: 'auto', width: 260 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 9, color: '#555' },
    totalValue: { fontSize: 9 },
    grandTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: '#111' },
    grandTotalLabel: { fontSize: 12, fontFamily: bold },
    grandTotalValue: { fontSize: 14, fontFamily: bold },
    notes: { marginTop: 24, padding: 10, borderLeftWidth: 3, borderLeftColor: primary, backgroundColor: primarySoft },
    notesLabel: { fontSize: 8, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
    notesBody: { fontSize: 9, color: '#333' },
    footer: { position: 'absolute' as const, bottom: 30, left: 40, right: 40, textAlign: 'center' as const, fontSize: 8, color: '#888', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 },
    badge: { fontSize: 11, fontFamily: bold, color: primary, marginTop: 4 },
  })
}

function field(
  config: EstimateTemplateConfig,
  sectionId: EstimateSectionId,
  key: string,
): boolean {
  const s = config.sections.find((x) => x.id === sectionId)
  if (!s || !s.enabled) return false
  return s.fields[key] !== false
}

function sectionEnabled(
  config: EstimateTemplateConfig,
  id: EstimateSectionId,
): boolean {
  return config.sections.find((s) => s.id === id)?.enabled ?? false
}

export interface EstimatePdfData {
  estimateNumber: number
  status: string
  createdAt: Date
  validUntil: Date | null
  title: string
  description: string | null
  subtotal: number
  taxState: string | null
  taxRate: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  client: { name: string; billingState: string | null }
  contact: { firstName: string; lastName: string } | null
  lineItems: {
    itemName: string
    description: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
  }[]
}

export function EstimatePdf({
  data,
  logoUrl,
  templateConfig,
}: {
  data: EstimatePdfData
  logoUrl?: string | null
  templateConfig?: EstimateTemplateConfig
}) {
  const d = data
  const config = templateConfig ?? DEFAULT_ESTIMATE_TEMPLATE_CONFIG
  const styles = buildStyles(config)
  const sorted = [...config.sections].sort((a, b) => a.sortOrder - b.sortOrder)
  const fmtDate = (dt: Date | null) => dt ? new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <Document>
      <Page size={config.globalStyles.pageSize} style={styles.page}>
        {sorted.map((section) => {
          if (!section.enabled) return null
          switch (section.id) {
            case 'header':
              return (
                <View key="header" style={styles.header}>
                  <View style={styles.orgBlock}>
                    {logoUrl && field(config, 'header', 'logo') ? (
                      <Image src={logoUrl} style={styles.logo} />
                    ) : (
                      field(config, 'header', 'orgName') && (
                        <Text style={styles.orgName}>{ORG.name}</Text>
                      )
                    )}
                    {field(config, 'header', 'tagline') && (
                      <Text style={styles.orgTagline}>{ORG.tagline}</Text>
                    )}
                    {field(config, 'header', 'address') && (
                      <>
                        <Text style={styles.orgLine}>{ORG.address}</Text>
                        <Text style={styles.orgLine}>{ORG.city}, {ORG.state} {ORG.zip}</Text>
                      </>
                    )}
                    {(field(config, 'header', 'phone') || field(config, 'header', 'email')) && (
                      <Text style={styles.orgLine}>
                        {field(config, 'header', 'phone') && ORG.phone}
                        {field(config, 'header', 'phone') && field(config, 'header', 'email') && ' · '}
                        {field(config, 'header', 'email') && ORG.email}
                      </Text>
                    )}
                  </View>
                  <View style={styles.estBlock}>
                    {field(config, 'header', 'estimateNumber') && (
                      <>
                        <Text style={styles.estLabel}>ESTIMATE</Text>
                        <Text style={styles.estNumber}>#{d.estimateNumber}</Text>
                      </>
                    )}
                    {field(config, 'header', 'dates') && (
                      <>
                        <Text style={styles.estMeta}>Date: {fmtDate(d.createdAt)}</Text>
                        {d.validUntil && (
                          <Text style={styles.estMeta}>Valid Until: {fmtDate(d.validUntil)}</Text>
                        )}
                      </>
                    )}
                    {field(config, 'header', 'status') && (
                      <Text style={styles.badge}>{d.status}</Text>
                    )}
                  </View>
                </View>
              )
            case 'billTo':
              return (
                <View key="billTo" style={styles.billTo}>
                  <Text style={styles.billToLabel}>Prepared For</Text>
                  {field(config, 'billTo', 'clientName') && (
                    <Text style={styles.billToName}>{d.client.name}</Text>
                  )}
                  {field(config, 'billTo', 'contactName') && d.contact && (
                    <Text style={styles.estMeta}>{d.contact.firstName} {d.contact.lastName}</Text>
                  )}
                </View>
              )
            case 'titleDescription':
              return (
                <View key="titleDescription">
                  {field(config, 'titleDescription', 'title') && (
                    <Text style={styles.title}>{d.title}</Text>
                  )}
                  {field(config, 'titleDescription', 'description') && d.description && (
                    <Text style={styles.description}>{d.description}</Text>
                  )}
                </View>
              )
            case 'lineItems': {
              const showDesc = field(config, 'lineItems', 'description')
              const showQty = field(config, 'lineItems', 'quantity')
              const showRate = field(config, 'lineItems', 'rate')
              const showAmount = field(config, 'lineItems', 'amount')
              return (
                <View key="lineItems" style={styles.table}>
                  <View style={styles.tableHeader}>
                    {showDesc && <View style={styles.colDescription}><Text style={styles.th}>Item</Text></View>}
                    {showQty && <View style={styles.colQty}><Text style={styles.th}>Qty</Text></View>}
                    {showRate && <View style={styles.colRate}><Text style={styles.th}>Rate</Text></View>}
                    {showAmount && <View style={styles.colAmount}><Text style={styles.th}>Amount</Text></View>}
                  </View>
                  {d.lineItems.map((li, i) => (
                    <View style={styles.tableRow} key={i}>
                      {showDesc && (
                        <View style={styles.colDescription}>
                          <Text style={styles.td}>{li.itemName}</Text>
                          {li.description && <Text style={styles.itemDescription}>{li.description}</Text>}
                        </View>
                      )}
                      {showQty && <View style={styles.colQty}><Text style={styles.td}>{li.quantity}</Text></View>}
                      {showRate && <View style={styles.colRate}><Text style={styles.td}>{formatCents(li.unitPrice)}</Text></View>}
                      {showAmount && <View style={styles.colAmount}><Text style={styles.td}>{formatCents(li.totalPrice)}</Text></View>}
                    </View>
                  ))}
                </View>
              )
            }
            case 'totals':
              return (
                <View key="totals" style={styles.totals}>
                  {field(config, 'totals', 'subtotal') && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Subtotal</Text>
                      <Text style={styles.totalValue}>{formatCents(d.subtotal)}</Text>
                    </View>
                  )}
                  {field(config, 'totals', 'salesTax') && d.taxAmount > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Tax ({d.taxState} {formatRate(d.taxRate)})</Text>
                      <Text style={styles.totalValue}>{formatCents(d.taxAmount)}</Text>
                    </View>
                  )}
                  {field(config, 'totals', 'grandTotal') && (
                    <View style={styles.grandTotal}>
                      <Text style={styles.grandTotalLabel}>Total</Text>
                      <Text style={styles.grandTotalValue}>{formatCents(d.totalAmount)}</Text>
                    </View>
                  )}
                </View>
              )
            case 'notes':
              return d.notes && sectionEnabled(config, 'notes') ? (
                <View key="notes" style={styles.notes}>
                  <Text style={styles.notesLabel}>Notes</Text>
                  <Text style={styles.notesBody}>{d.notes}</Text>
                </View>
              ) : null
            case 'footer': {
              const parts: string[] = []
              if (field(config, 'footer', 'orgName')) parts.push(ORG.name)
              if (field(config, 'footer', 'website')) parts.push(ORG.website)
              if (field(config, 'footer', 'validity')) {
                parts.push(`This estimate is valid ${d.validUntil ? `until ${fmtDate(d.validUntil)}` : 'for 30 days'}`)
              }
              if (parts.length === 0) return null
              return (
                <Text key="footer" style={styles.footer}>
                  {parts.join(' · ')}
                </Text>
              )
            }
            default:
              return null
          }
        })}
      </Page>
    </Document>
  )
}
