export type SectionId =
  | 'header'
  | 'billTo'
  | 'lineItems'
  | 'totals'
  | 'notes'
  | 'footer'

export interface InvoiceSectionConfig {
  id: SectionId
  enabled: boolean
  sortOrder: number
  fields: Record<string, boolean>
}

export interface InvoiceTemplateConfig {
  sections: InvoiceSectionConfig[]
  globalStyles: {
    primaryColor: string
    fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier'
    pageSize: 'LETTER' | 'A4'
  }
}

/** Per-section field definitions with labels for the builder UI */
export const SECTION_META: Record<
  SectionId,
  { label: string; fields: Array<{ key: string; label: string }> }
> = {
  header: {
    label: 'Header',
    fields: [
      { key: 'orgName', label: 'Organization Name' },
      { key: 'tagline', label: 'Tagline' },
      { key: 'address', label: 'Address' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'logo', label: 'Logo' },
      { key: 'invoiceNumber', label: 'Invoice Number' },
      { key: 'dates', label: 'Issue / Due Dates' },
      { key: 'status', label: 'Status' },
    ],
  },
  billTo: {
    label: 'Bill To',
    fields: [
      { key: 'clientName', label: 'Client Name' },
      { key: 'billingState', label: 'Billing State' },
    ],
  },
  lineItems: {
    label: 'Line Items',
    fields: [
      { key: 'description', label: 'Description' },
      { key: 'quantity', label: 'Qty / Time' },
      { key: 'rate', label: 'Rate' },
      { key: 'amount', label: 'Amount' },
      { key: 'ticketRef', label: 'Ticket Reference' },
    ],
  },
  totals: {
    label: 'Totals',
    fields: [
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'taxablePortion', label: 'Taxable Portion' },
      { key: 'salesTax', label: 'Sales Tax' },
      { key: 'grandTotal', label: 'Grand Total' },
    ],
  },
  notes: {
    label: 'Notes',
    fields: [],
  },
  footer: {
    label: 'Footer',
    fields: [
      { key: 'orgName', label: 'Organization Name' },
      { key: 'website', label: 'Website' },
      { key: 'email', label: 'Email' },
    ],
  },
}

/** Default config matching the current hardcoded InvoicePdf layout */
export const DEFAULT_INVOICE_TEMPLATE_CONFIG: InvoiceTemplateConfig = {
  sections: [
    {
      id: 'header',
      enabled: true,
      sortOrder: 0,
      fields: {
        orgName: true,
        tagline: true,
        address: true,
        phone: true,
        email: true,
        logo: true,
        invoiceNumber: true,
        dates: true,
        status: true,
      },
    },
    {
      id: 'billTo',
      enabled: true,
      sortOrder: 1,
      fields: { clientName: true, billingState: true },
    },
    {
      id: 'lineItems',
      enabled: true,
      sortOrder: 2,
      fields: {
        description: true,
        quantity: true,
        rate: true,
        amount: true,
        ticketRef: true,
      },
    },
    {
      id: 'totals',
      enabled: true,
      sortOrder: 3,
      fields: {
        subtotal: true,
        taxablePortion: true,
        salesTax: true,
        grandTotal: true,
      },
    },
    {
      id: 'notes',
      enabled: true,
      sortOrder: 4,
      fields: {},
    },
    {
      id: 'footer',
      enabled: true,
      sortOrder: 5,
      fields: { orgName: true, website: true, email: true },
    },
  ],
  globalStyles: {
    primaryColor: '#F97316',
    fontFamily: 'Helvetica',
    pageSize: 'LETTER',
  },
}
