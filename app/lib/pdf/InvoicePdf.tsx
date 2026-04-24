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
  DEFAULT_INVOICE_TEMPLATE_CONFIG,
  type InvoiceTemplateConfig,
  type SectionId,
} from '@/app/types/invoice-template'
import { buildInvoiceStyles } from './invoiceStyles'

export interface InvoicePdfData {
  invoiceNumber: number
  status: string
  issueDate: Date
  dueDate: Date | null
  paidAt: Date | null
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

function field(
  config: InvoiceTemplateConfig,
  sectionId: SectionId,
  key: string,
): boolean {
  const section = config.sections.find((s) => s.id === sectionId)
  if (!section || !section.enabled) return false
  return section.fields[key] !== false
}

function sectionEnabled(
  config: InvoiceTemplateConfig,
  id: SectionId,
): boolean {
  return config.sections.find((s) => s.id === id)?.enabled ?? false
}

export function InvoicePdf({
  data,
  templateConfig,
  logoUrl,
}: {
  data: InvoicePdfData
  templateConfig?: InvoiceTemplateConfig
  logoUrl?: string | null
}) {
  const config = templateConfig ?? DEFAULT_INVOICE_TEMPLATE_CONFIG
  const styles = buildInvoiceStyles(config)
  const sortedSections = [...config.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  return (
    <Document
      title={`Invoice #${data.invoiceNumber}`}
      author={ORG.name}
      subject={`Invoice for ${data.client.name}`}
    >
      <Page size={config.globalStyles.pageSize} style={styles.page}>
        {sortedSections.map((section) => {
          if (!section.enabled) return null
          switch (section.id) {
            case 'header':
              return (
                <HeaderSection
                  key="header"
                  data={data}
                  config={config}
                  styles={styles}
                  logoUrl={logoUrl}
                />
              )
            case 'billTo':
              return (
                <BillToSection
                  key="billTo"
                  data={data}
                  config={config}
                  styles={styles}
                />
              )
            case 'lineItems':
              return (
                <LineItemsSection
                  key="lineItems"
                  data={data}
                  config={config}
                  styles={styles}
                />
              )
            case 'totals':
              return (
                <TotalsSection
                  key="totals"
                  data={data}
                  config={config}
                  styles={styles}
                />
              )
            case 'notes':
              return data.notes ? (
                <NotesSection key="notes" data={data} styles={styles} />
              ) : null
            case 'footer':
              return (
                <FooterSection
                  key="footer"
                  config={config}
                  styles={styles}
                />
              )
            default:
              return null
          }
        })}
        {data.status === 'PAID' && <PaidStamp paidAt={data.paidAt} />}
      </Page>
    </Document>
  )
}

const paidStampStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 180,
    left: 140,
    right: 140,
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'rotate(-18deg)',
    opacity: 0.75,
  },
  box: {
    borderWidth: 4,
    borderColor: '#15803d',
    paddingVertical: 10,
    paddingHorizontal: 36,
    backgroundColor: 'rgba(220, 252, 231, 0.4)',
    alignItems: 'center',
  },
  text: {
    fontSize: 64,
    fontFamily: 'Helvetica-Bold',
    color: '#15803d',
    letterSpacing: 6,
  },
  date: {
    marginTop: 4,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#166534',
    letterSpacing: 2,
  },
})

function PaidStamp({ paidAt }: { paidAt: Date | null }) {
  const dateLabel = paidAt
    ? paidAt.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null
  return (
    <View style={paidStampStyles.wrap} fixed>
      <View style={paidStampStyles.box}>
        <Text style={paidStampStyles.text}>PAID</Text>
        {dateLabel && (
          <Text style={paidStampStyles.date}>{dateLabel}</Text>
        )}
      </View>
    </View>
  )
}

function HeaderSection({
  data,
  config,
  styles,
  logoUrl,
}: {
  data: InvoicePdfData
  config: InvoiceTemplateConfig
  styles: ReturnType<typeof buildInvoiceStyles>
  logoUrl?: string | null
}) {
  return (
    <View style={styles.header}>
      <View style={styles.orgBlock}>
        {logoUrl && field(config, 'header', 'logo') && (
          <Image src={logoUrl} style={styles.logo} />
        )}
        {field(config, 'header', 'orgName') && (
          <Text style={styles.orgName}>{ORG.name}</Text>
        )}
        {field(config, 'header', 'tagline') && (
          <Text style={styles.orgTagline}>{ORG.tagline}</Text>
        )}
        {field(config, 'header', 'address') && (
          <>
            <Text style={styles.orgLine}>{ORG.address}</Text>
            <Text style={styles.orgLine}>
              {ORG.city}, {ORG.state} {ORG.zip}
            </Text>
          </>
        )}
        {field(config, 'header', 'phone') && (
          <Text style={styles.orgLine}>{ORG.phone}</Text>
        )}
        {field(config, 'header', 'email') && (
          <Text style={styles.orgLine}>{ORG.email}</Text>
        )}
      </View>
      <View style={styles.invoiceBlock}>
        {field(config, 'header', 'invoiceNumber') && (
          <>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{data.invoiceNumber}</Text>
          </>
        )}
        {field(config, 'header', 'dates') && (
          <>
            <Text style={styles.invoiceMeta}>
              Issued {formatDate(data.issueDate)}
            </Text>
            {data.dueDate && (
              <Text style={styles.invoiceMeta}>
                Due {formatDate(data.dueDate)}
              </Text>
            )}
          </>
        )}
        {field(config, 'header', 'status') && (
          <Text style={styles.invoiceMeta}>Status: {data.status}</Text>
        )}
      </View>
    </View>
  )
}

