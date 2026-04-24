export type EstimateSectionId =
  | 'header'
  | 'billTo'
  | 'titleDescription'
  | 'lineItems'
  | 'totals'
  | 'notes'
  | 'footer'

export interface EstimateSectionConfig {
  id: EstimateSectionId
  enabled: boolean
  sortOrder: number
  fields: Record<string, boolean>
}

export interface EstimateTemplateConfig {
  sections: EstimateSectionConfig[]
  globalStyles: {
    primaryColor: string
    fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier'
    pageSize: 'LETTER' | 'A4'
  }
}

export const ESTIMATE_SECTION_META: Record<
  EstimateSectionId,
  { label: string; fields: Array<{ key: string; label: string }> }
> = {
  header: {
    label: 'Header',
    fields: [
      { key: 'logo', label: 'Logo' },
      { key: 'orgName', label: 'Organization Name' },
      { key: 'tagline', label: 'Tagline' },
      { key: 'address', label: 'Address' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'estimateNumber', label: 'Estimate Number' },
      { key: 'dates', label: 'Date / Valid Until' },
      { key: 'status', label: 'Status' },
    ],
  },
  billTo: {
    label: 'Prepared For',
    fields: [
      { key: 'clientName', label: 'Client Name' },
      { key: 'contactName', label: 'Contact Name' },
    ],
  },
  titleDescription: {
    label: 'Title & Description',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'description', label: 'Description' },
    ],
  },
  lineItems: {
    label: 'Line Items',
    fields: [
      { key: 'description', label: 'Description' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'rate', label: 'Rate' },
      { key: 'amount', label: 'Amount' },
    ],
  },
  totals: {
    label: 'Totals',
    fields: [
      { key: 'subtotal', label: 'Subtotal' },
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
      { key: 'validity', label: 'Validity Notice' },
    ],
  },
}

export const DEFAULT_ESTIMATE_TEMPLATE_CONFIG: EstimateTemplateConfig = {
  sections: [
    {
      id: 'header',
      enabled: true,
      sortOrder: 0,
      fields: {
        logo: true,
        orgName: true,
        tagline: true,
        address: true,
        phone: true,
        email: true,
        estimateNumber: true,
        dates: true,
        status: true,
      },
    },
    {
      id: 'billTo',
      enabled: true,
      sortOrder: 1,
      fields: { clientName: true, contactName: true },
    },
    {
      id: 'titleDescription',
      enabled: true,
      sortOrder: 2,
      fields: { title: true, description: true },
    },
    {
      id: 'lineItems',
      enabled: true,
      sortOrder: 3,
      fields: {
        description: true,
        quantity: true,
        rate: true,
        amount: true,
      },
    },
    {
      id: 'totals',
      enabled: true,
      sortOrder: 4,
      fields: {
        subtotal: true,
        salesTax: true,
        grandTotal: true,
      },
    },
    {
      id: 'notes',
      enabled: true,
      sortOrder: 5,
      fields: {},
    },
    {
      id: 'footer',
      enabled: true,
      sortOrder: 6,
      fields: { orgName: true, website: true, validity: true },
    },
  ],
  globalStyles: {
    primaryColor: '#3b82f6',
    fontFamily: 'Helvetica',
    pageSize: 'LETTER',
  },
}
