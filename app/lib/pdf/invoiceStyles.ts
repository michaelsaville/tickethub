import { StyleSheet } from '@react-pdf/renderer'
import type { InvoiceTemplateConfig } from '@/app/types/invoice-template'

type FontFamily = 'Helvetica' | 'Times-Roman' | 'Courier'

const BOLD_MAP: Record<FontFamily, string> = {
  Helvetica: 'Helvetica-Bold',
  'Times-Roman': 'Times-Bold',
  Courier: 'Courier-Bold',
}

export function buildInvoiceStyles(config: InvoiceTemplateConfig) {
  const { primaryColor, fontFamily } = config.globalStyles
  const bold = BOLD_MAP[fontFamily] ?? 'Helvetica-Bold'

  return StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily,
      color: '#111',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
      paddingBottom: 16,
      borderBottomWidth: 2,
      borderBottomColor: primaryColor,
    },
    orgBlock: {
      maxWidth: 240,
    },
    orgName: {
      fontSize: 18,
      fontFamily: bold,
      color: primaryColor,
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
      fontFamily: bold,
      letterSpacing: 2,
      color: '#111',
    },
    invoiceNumber: {
      fontSize: 11,
      fontFamily: bold,
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
      fontFamily: bold,
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
      fontFamily: bold,
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
      fontFamily,
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
      fontFamily: bold,
    },
    grandTotalValue: {
      fontSize: 14,
      fontFamily: bold,
    },
    notes: {
      marginTop: 24,
      padding: 10,
      borderLeftWidth: 3,
      borderLeftColor: primaryColor,
      backgroundColor: `${primaryColor}15`,
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
    logo: {
      maxHeight: 48,
      maxWidth: 160,
      marginBottom: 4,
    },
  })
}
