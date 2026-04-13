import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { ORG } from '@/app/lib/org'

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
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#F97316',
  },
  orgName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#F97316',
  },
  orgDetail: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
  },
  reportTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    textAlign: 'right',
  },
  reportSubtitle: {
    fontSize: 9,
    color: '#666',
    textAlign: 'right',
    marginTop: 3,
  },
  clientName: {
    fontSize: 9,
    color: '#666',
    textAlign: 'right',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statLabel: {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
    marginTop: 2,
  },
  statSub: {
    fontSize: 8,
    color: '#94a3b8',
    marginTop: 2,
  },
  table: {
    marginTop: 6,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: '#fafbfc',
  },
  cellSm: { width: 40, fontSize: 9 },
  cellMd: { width: 80, fontSize: 9 },
  cellLg: { flex: 1, fontSize: 9 },
  cellHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    textTransform: 'uppercase',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  breakdownLabel: { fontSize: 9, color: '#334155' },
  breakdownValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#94a3b8' },
})

export interface QbrPdfData {
  client: { name: string; shortCode: string | null }
  period: { start: string; end: string }
  tickets: {
    total: number
    resolved: number
    byPriority: { priority: string; count: number }[]
    byType: { type: string; count: number }[]
  }
  sla: {
    total: number
    met: number
    breached: number
    complianceRate: number
  }
  performance: {
    avgResolutionHours: number
    avgFirstResponseHours: number | null
  }
  billing: {
    totalRevenueCents: number
    totalLaborMinutes: number
    totalChargedMinutes: number
    revenueByType: Record<string, number>
  }
  recentTickets: {
    ticketNumber: number
    title: string
    priority: string
    status: string
    type: string
    createdAt: string
    closedAt: string | null
    assignee: string
  }[]
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function QbrPdf({ data }: { data: QbrPdfData }) {
  const generatedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.orgName}>{ORG.name}</Text>
            <Text style={styles.orgDetail}>{ORG.tagline}</Text>
            <Text style={styles.orgDetail}>{ORG.phone} | {ORG.email}</Text>
          </View>
          <View>
            <Text style={styles.reportTitle}>Service Report</Text>
            <Text style={styles.clientName}>{data.client.name}</Text>
            <Text style={styles.reportSubtitle}>
              {fmtDate(data.period.start)} – {fmtDate(data.period.end)}
            </Text>
          </View>
        </View>

        {/* Summary stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Tickets</Text>
            <Text style={styles.statValue}>{data.tickets.total}</Text>
            <Text style={styles.statSub}>{data.tickets.resolved} resolved</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SLA Compliance</Text>
            <Text style={styles.statValue}>{data.sla.complianceRate}%</Text>
            <Text style={styles.statSub}>{data.sla.breached} breached</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Avg Resolution</Text>
            <Text style={styles.statValue}>{data.performance.avgResolutionHours}h</Text>
            {data.performance.avgFirstResponseHours != null && (
              <Text style={styles.statSub}>First response: {data.performance.avgFirstResponseHours}h</Text>
            )}
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Billed</Text>
            <Text style={styles.statValue}>{fmtCents(data.billing.totalRevenueCents)}</Text>
            <Text style={styles.statSub}>{fmtHours(data.billing.totalChargedMinutes)} labor</Text>
          </View>
        </View>

        {/* By Priority */}
        <Text style={styles.sectionTitle}>Tickets by Priority</Text>
        {data.tickets.byPriority.map((r) => (
          <View key={r.priority} style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{r.priority}</Text>
            <Text style={styles.breakdownValue}>{r.count}</Text>
          </View>
        ))}

        {/* By Type */}
        <Text style={styles.sectionTitle}>Tickets by Type</Text>
        {data.tickets.byType.map((r) => (
          <View key={r.type} style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{r.type.replace(/_/g, ' ')}</Text>
            <Text style={styles.breakdownValue}>{r.count}</Text>
          </View>
        ))}

        {/* Revenue breakdown */}
        {Object.keys(data.billing.revenueByType).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Revenue Breakdown</Text>
            {Object.entries(data.billing.revenueByType).map(([type, cents]) => (
              <View key={type} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{type}</Text>
                <Text style={styles.breakdownValue}>{fmtCents(cents)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Ticket detail table */}
        <Text style={styles.sectionTitle}>Ticket Details</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.cellSm, ...styles.cellHeader }}>#</Text>
            <Text style={{ ...styles.cellLg, ...styles.cellHeader }}>Title</Text>
            <Text style={{ ...styles.cellMd, ...styles.cellHeader }}>Priority</Text>
            <Text style={{ ...styles.cellMd, ...styles.cellHeader }}>Status</Text>
            <Text style={{ ...styles.cellMd, ...styles.cellHeader }}>Created</Text>
            <Text style={{ ...styles.cellMd, ...styles.cellHeader }}>Closed</Text>
          </View>
          {data.recentTickets.slice(0, 30).map((t, i) => (
            <View key={t.ticketNumber} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={styles.cellSm}>{t.ticketNumber}</Text>
              <Text style={styles.cellLg}>{t.title.slice(0, 60)}</Text>
              <Text style={styles.cellMd}>{t.priority}</Text>
              <Text style={styles.cellMd}>{t.status.replace(/_/g, ' ')}</Text>
              <Text style={styles.cellMd}>{fmtShortDate(t.createdAt)}</Text>
              <Text style={styles.cellMd}>{t.closedAt ? fmtShortDate(t.closedAt) : '—'}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {ORG.name} | {ORG.website}
          </Text>
          <Text style={styles.footerText}>
            Generated {generatedDate} | Confidential
          </Text>
        </View>
      </Page>
    </Document>
  )
}
