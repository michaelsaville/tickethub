import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCents } from '@/app/lib/billing'
import { formatRate } from '@/app/lib/tax'
import { ORG } from '@/app/lib/org'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24,
    paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: '#3b82f6',
  },
  orgBlock: { maxWidth: 240 },
  orgName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#3b82f6' },
  orgTagline: { fontSize: 9, color: '#666', marginTop: 2 },
  orgLine: { fontSize: 9, color: '#333', marginTop: 1 },
  estBlock: { alignItems: 'flex-end' as const },
  estLabel: { fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: '#111' },
  estNumber: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  estMeta: { fontSize: 9, color: '#555', marginTop: 2 },
  billTo: { marginBottom: 20 },
  billToLabel: { fontSize: 8, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
  billToName: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  description: { fontSize: 10, color: '#555', marginBottom: 16 },
  table: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#ddd', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#eff6ff', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  colDescription: { flex: 1 },
  colQty: { width: 60, textAlign: 'right' as const },
  colRate: { width: 70, textAlign: 'right' as const },
  colAmount: { width: 80, textAlign: 'right' as const },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#444', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  td: { fontSize: 9 },
  itemDescription: { fontSize: 9, color: '#666', marginTop: 1 },
  totals: { marginTop: 16, marginLeft: 'auto', width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 9, color: '#555' },
  totalValue: { fontSize: 9 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: '#111' },
  grandTotalLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  grandTotalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  notes: { marginTop: 24, padding: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6', backgroundColor: '#eff6ff' },
  notesLabel: { fontSize: 8, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
  notesBody: { fontSize: 9, color: '#333' },
  footer: { position: 'absolute' as const, bottom: 30, left: 40, right: 40, textAlign: 'center' as const, fontSize: 8, color: '#888', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 },
  badge: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#3b82f6', marginTop: 4 },
})

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

export function EstimatePdf({ data }: { data: EstimatePdfData }) {
  const d = data
  const fmtDate = (dt: Date | null) => dt ? new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.orgBlock}>
            <Text style={styles.orgName}>{ORG.name}</Text>
            <Text style={styles.orgTagline}>{ORG.tagline}</Text>
            <Text style={styles.orgLine}>{ORG.address}</Text>
            <Text style={styles.orgLine}>{ORG.city}, {ORG.state} {ORG.zip}</Text>
            <Text style={styles.orgLine}>{ORG.phone} · {ORG.email}</Text>
          </View>
          <View style={styles.estBlock}>
            <Text style={styles.estLabel}>ESTIMATE</Text>
            <Text style={styles.estNumber}>#{d.estimateNumber}</Text>
            <Text style={styles.estMeta}>Date: {fmtDate(d.createdAt)}</Text>
            {d.validUntil && <Text style={styles.estMeta}>Valid Until: {fmtDate(d.validUntil)}</Text>}
            <Text style={styles.badge}>{d.status}</Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>Prepared For</Text>
          <Text style={styles.billToName}>{d.client.name}</Text>
          {d.contact && <Text style={styles.estMeta}>{d.contact.firstName} {d.contact.lastName}</Text>}
        </View>

        {/* Title & Description */}
        <Text style={styles.title}>{d.title}</Text>
        {d.description && <Text style={styles.description}>{d.description}</Text>}

        {/* Line Items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDescription}><Text style={styles.th}>Item</Text></View>
            <View style={styles.colQty}><Text style={styles.th}>Qty</Text></View>
            <View style={styles.colRate}><Text style={styles.th}>Rate</Text></View>
            <View style={styles.colAmount}><Text style={styles.th}>Amount</Text></View>
          </View>
          {d.lineItems.map((li, i) => (
            <View style={styles.tableRow} key={i}>
              <View style={styles.colDescription}>
                <Text style={styles.td}>{li.itemName}</Text>
                {li.description && <Text style={styles.itemDescription}>{li.description}</Text>}
              </View>
              <View style={styles.colQty}><Text style={styles.td}>{li.quantity}</Text></View>
              <View style={styles.colRate}><Text style={styles.td}>{formatCents(li.unitPrice)}</Text></View>
              <View style={styles.colAmount}><Text style={styles.td}>{formatCents(li.totalPrice)}</Text></View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCents(d.subtotal)}</Text>
          </View>
          {d.taxAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({d.taxState} {formatRate(d.taxRate)})</Text>
              <Text style={styles.totalValue}>{formatCents(d.taxAmount)}</Text>
            </View>
          )}
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCents(d.totalAmount)}</Text>
          </View>
        </View>

        {/* Notes */}
        {d.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesBody}>{d.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          {ORG.name} · {ORG.website} · This estimate is valid {d.validUntil ? `until ${fmtDate(d.validUntil)}` : 'for 30 days'}
        </Text>
      </Page>
    </Document>
  )
}