function BillToSection({
  data,
  config,
  styles,
}: {
  data: InvoicePdfData
  config: InvoiceTemplateConfig
  styles: ReturnType<typeof buildInvoiceStyles>
}) {
  return (
    <View style={styles.billTo}>
      <Text style={styles.billToLabel}>Bill To</Text>
      {field(config, 'billTo', 'clientName') && (
        <Text style={styles.billToName}>{data.client.name}</Text>
      )}
      {field(config, 'billTo', 'billingState') && data.client.billingState && (
        <Text style={styles.orgLine}>
          Tax State: {data.client.billingState}
        </Text>
      )}
    </View>
  )
}

function LineItemsSection({
  data,
  config,
  styles,
}: {
  data: InvoicePdfData
  config: InvoiceTemplateConfig
  styles: ReturnType<typeof buildInvoiceStyles>
}) {
  const showDesc = field(config, 'lineItems', 'description')
  const showQty = field(config, 'lineItems', 'quantity')
  const showRate = field(config, 'lineItems', 'rate')
  const showAmount = field(config, 'lineItems', 'amount')
  const showTicket = field(config, 'lineItems', 'ticketRef')

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {showDesc && (
          <View style={styles.colDescription}>
            <Text style={styles.th}>Description</Text>
          </View>
        )}
        {showQty && (
          <View style={styles.colQty}>
            <Text style={styles.th}>Qty / Time</Text>
          </View>
        )}
        {showRate && (
          <View style={styles.colRate}>
            <Text style={styles.th}>Rate</Text>
          </View>
        )}
        {showAmount && (
          <View style={styles.colAmount}>
            <Text style={styles.th}>Amount</Text>
          </View>
        )}
      </View>
      {data.lineItems.map((line, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          {showDesc && (
            <View style={styles.colDescription}>
              <Text style={styles.td}>{line.itemName}</Text>
              {line.description && (
                <Text style={styles.itemDescription}>{line.description}</Text>
              )}
              {showTicket && line.ticket && (
                <Text style={styles.ticketRef}>
                  Ticket #{line.ticket.ticketNumber} · {line.ticket.title}
                </Text>
              )}
            </View>
          )}
          {showQty && (
            <View style={styles.colQty}>
              <Text style={styles.td}>
                {line.timeChargedMinutes != null
                  ? formatMinutes(line.timeChargedMinutes)
                  : line.quantity.toString()}
              </Text>
            </View>
          )}
          {showRate && (
            <View style={styles.colRate}>
              <Text style={styles.td}>{formatCents(line.unitPrice)}</Text>
            </View>
          )}
          {showAmount && (
            <View style={styles.colAmount}>
              <Text style={styles.td}>{formatCents(line.totalPrice)}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

function TotalsSection({
  data,
  config,
  styles,
}: {
  data: InvoicePdfData
  config: InvoiceTemplateConfig
  styles: ReturnType<typeof buildInvoiceStyles>
}) {
  return (
    <View style={styles.totals}>
      {field(config, 'totals', 'subtotal') && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCents(data.subtotal)}</Text>
        </View>
      )}
      {field(config, 'totals', 'taxablePortion') && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            Taxable Portion ({formatRate(data.taxRate)} {data.taxState ?? ''})
          </Text>
          <Text style={styles.totalValue}>
            {formatCents(data.taxableSubtotal)}
          </Text>
        </View>
      )}
      {field(config, 'totals', 'salesTax') && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Sales Tax</Text>
          <Text style={styles.totalValue}>{formatCents(data.taxAmount)}</Text>
        </View>
      )}
      {field(config, 'totals', 'grandTotal') && (
        <View style={styles.grandTotal}>
          <Text style={styles.grandTotalLabel}>TOTAL DUE</Text>
          <Text style={styles.grandTotalValue}>
            {formatCents(data.totalAmount)}
          </Text>
        </View>
      )}
    </View>
  )
}

function NotesSection({
  data,
  styles,
}: {
  data: InvoicePdfData
  styles: ReturnType<typeof buildInvoiceStyles>
}) {
  return (
    <View style={styles.notes}>
      <Text style={styles.notesLabel}>Notes</Text>
      <Text style={styles.notesBody}>{data.notes}</Text>
    </View>
  )
}

function FooterSection({
  config,
  styles,
}: {
  config: InvoiceTemplateConfig
  styles: ReturnType<typeof buildInvoiceStyles>
}) {
  const parts: string[] = []
  if (field(config, 'footer', 'orgName')) parts.push(ORG.name)
  if (field(config, 'footer', 'website')) parts.push(ORG.website)
  if (field(config, 'footer', 'email')) parts.push(`Questions? ${ORG.email}`)

  if (parts.length === 0) return null

  return (
    <Text style={styles.footer} fixed>
      {parts.join(' · ')}
    </Text>
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
