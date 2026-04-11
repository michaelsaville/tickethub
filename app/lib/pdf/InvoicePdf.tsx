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

// React-PDF uses inline styles via StyleSheet.create(). Units default to
// points (72/inch) for layout, which maps well to a Letter/A4 page.

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#F97316',
  },
  orgBlock: {
    maxWidth: 240,
  },
  orgName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#F97316',
  },
  orgTagline: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  orgLine: {
    fontSize: 9,
    color: '#333',
    marginTop: 1,
  },
  invoiceBlock: {
    alignItems: 'flex-end',
  },
  invoiceLabel: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
    color: '#111',
  },
  invoiceNumber: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
  },
  invoiceMeta: {
    fontSize: 9,
    color: '#555',
    marginTop: 2,
  },
  billTo: {
    marginBottom: 20,
  },
  billToLabel: {
    fontSize: 8,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  billToName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  table: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  colDescription: { flex: 1 },
  colQty: { width: 60, textAlign: 'right' },
  colRate: { width: 70, textAlign: 'right' },
  colAmount: { width: 80, textAlign: 'right' },
  th: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  td: { fontSize: 9 },
  itemDescription: {
    fontSize: 9,
    color: '#666',
    marginTop: 1,
  },
  ticketRef: {
    fontSize: 8,
    color: '#888',
    marginTop: 1,
  },
  totals: {
    marginTop: 16,
    marginLeft: 'auto',
    width: 260,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel: {
    fontSize: 9,
    color: '#555',
  },
  totalValue: {
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: '#111',
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  notes: {
    marginTop: 24,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
    backgroundColor: '#fef3e7',
  },
  notesLabel: {
    fontSize: 8,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  notesBody: {
    fontSize: 9,
    color: '#333',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#888',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 6,
  },
})

export interface InvoicePdfData {
  invoiceNumber: number
  status: string
  issueDate: Date
  dueDate: Date | null
  subtotal: number
  taxableSubtotal: number
  taxState: string | null
  taxRate: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  client: {
    name: string
    billingState: string | null
  }
  lineItems: Array<{
    itemName: string
    description: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
    timeChargedMinutes: number | null
    ticket: { ticketNumber: number; title: string } | null
  }>
}

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  return (
    <Document
      title={`Invoice #${data.invoiceNumber}`}
      author={ORG.name}
      subject={`Invoice for ${data.client.name}`}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.orgBlock}>
            <Text style={styles.orgName}>{ORG.name}</Text>
            <Text style={styles.orgTagline}>{ORG.tagline}</Text>
            <Text style={styles.orgLine}>{ORG.address}</Text>
            <Text style={styles.orgLine}>
              {ORG.city}, {ORG.state} {ORG.zip}
            </Text>
            <Text style={styles.orgLine}>{ORG.phone}</Text>
            <Text style={styles.orgLine}>{ORG.email}</Text>
          </View>
          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{data.invoiceNumber}</Text>
            <Text style={styles.invoiceMeta}>
              Issued {formatDate(data.issueDate)}
            </Text>
            {data.dueDate && (
              <Text style={styles.invoiceMeta}>
                Due {formatDate(data.dueDate)}
              </Text>
            )}
            <Text style={styles.invoiceMeta}>Status: {data.status}</Text>
          </View>
        </View>

        {/* Bill-to */}
        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>Bill To</Text>
          <Text style={styles.billToName}>{data.client.name}</Text>
          {data.client.billingState && (
            <Text style={styles.orgLine}>
              Tax State: {data.client.billingState}
            </Text>
          )}
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDescription}>
              <Text style={styles.th}>Description</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.th}>Qty / Time</Text>
            </View>
            <View style={styles.colRate}>
              <Text style={styles.th}>Rate</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.th}>Amount</Text>
            </View>
          </View>
          {data.lineItems.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <View style={styles.colDescription}>
                <Text style={styles.td}>{line.itemName}</Text>
                {line.description && (
                  <Text style={styles.itemDescription}>{line.description}</Text>
                )}
                {line.ticket && (
                  <Text style={styles.ticketRef}>
                    Ticket #{line.ticket.ticketNumber} · {line.ticket.title}
                  </Text>
                )}
              </View>
              <View style={styles.colQty}>
                <Text style={styles.td}>
                  {line.timeChargedMinutes != null
                    ? formatMinutes(line.timeChargedMinutes)
                    : line.quantity.toString()}
                </Text>
              </View>
              <View style={styles.colRate}>
                <Text style={styles.td}>{formatCents(line.unitPrice)}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.td}>{formatCents(line.totalPrice)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCents(data.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Taxable Portion ({formatRate(data.taxRate)} {data.taxState ?? ''})
            </Text>
            <Text style={styles.totalValue}>
              {formatCents(data.taxableSubtotal)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sales Tax</Text>
            <Text style={styles.totalValue}>{formatCents(data.taxAmount)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>TOTAL DUE</Text>
            <Text style={styles.grandTotalValue}>
              {formatCents(data.totalAmount)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesBody}>{data.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          {ORG.name} · {ORG.website} · Questions? {ORG.email}
        </Text>
      </Page>
    </Document>
  )
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
