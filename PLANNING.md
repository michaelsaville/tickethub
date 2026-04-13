# TicketHub — Master Planning Document

**Version:** 1.0  
**Status:** Active Planning  
**Author:** PCC2K  
**Last Updated:** April 2026

---

## Table of Contents

1. [Vision & Philosophy](#1-vision--philosophy)
2. [What This Is and Is Not](#2-what-this-is-and-is-not)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Decisions](#4-architecture-decisions)
5. [Repository & Deployment](#5-repository--deployment)
6. [Authentication & Users](#6-authentication--users)
7. [Module Switcher — DocHub ↔ TicketHub](#7-module-switcher--dochub--tickethub)
8. [Data Model — Complete Schema Design](#8-data-model--complete-schema-design)
9. [Feature Specification — Phase by Phase](#9-feature-specification--phase-by-phase)
10. [UI/UX Design System](#10-uiux-design-system)
11. [Mobile Strategy — PWA & Offline-First](#11-mobile-strategy--pwa--offline-first)
12. [Notification System](#12-notification-system)
13. [Browser Extensions](#13-browser-extensions)
14. [Integrations](#14-integrations)
15. [AI Features](#15-ai-features)
16. [Build Phases & Priorities](#16-build-phases--priorities)
17. [Design Decisions Log](#17-design-decisions-log)

---

## 1. Vision & Philosophy

TicketHub is an MSP ticketing and operations platform built by a small MSP, for small MSPs. It is not trying to be HaloPSA, ConnectWise, or Syncro. It is trying to be **the platform those tools should have built** — one that treats mobile as a first-class citizen, makes billing the architectural backbone rather than an afterthought, gets a team productive in a day rather than three months, and respects the reality of how field technicians actually work.

### Core Beliefs

**Speed is a feature.** Every interaction should feel instant. Sub-100ms responses through optimistic updates, local-first data, and skeleton screens. HaloPSA proved MSPs will switch platforms purely for speed.

**Mobile is not a checkbox.** Field techs work in server rooms with no signal, in bright sunlight with gloved hands, and at client sites where they need information immediately. The mobile experience is designed first, not adapted from desktop.

**Billing is the backbone.** Every billable event — labor, parts, expense — flows through a first-class `Charge` entity with its own lifecycle. Time tracking, invoicing, and reporting all emerge from this foundation rather than being bolted on separately.

**Fast onboarding is a product feature.** Competitors charge $3,000–4,000 for onboarding and take 3–6 months to reach full productivity. TicketHub should have a team working effectively in a day. Guided wizards, sensible defaults, and AI-assisted configuration close that gap.

**Progressive complexity.** Start every workflow simple. Support the full depth MSPs need through progressive disclosure. A new tech sees a clean, obvious interface. A power user has access to every advanced capability.

### The Competitive Insight

From researching HaloPSA, ConnectWise PSA, Syncro MSP, and RangerMSP:

- **HaloPSA** wins on customization depth and all-inclusive pricing, loses on onboarding time and mobile experience
- **ConnectWise** loses on UI speed (20 clicks vs 3), opaque pricing, and PE ownership fatigue
- **Syncro** wins on simplicity and per-user pricing, loses on depth and customization
- **RangerMSP** has the best billing architecture (Charges as first-class entities) and the best client context injection patterns

**Our blue ocean:** Mobile-first + fast onboarding + RangerMSP's billing architecture + HaloPSA's customization philosophy + Linear's interaction design quality.

---

## 2. What This Is and Is Not

### TicketHub IS:
- An MSP ticketing system (incident, service request, problem, change)
- A time tracking and billing platform (charges, invoices, contracts)
- A mobile-first field service tool (PWA, offline-capable)
- A parts/procurement tracker (Amazon Business extension → ticket → invoice)
- An expense/fuel receipt capture system (AI-powered receipt scanning)
- A client operations platform (client context, asset linking, SLA management)
- A companion to DocHub (shared auth, shared database, module switcher)

### TicketHub is NOT:
- A documentation platform (that's DocHub)
- A full RMM (we integrate with RMMs, we don't replace them)
- A general-purpose CRM (we're MSP-specific)
- A standalone accounting system (we integrate with QuickBooks/Xero)
- A replacement for DocHub's credential vault or license management

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15+ (App Router) | Same as DocHub — no learning curve |
| Language | TypeScript | Strict mode throughout |
| Database | PostgreSQL 16 | Shared with DocHub |
| ORM | Prisma 6 | Schema extends same DB as DocHub |
| Auth | Microsoft Entra ID via NextAuth.js | Same tenant as DocHub — one login |
| Styling | Tailwind CSS | Consistent with DocHub patterns |
| Reverse Proxy | Caddy 2 | Existing DocHub Caddyfile — add one block |
| Containers | Docker + Docker Compose | Separate container, same host |
| Auto-updates | Watchtower | Same pattern as DocHub |
| PWA | next-pwa | Service worker, offline capability |
| Offline Storage | Dexie.js (IndexedDB wrapper) | Queue sync operations offline |
| Push Notifications | ntfy.sh (self-hosted) + Pushover | ntfy for routine, Pushover for critical |
| AI | Anthropic Claude API | Receipt scanning, ticket classification, search |
| Email | Microsoft 365 (existing tenant) | M365 webhooks for email → ticket |
| Accounting | QuickBooks / Xero | Invoice sync via API |

---

## 4. Architecture Decisions

### Decision 1 — Separate Repo, Shared Database

**Decision:** TicketHub lives in its own GitHub repository (`github.com/michaelsaville/tickethub`) but shares the same PostgreSQL database as DocHub.

**Rationale:** DocHub is in production with 113 commits and live clients. TicketHub development noise — failed builds, experimental branches, half-finished features — should never touch DocHub's deployment pipeline. Independent version history, independent CI/CD, independent Docker image. The shared database is handled at the schema level with clear model namespacing.

**Implementation:** Both apps connect to the same `DATABASE_URL`. TicketHub has its own `prisma/schema.prisma` that defines TicketHub-specific models. The DocHub schema is not modified by TicketHub — both schemas write to the same Postgres instance but own their own tables.

### Decision 2 — Scaffold from DocHub, Not from Zero

**Decision:** Clone DocHub as the starting point, strip all DocHub-specific pages and models, keep the infrastructure skeleton.

**What we keep from DocHub:**
- `docker-compose.yml` structure
- `Caddyfile` pattern (add one subdomain block)
- `.github/workflows/` CI/CD pipeline
- `next.config.js` baseline
- NextAuth configuration and Entra ID setup
- Prisma client setup and connection
- Root `layout.tsx` shell structure

**What we build fresh:**
- All pages, routes, and components
- Entire Prisma schema (TicketHub models)
- Sidebar navigation
- Design tokens and color system
- Every feature

### Decision 3 — Charges as the Billing Backbone

**Decision:** A `Charge` is the atomic billing unit, not a derived concept. Every billable event (labor, parts, expense, contract fee) is a Charge with its own lifecycle: `NOT_BILLABLE → BILLABLE → INVOICED → LOCKED`.

**Rationale:** This is RangerMSP's single most important architectural insight. When billing is a first-class entity rather than a feature attached to tickets, downstream effects are profound: finance-blind tech logging, automatic price resolution, Time Spent vs Time Charged as separate fields, double-billing prevention through structural locking, and profitability reporting on fixed-fee contracts.

**Implication:** Design the Charge model and its relationships before designing any other feature. Everything flows from it.

### Decision 4 — Global System Contract Per Client

**Decision:** Every client automatically gets a default `GlobalContract` on creation. Work can be logged against this contract immediately without any setup.

**Rationale:** The biggest onboarding friction in ConnectWise is that you cannot log a charge until a contract exists. Eliminate this entirely. The Global Contract has no expiry, no cap, no SLA — it's a fallback billing container that allows day-one productivity.

### Decision 5 — Finance-Blind Tech Logging

**Decision:** Technicians never see dollar amounts when logging time or adding charges. All pricing resolves automatically through a cascading hierarchy.

**Price resolution waterfall:**
```
1. Ticket-level price override
2. Contract exception for this specific item
3. Client-level default rate
4. Technician's configured hourly rate
5. Item catalog default price
```

**Rationale:** Techs should focus on work, not billing decisions. This eliminates the "what do I charge for this?" friction that slows down ticket resolution.

### Decision 6 — Mobile PWA, Offline-First

**Decision:** TicketHub is a Progressive Web App with full offline capability for core field operations.

**Offline-capable operations:**
- View assigned tickets (cached)
- Add notes to tickets (queued)
- Log time entries (queued)
- Change ticket status (queued, optimistic UI)
- Add parts to a ticket (queued)
- Attach photos (queued for upload)
- Capture client signature (queued)

**Sync strategy:** Background Sync API where supported. On iOS (limited Background Sync support), sync triggers on app open/foreground. Show persistent sync status indicator. Conflict resolution: last-write-wins for field operations, with audit trail. Queue stored in IndexedDB via Dexie.js.

### Decision 7 — Three-Panel Desktop, Single-Column Mobile

**Decision:** Desktop uses a three-panel layout (Properties | Timeline + Composer | Context). Mobile uses single-column with segmented tabs.

**Breakpoints:**
- `≥1200px`: Full three-panel + collapsible sidebar
- `1024–1199px`: Sidebar collapses to icon rail, context panel becomes slide-over
- `768–1023px`: Stacked navigation, no split view
- `<768px`: Full mobile, bottom tab bar replaces sidebar

### Decision 8 — Separate Subdomain, Not a Path

**Decision:** TicketHub runs at `tickethub.yourdomain.com`, not `yourdomain.com/tickethub`.

**Rationale:** Separate Docker containers require separate virtual hosts. The subdomain approach is cleaner for Caddy configuration, SSL certificates, and future extraction to a separate server.

---

## 5. Repository & Deployment

### Repository Structure

```
tickethub/
├── .github/
│   └── workflows/
│       └── deploy.yml          ← Build Docker image, push to GHCR
├── app/
│   ├── api/                    ← Next.js API routes
│   │   ├── auth/               ← NextAuth handlers
│   │   ├── tickets/            ← Ticket CRUD
│   │   ├── charges/            ← Charge management
│   │   ├── clients/            ← Client management
│   │   ├── invoices/           ← Invoice generation
│   │   ├── fuel-receipts/      ← Fuel receipt scanner
│   │   ├── ai/                 ← AI endpoints (receipt scan, classification)
│   │   ├── sync/               ← Offline sync queue processor
│   │   └── notifications/      ← Notification dispatch
│   ├── (tickethub)/            ← Main app route group
│   │   ├── dashboard/
│   │   ├── tickets/
│   │   │   ├── page.tsx        ← Ticket queue
│   │   │   └── [id]/
│   │   │       └── page.tsx    ← Ticket detail
│   │   ├── clients/
│   │   ├── time/
│   │   ├── invoices/
│   │   ├── fuel-receipts/
│   │   ├── reports/
│   │   └── settings/
│   ├── components/
│   │   ├── shared/             ← Buttons, inputs, modals, tables, badges
│   │   ├── tickets/            ← Ticket-specific components
│   │   ├── charges/            ← Charge/billing components
│   │   ├── mobile/             ← Mobile-specific components
│   │   └── layout/             ← Sidebar, header, module switcher
│   ├── lib/
│   │   ├── prisma.ts           ← Prisma client singleton
│   │   ├── auth.ts             ← NextAuth config
│   │   ├── ai.ts               ← Claude API client
│   │   ├── notifications.ts    ← ntfy/Pushover helpers
│   │   └── sync.ts             ← Offline sync utilities
│   ├── hooks/                  ← Custom React hooks
│   ├── types/                  ← TypeScript type definitions
│   └── layout.tsx              ← Root layout
├── prisma/
│   └── schema.prisma           ← TicketHub data models
├── public/
│   ├── manifest.json           ← PWA manifest
│   └── sw.js                   ← Service worker (generated by next-pwa)
├── extension-parts/            ← Amazon Business parts scraper extension
├── extension-invoice/          ← Invoice capture extension
├── docker-compose.yml
├── Caddyfile
├── Dockerfile
├── PLANNING.md                 ← This document
└── claude.md                   ← Claude Code context file
```

### Docker Compose (server-level, both apps)

```yaml
services:
  dochub:
    image: ghcr.io/michaelsaville/dochub:latest
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_URL=https://dochub.yourdomain.com
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - AZURE_AD_CLIENT_ID=${AZURE_AD_CLIENT_ID}
      - AZURE_AD_CLIENT_SECRET=${AZURE_AD_CLIENT_SECRET}
      - AZURE_AD_TENANT_ID=${AZURE_AD_TENANT_ID}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}

  tickethub:
    image: ghcr.io/michaelsaville/tickethub:latest
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}           # same DB as DocHub
      - NEXTAUTH_URL=https://tickethub.yourdomain.com
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}     # same secret = shared session
      - AZURE_AD_CLIENT_ID=${AZURE_AD_CLIENT_ID}
      - AZURE_AD_CLIENT_SECRET=${AZURE_AD_CLIENT_SECRET}
      - AZURE_AD_TENANT_ID=${AZURE_AD_TENANT_ID}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NTFY_URL=${NTFY_URL}
      - PUSHOVER_APP_TOKEN=${PUSHOVER_APP_TOKEN}
      - QUICKBOOKS_CLIENT_ID=${QUICKBOOKS_CLIENT_ID}
      - QUICKBOOKS_CLIENT_SECRET=${QUICKBOOKS_CLIENT_SECRET}

  db:
    image: postgres:16
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}

  ntfy:
    image: binwiederhier/ntfy:latest
    restart: unless-stopped
    command: serve
    volumes:
      - ntfy_data:/var/lib/ntfy

  watchtower:
    image: containrrr/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 30

volumes:
  postgres_data:
  ntfy_data:
```

### Caddyfile Addition

```
tickethub.yourdomain.com {
    reverse_proxy tickethub:3000
}
```

---

## 6. Authentication & Users

### Strategy

TicketHub uses the same Microsoft Entra ID tenant as DocHub via NextAuth.js. Because both apps share the same `NEXTAUTH_SECRET`, sessions are compatible. A user logged into DocHub is effectively logged into TicketHub — the module switcher feels seamless.

### Role Model

```typescript
enum UserRole {
  GLOBAL_ADMIN    // Full access to both DocHub and TicketHub
  TICKETHUB_ADMIN // Full TicketHub access, read DocHub
  TECH            // Full ticket/time access, read clients/assets
  DISPATCHER      // Read all tickets, manage assignments/scheduling
  VIEWER          // Read-only access to both apps
}
```

### Module-Level Permissions

Each user has a `tickethubRole` field that controls their TicketHub access level independently of their DocHub role. A DocHub admin is not automatically a TicketHub admin.

---

## 7. Module Switcher — DocHub ↔ TicketHub

### Concept

Both apps show a subtle module switcher in the top of the sidebar — a pill or toggle with the two app names. Clicking switches to the other subdomain. The active app is visually highlighted using its accent color.

### Visual Design

```
┌─────────────────────────┐
│  [DocHub] [TicketHub]   │  ← module switcher pill
│                         │
│  ... nav items ...      │
└─────────────────────────┘
```

- DocHub accent: its existing color (to be confirmed from layout files)
- TicketHub accent: **amber/orange** `#F97316` — signals "active/operational" vs DocHub's "documentation/reference" feel
- Module switcher uses both accent colors as visual anchors

### Implementation

Both apps render the switcher in their root layout. It's a simple `<a>` tag pointing to the other subdomain — no complex state management needed. The Entra ID session persists across subdomains within the same tenant.

---

## 8. Data Model — Complete Schema Design

### Design Principles

1. Design for the Charge model first — everything else wraps around it
2. Never rename or delete columns after first migration — additive only
3. All monetary values stored as integers (cents) to avoid floating point errors
4. Every table has `createdAt`, `updatedAt`, `createdById`
5. Soft deletes where data has audit/billing significance
6. Clear model namespacing — no name conflicts with DocHub models

### Core Models

```prisma
// ─── CLIENTS ──────────────────────────────────────────────────────────────

model TH_Client {
  id              String   @id @default(cuid())
  name            String
  shortCode       String?  @unique        // e.g. "ACME" for ticket prefixes
  internalNotes   String?                 // "Always call John, never front desk"
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  contacts        TH_Contact[]
  sites           TH_Site[]
  contracts       TH_Contract[]
  tickets         TH_Ticket[]
  assets          TH_Asset[]
  invoices        TH_Invoice[]

  @@map("th_clients")
}

model TH_Contact {
  id              String   @id @default(cuid())
  clientId        String
  client          TH_Client @relation(fields: [clientId], references: [id])
  firstName       String
  lastName        String
  email           String?
  phone           String?
  jobTitle        String?
  isPrimary       Boolean  @default(false)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tickets         TH_Ticket[]

  @@map("th_contacts")
}

model TH_Site {
  id              String   @id @default(cuid())
  clientId        String
  client          TH_Client @relation(fields: [clientId], references: [id])
  name            String
  address         String?
  city            String?
  state           String?
  zip             String?
  country         String   @default("US")
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tickets         TH_Ticket[]

  @@map("th_sites")
}

// ─── CONTRACTS ────────────────────────────────────────────────────────────

enum TH_ContractType {
  GLOBAL          // Auto-created default contract, no expiry, no cap
  BLOCK_HOURS     // Prepaid block of hours
  RECURRING       // Monthly flat fee (managed services)
  TIME_AND_MATERIAL // Bill as-incurred
  PROJECT         // Fixed scope/price
}

enum TH_ContractStatus {
  ACTIVE
  EXPIRED
  CANCELLED
  PENDING
}

model TH_Contract {
  id              String              @id @default(cuid())
  clientId        String
  client          TH_Client           @relation(fields: [clientId], references: [id])
  name            String
  type            TH_ContractType     @default(GLOBAL)
  status          TH_ContractStatus   @default(ACTIVE)
  startDate       DateTime?
  endDate         DateTime?
  monthlyFee      Int?                // cents — for RECURRING contracts
  blockHours      Float?              // for BLOCK_HOURS contracts
  blockHoursUsed  Float               @default(0)
  notes           String?
  isGlobal        Boolean             @default(false)  // auto-created default
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  priceExceptions TH_ContractPriceException[]
  charges         TH_Charge[]
  tickets         TH_Ticket[]

  @@map("th_contracts")
}

model TH_ContractPriceException {
  id              String      @id @default(cuid())
  contractId      String
  contract        TH_Contract @relation(fields: [contractId], references: [id])
  itemId          String
  item            TH_Item     @relation(fields: [itemId], references: [id])
  priceOverride   Int         // cents per unit/hour
  createdAt       DateTime    @default(now())

  @@map("th_contract_price_exceptions")
}

// ─── ITEMS (CATALOG) ──────────────────────────────────────────────────────

enum TH_ItemType {
  LABOR           // Hourly or fixed labor charge
  PART            // Physical part or product
  EXPENSE         // Expense (fuel, travel, etc.)
  LICENSE         // Software license
  CONTRACT_FEE    // Monthly contract fee line item
}

model TH_Item {
  id              String      @id @default(cuid())
  name            String
  code            String?     @unique
  type            TH_ItemType
  defaultPrice    Int         // cents
  costPrice       Int?        // cents — for parts markup calculation
  taxable         Boolean     @default(true)
  accountCode     String?     // QuickBooks/Xero chart of accounts code
  isActive        Boolean     @default(true)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  charges         TH_Charge[]
  priceExceptions TH_ContractPriceException[]

  @@map("th_items")
}

// ─── CHARGES (THE BILLING BACKBONE) ───────────────────────────────────────

enum TH_ChargeStatus {
  NOT_BILLABLE    // Will not appear on invoice
  BILLABLE        // Ready to be invoiced
  INVOICED        // Included on an invoice
  LOCKED          // Invoice sent — read-only
}

enum TH_ChargeType {
  LABOR
  PART
  EXPENSE
  CONTRACT_FEE
}

model TH_Charge {
  id              String          @id @default(cuid())
  ticketId        String?
  ticket          TH_Ticket?      @relation(fields: [ticketId], references: [id])
  contractId      String
  contract        TH_Contract     @relation(fields: [contractId], references: [id])
  itemId          String
  item            TH_Item         @relation(fields: [itemId], references: [id])
  technicianId    String?
  technician      TH_User?        @relation(fields: [technicianId], references: [id])
  invoiceId       String?
  invoice         TH_Invoice?     @relation(fields: [invoiceId], references: [id])

  type            TH_ChargeType
  status          TH_ChargeStatus @default(BILLABLE)
  description     String?

  // Time tracking — stored separately to support different billing rules
  timeSpentMinutes   Int?         // Actual time worked
  timeChargedMinutes Int?         // Billed time (after rounding/minimums)

  quantity        Float           @default(1)
  unitPrice       Int             // cents — resolved at time of charge creation
  totalPrice      Int             // cents — quantity × unitPrice

  workDate        DateTime        @default(now())
  isBillable      Boolean         @default(true)

  // QuickBooks/Xero reference — populated when invoiced and synced
  externalRef     String?

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@map("th_charges")
}

// ─── TICKETS ──────────────────────────────────────────────────────────────

enum TH_TicketStatus {
  NEW
  OPEN
  IN_PROGRESS
  WAITING_CUSTOMER
  WAITING_THIRD_PARTY
  RESOLVED
  CLOSED
  CANCELLED
}

enum TH_TicketPriority {
  URGENT
  HIGH
  MEDIUM
  LOW
}

enum TH_TicketType {
  INCIDENT
  SERVICE_REQUEST
  PROBLEM
  CHANGE
  MAINTENANCE
  INTERNAL
}

model TH_Ticket {
  id              String              @id @default(cuid())
  ticketNumber    Int                 @unique @default(autoincrement())
  clientId        String
  client          TH_Client           @relation(fields: [clientId], references: [id])
  contactId       String?
  contact         TH_Contact?         @relation(fields: [contactId], references: [id])
  siteId          String?
  site            TH_Site?            @relation(fields: [siteId], references: [id])
  contractId      String?
  contract        TH_Contract?        @relation(fields: [contractId], references: [id])
  assetId         String?
  asset           TH_Asset?           @relation(fields: [assetId], references: [id])
  assignedToId    String?
  assignedTo      TH_User?            @relation("AssignedTickets", fields: [assignedToId], references: [id])
  createdById     String
  createdBy       TH_User             @relation("CreatedTickets", fields: [createdById], references: [id])

  title           String
  description     String?
  status          TH_TicketStatus     @default(NEW)
  priority        TH_TicketPriority   @default(MEDIUM)
  type            TH_TicketType       @default(INCIDENT)
  board           String?             // "Help Desk", "Managed Services", etc.

  // SLA tracking
  slaResponseDue  DateTime?
  slaResolveDue   DateTime?
  slaBreached     Boolean             @default(false)
  slaPausedAt     DateTime?           // null = running, set = paused

  // Read/unread tracking (RangerMSP pattern)
  isUnread        Boolean             @default(false)
  lastClientReply DateTime?

  // Estimated work duration (for dispatcher scheduling)
  estimatedMinutes Int?

  // Checklist items (to-do → charge conversion)
  // Stored as JSON for flexibility
  checklist       Json?

  closedAt        DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  comments        TH_TicketComment[]
  charges         TH_Charge[]
  attachments     TH_Attachment[]
  timeline        TH_TicketEvent[]
  parts           TH_TicketPart[]
  signatures      TH_Signature[]
  tags            TH_TicketTag[]

  @@map("th_tickets")
}

model TH_TicketComment {
  id              String    @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket @relation(fields: [ticketId], references: [id])
  authorId        String
  author          TH_User   @relation(fields: [authorId], references: [id])
  body            String
  isInternal      Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("th_ticket_comments")
}

model TH_TicketEvent {
  id              String    @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket @relation(fields: [ticketId], references: [id])
  userId          String?
  user            TH_User?  @relation(fields: [userId], references: [id])
  type            String    // "STATUS_CHANGE", "ASSIGNED", "CHARGE_ADDED", etc.
  data            Json?     // contextual data for the event
  createdAt       DateTime  @default(now())

  @@map("th_ticket_events")
}

model TH_TicketTag {
  id              String    @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket @relation(fields: [ticketId], references: [id])
  tag             String

  @@unique([ticketId, tag])
  @@map("th_ticket_tags")
}

// ─── PARTS (PROCUREMENT) ──────────────────────────────────────────────────

enum TH_PartStatus {
  PENDING_ORDER
  ORDERED
  RECEIVED
  INSTALLED
  RETURNED
}

model TH_TicketPart {
  id              String        @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket     @relation(fields: [ticketId], references: [id])
  addedById       String
  addedBy         TH_User       @relation(fields: [addedById], references: [id])

  // Scraped from Amazon Business extension
  name            String
  asin            String?
  vendor          String?       @default("Amazon Business")
  vendorUrl       String?
  imageUrl        String?
  orderNumber     String?

  quantity        Int           @default(1)
  unitCost        Int           // cents — what we paid
  unitPrice       Int           // cents — what we charge client (with markup)
  status          TH_PartStatus @default(PENDING_ORDER)

  // Links to charge when invoiced
  chargeId        String?       @unique
  charge          TH_Charge?    @relation(fields: [chargeId], references: [id])

  // Chart of accounts mapping
  accountCode     String?

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@map("th_ticket_parts")
}

// ─── ASSETS ───────────────────────────────────────────────────────────────

model TH_Asset {
  id              String    @id @default(cuid())
  clientId        String
  client          TH_Client @relation(fields: [clientId], references: [id])
  name            String
  type            String?   // "Workstation", "Server", "Network Device", etc.
  make            String?
  model           String?
  serial          String?
  ipAddress       String?
  notes           String?
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tickets         TH_Ticket[]

  @@map("th_assets")
}

// ─── INVOICES ─────────────────────────────────────────────────────────────

enum TH_InvoiceStatus {
  DRAFT
  SENT
  VIEWED
  PAID
  OVERDUE
  VOID
}

model TH_Invoice {
  id              String            @id @default(cuid())
  invoiceNumber   Int               @unique @default(autoincrement())
  clientId        String
  client          TH_Client         @relation(fields: [clientId], references: [id])
  contractId      String?

  status          TH_InvoiceStatus  @default(DRAFT)
  issueDate       DateTime          @default(now())
  dueDate         DateTime?

  subtotal        Int               // cents
  taxAmount       Int               @default(0)  // cents
  totalAmount     Int               // cents

  notes           String?

  // External accounting system reference
  externalRef     String?           // QuickBooks/Xero invoice ID
  sentAt          DateTime?
  paidAt          DateTime?

  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  charges         TH_Charge[]
  attachments     TH_Attachment[]

  @@map("th_invoices")
}

// ─── FUEL RECEIPTS ────────────────────────────────────────────────────────

model TH_FuelReceipt {
  id              String    @id @default(cuid())
  submittedById   String
  submittedBy     TH_User   @relation(fields: [submittedById], references: [id])

  // AI-extracted fields
  date            DateTime?
  vendor          String?
  address         String?
  fuelType        String?
  gallons         Float?
  pricePerGallon  Float?
  totalAmount     Int?      // cents
  paymentMethod   String?
  vehicle         String?
  notes           String?

  // Receipt image stored as file attachment
  imageUrl        String?

  // Links to charge when expensed
  chargeId        String?   @unique
  charge          TH_Charge? @relation(fields: [chargeId], references: [id])

  // Chart of accounts mapping
  accountCode     String?   @default("Fuel & Vehicle Expense")

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("th_fuel_receipts")
}

// ─── SCHEDULING ───────────────────────────────────────────────────────────

model TH_Appointment {
  id              String    @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket @relation(fields: [ticketId], references: [id])
  technicianId    String
  technician      TH_User   @relation(fields: [technicianId], references: [id])

  scheduledStart  DateTime
  scheduledEnd    DateTime
  actualStart     DateTime?
  actualEnd       DateTime?

  notes           String?
  status          String    @default("SCHEDULED")  // SCHEDULED, EN_ROUTE, ON_SITE, COMPLETE

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("th_appointments")
}

// ─── USERS ────────────────────────────────────────────────────────────────

model TH_User {
  id              String      @id @default(cuid())
  entraId         String      @unique   // Entra ID object ID
  email           String      @unique
  name            String
  role            String      @default("TECH")
  hourlyRate      Int?        // cents — used in charge price resolution
  isActive        Boolean     @default(true)

  // Per-user integration tokens (encrypted)
  togglToken      String?
  todoistToken    String?
  pushoverToken   String?
  ntfyTopic       String?

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  assignedTickets   TH_Ticket[]         @relation("AssignedTickets")
  createdTickets    TH_Ticket[]         @relation("CreatedTickets")
  charges           TH_Charge[]
  comments          TH_TicketComment[]
  appointments      TH_Appointment[]
  fuelReceipts      TH_FuelReceipt[]
  ticketEvents      TH_TicketEvent[]
  parts             TH_TicketPart[]

  @@map("th_users")
}

// ─── ATTACHMENTS & SIGNATURES ─────────────────────────────────────────────

model TH_Attachment {
  id              String      @id @default(cuid())
  ticketId        String?
  ticket          TH_Ticket?  @relation(fields: [ticketId], references: [id])
  invoiceId       String?
  invoice         TH_Invoice? @relation(fields: [invoiceId], references: [id])
  uploadedById    String
  filename        String
  fileUrl         String
  mimeType        String
  sizeBytes       Int
  createdAt       DateTime    @default(now())

  @@map("th_attachments")
}

model TH_Signature {
  id              String    @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket @relation(fields: [ticketId], references: [id])
  signedByName    String
  signatureUrl    String    // stored as image
  gpsLat          Float?
  gpsLng          Float?
  createdAt       DateTime  @default(now())

  @@map("th_signatures")
}

// ─── OFFLINE SYNC QUEUE ───────────────────────────────────────────────────

model TH_SyncQueue {
  id              String    @id @default(cuid())
  userId          String
  type            String    // "ADD_COMMENT", "LOG_TIME", "UPDATE_STATUS", etc.
  entityType      String    // "TICKET", "CHARGE", etc.
  entityId        String?
  payload         Json
  status          String    @default("PENDING")  // PENDING, SYNCED, FAILED
  retryCount      Int       @default(0)
  error           String?
  createdAt       DateTime  @default(now())
  syncedAt        DateTime?

  @@map("th_sync_queue")
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────

model TH_KBArticle {
  id              String    @id @default(cuid())
  title           String
  body            String
  tags            String[]
  isPublic        Boolean   @default(false)
  sourceTicketId  String?   // if converted from resolved ticket
  authorId        String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("th_kb_articles")
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────

model TH_Notification {
  id              String    @id @default(cuid())
  userId          String
  type            String
  title           String
  body            String
  isRead          Boolean   @default(false)
  data            Json?
  createdAt       DateTime  @default(now())
  readAt          DateTime?

  @@map("th_notifications")
}
```

---

## 9. Feature Specification — Phase by Phase

### Phase 1 — Core Ticketing Foundation ✅
*Goal: A working ticketing system a tech can use every day*

- [x] Client management (CRUD, contacts, sites)
- [x] Global System Contract auto-creation on client creation
- [x] Ticket CRUD with all statuses and priorities
- [x] Ticket detail page (three-panel desktop, tabbed mobile)
- [x] Ticket queue with filtering, sorting, saved views
- [x] Comments — public and internal notes
- [x] File/photo attachments on tickets
- [x] Ticket timeline / audit log
- [x] Unread ticket indicators (bold + envelope icon)
- [x] Client context injection on new ticket (internal notes, open tickets)
- [x] User management and role assignment
- [x] Basic dashboard (tech view: my queue, manager view: team overview)
- [x] SLA policy configuration and countdown timers
- [~] Ticket tagging — *schema exists (TH_TicketTag), no UI to add/remove/filter by tags*

### Phase 2 — Time, Billing & Parts ✅
*Goal: Complete the ticket → invoice → email flow*

- [x] Item catalog (labor types, parts, expenses)
- [x] Charge model — full lifecycle (NOT_BILLABLE → BILLABLE → INVOICED → LOCKED)
- [x] Quick Charge pane on every ticket
- [x] Ticket timer — start/stop, persists across navigation (TimerBar + TimerControls)
- [x] Time Spent vs Time Charged as separate fields
- [x] Finance-blind tech logging with cascading price resolution (4-level waterfall in billing.ts)
- [x] Batch Invoice Wizard (per-client, per-contract, per-ticket)
- [x] Invoice preview and PDF generation (@react-pdf/renderer)
- [x] Invoice email to client from M365 (Graph API + PDF attachment)
- [x] Invoice delivery status tracking (sent/viewed/paid + pixel tracking)
- [x] Parts tracking on tickets (manual entry + part→charge conversion)
- [x] Contract management (block hours, recurring, T&M)
- [x] Block hours balance tracking (auto-incremented on charge creation)
- [x] To-do → Charge conversion (checklist items → LABOR charges)

### Phase 3 — Mobile & Offline ✅
*Goal: Field techs can work completely offline*

- [x] PWA manifest and service worker (next-pwa + Workbox background sync)
- [x] Offline queue with Dexie.js IndexedDB (3 tables: syncQueue, tickets, locallyStoppedTimers)
- [x] Background sync — flush queue on reconnect (exponential backoff, idempotency via clientOpId)
- [x] Optimistic UI for all field operations (pending comments store, sync-op-completed events)
- [x] Sync status indicator (persistent) (SyncStatusBadge.tsx, fixed bottom-right)
- [x] Mobile bottom tab navigation (MobileBottomBar.tsx, 5-tab)
- [~] Expandable FAB — *implemented as global nav (new ticket/client/invoice/search), not ticket-scoped actions (note/time/part/photo/status)*
- [x] Swipe gestures on ticket list (right=resolve, left=waiting customer)
- [x] Customer signature capture (canvas + GPS tagging)
- [~] Camera integration with GPS tagging — *camera capture works on mobile, GPS tagging only on signatures not photo attachments*
- [x] Voice-to-text in note fields (Web Speech API via useVoiceInput hook)
- [x] Push notifications (ntfy + Pushover) (mode-aware: ON_CALL/WORKING/OFF_DUTY)
- [x] Notification preference management per user (mode, ntfyTopic, pushoverToken)

### Phase 4 — AI & Smart Features ✅
*Goal: AI that actually works reliably on narrow use cases*

- [x] Fuel receipt scanner (Claude vision API) (extracts vendor, date, line items, totals)
- [x] AI ticket classification (auto-routing with priority/type/category/assignee suggestion)
- [x] Natural language ticket search (Smart Ticket Search) (NL → Prisma filters)
- [x] AI suggested resolution steps from ticket history (similar resolved ticket lookup)
- [x] AI-assisted report builder (natural language → query) (tickets or summary groupBy)
- [ ] Ticket → Knowledge Base one-click conversion — *not implemented, no TH_KBArticle model in schema*
- [x] AI-powered "thank you" detection on closed tickets (pattern shortcircuit + Claude fallback)

### Phase 5 — Integrations & Extensions
*Goal: TicketHub connects to the rest of the MSP stack*

- [x] Browser Extension — Amazon Business parts scraper (extension-parts/ directory, content script + popup, POSTs to /api/tickets/:id/parts)
- [~] ~~Browser Extension — Invoice/receipt capture from email~~ — *dropped: fuel receipt scanner + M365 inbound email pipeline cover the core workflows*
- [x] QuickBooks integration (invoice sync, chart of accounts) (OAuth flow + invoice push)
- [~] ~~Xero integration~~ — *dropped: PCC2K uses QuickBooks, not Xero*
- [x] Microsoft 365 email → ticket creation (webhook) (Graph subscriptions + auto-renewal cron)
- [x] ConnectWise RMM → ticket creation (webhook + secret validation + severity→priority mapping)
- [~] ~~NinjaOne RMM → ticket creation~~ — *dropped: PCC2K does not use NinjaOne*
- [x] Toggl per-user sync (timer start/stop syncs to Toggl via API token, fire-and-forget)
- [x] Todoist task creation from tickets ("Create Todoist Task" button on ticket detail, per-user API token)
- [~] ~~SyncroMSP asset sync~~ — *dropped: assets live in DocHub, not TicketHub. Tickets link to DocHub assets via cross-app URL. Syncro migration tool exists for one-time data import.*
- [x] Amazon PA-API product lookup (search + ASIN lookup with caching)

### Phase 6 — Reporting & Analytics ✅
*Goal: Data-driven MSP operations*

- [x] Tech performance dashboard (tickets closed, resolution time, utilization + CSV)
- [x] SLA compliance reports (met/breached/at-risk by priority and client + CSV)
- [x] Profitability by client / contract / tech (revenue, labor cost, parts cost, margin + CSV)
- [x] Ticket volume trends (inflow vs resolution) (weekly/monthly granularity + CSV)
- [x] Time to first response tracking (embedded in volume trends report)
- [x] Client-facing monthly reports (QBR-ready) (client picker + date range + summary cards + PDF export)
- [x] Custom report builder (AI-powered natural language → Prisma queries)
- [x] Export to CSV (all standard reports have CSV export buttons)

### Phase 7 — Dispatch Board & Scheduling
*Goal: A visual dispatch board that turns unscheduled tickets into scheduled, billable appointments*

**Design rationale:** Researched HaloPSA, RangerMSP, and Kaseya/Autotask PSA dispatch modules. All three converge on a split-pane layout (unscheduled ticket queue + tech timeline grid) with drag-and-drop as the core interaction. RangerMSP's key architectural insight applies here: **appointments are scheduling artifacts, Charges are billing artifacts** — keep them decoupled but convertible. TicketHub already has the Charge backbone; the scheduler creates appointments that can spawn Charges on completion.

#### 7.1 — Dispatch Board Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [◀ Prev Week]  Apr 14 – Apr 20, 2026  [Next Week ▶]   [Today]       │
│                                                                         │
│  ┌──────────────┐  ┌────────────────────────────────────────────────┐  │
│  │ UNSCHEDULED  │  │  Mon 4/14    │  Tue 4/15    │  Wed 4/16  ...  │  │
│  │ TICKETS      │  │ Mike │ Josh  │ Mike │ Josh  │ Mike │ Josh     │  │
│  │              │  ├──────┼───────┼──────┼───────┼──────┼──────    │  │
│  │ ┌──────────┐ │  │ 8:00 │       │      │       │      │         │  │
│  │ │ #1042    │ │  │ 8:15 │       │      │       │      │         │  │
│  │ │ Printer  │ │  │ 8:30 ████   │      │       │      │         │  │
│  │ │ ⚡ HIGH  │ │  │ 8:45 ████   │      │ ████  │      │         │  │
│  │ │ ACME Co  │ │  │ 9:00 ████   │      │ ████  │      │         │  │
│  │ │ ~45 min  │ │  │ 9:15 ████   │      │ ████  │      │         │  │
│  │ └──────────┘ │  │ 9:30 │       │      │ ████  │      │         │  │
│  │ ┌──────────┐ │  │ 9:45 │       │      │       │      │         │  │
│  │ │ #1038    │ │  │10:00 │       │ ████ │       │      │         │  │
│  │ │ Network  │ │  │ ...  │       │ ████ │       │      │         │  │
│  │ │ 🔴 URGENT│ │  │      │       │      │       │      │         │  │
│  │ │ City Gov │ │  │      │       │      │       │      │         │  │
│  │ │ ~2 hrs   │ │  │      │       │      │       │      │         │  │
│  │ └──────────┘ │  │      │       │      │       │      │         │  │
│  │              │  │      │       │      │       │      │         │  │
│  │  ... more    │  │      │       │      │       │      │         │  │
│  └──────────────┘  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- [ ] Split-pane layout: unscheduled ticket queue (left 280px) + tech calendar grid (right, scrollable)
- [ ] **Week navigation**: prev/next week buttons + "Today" jump. 7-day work week (Mon–Sun) always visible
- [ ] **1 column per tech per day**: small MSP = 2–5 techs. Each day section has N sub-columns. Horizontal scroll for overflow
- [ ] **15-minute row increments**: rows from business hours start (default 7:00 AM) to end (default 6:00 PM). Configurable in Settings
- [ ] **Drag-and-drop**: drag ticket card from queue → drop on tech column at desired time slot. Creates appointment + assigns tech in one action
- [ ] **Resize appointments**: drag bottom edge of appointment block to change duration (snaps to 15-min)
- [ ] **Move appointments**: drag existing appointment to different time/tech/day to reschedule
- [ ] **Day focus view**: click a day header to expand that day full-width (easier for heavy dispatch days)

#### 7.2 — Unscheduled Ticket Queue (Left Panel)

- [ ] Shows all tickets with status NEW, OPEN, or IN_PROGRESS that have no future appointments
- [ ] Each card shows: ticket number, title (truncated), priority badge, client name, estimated duration (from `estimatedMinutes`)
- [ ] Sortable by: priority (default), SLA due, created date, client
- [ ] Filterable by: client, priority, type, board
- [ ] Search box for quick ticket lookup
- [ ] Ticket count badge at panel header
- [ ] Cards are **draggable** — cursor changes on hover, ghost preview while dragging

#### 7.3 — Appointment Blocks (Calendar Grid)

- [ ] Color-coded by ticket priority (same palette as ticket list: red/orange/blue/gray)
- [ ] Shows: ticket number, client short code, title (truncated to fit block height)
- [ ] Status indicator on block: 🔵 SCHEDULED → 🚗 EN_ROUTE → 🟢 ON_SITE → ✅ COMPLETE → ❌ CANCELLED
- [ ] Click appointment block → popover with: full ticket title, client, site address, notes, status controls, "Open Ticket" link
- [ ] Right-click context menu: Reschedule, Cancel, Mark Complete, Open Ticket, Add Another Tech
- [ ] Completed blocks become muted/semi-transparent
- [ ] Overlapping appointments (same tech, overlapping times) shown with a red conflict indicator

#### 7.4 — Multi-Tech Dispatch

When multiple techs are dispatched to the same ticket:

- [ ] Each tech gets their **own TH_Appointment record** linked to the same ticket (same pattern as HaloPSA/RangerMSP/Autotask)
- [ ] "Add Another Tech" action on any appointment → creates a second appointment for the same ticket at the same time on a different tech's column
- [ ] Visual link: appointments for the same ticket on different techs show a subtle connector line or matching accent stripe
- [ ] On ticket detail page, all appointments are listed with per-tech status tracking

#### 7.5 — Appointment → Charge Billing

Following RangerMSP's pattern: appointments are scheduling artifacts, Charges are billing artifacts. They are linked but independent.

- [ ] **On completion**: when an appointment is marked COMPLETE, prompt: "Log time as charge?" with pre-filled duration (actualEnd − actualStart, or scheduledEnd − scheduledStart if no actuals)
- [ ] **Per-tech billing**: each tech's appointment creates its **own Charge** independently. Two techs on-site for 2 hours = two separate LABOR charges
- [ ] **15-min rounding**: charged time rounds up to nearest 15-min increment (configurable: 15/30/60 min). Rounding rule stored in Settings
- [ ] **Auto-charge option**: Settings toggle for "auto-create charge on appointment completion" (skip the prompt). Charge created as BILLABLE with resolved price from cascading waterfall
- [ ] **Travel time**: optional travel duration field on appointment. Can generate a separate NOT_BILLABLE charge (or BILLABLE if contract allows travel billing)
- [ ] **No-show / cancelled**: cancelled appointments don't generate charges. Dispatcher can mark CANCELLED with a reason

#### 7.6 — Tech Availability & Working Hours

- [ ] Per-tech working hours configured in Settings → Users (e.g., Mon–Fri 8:00–17:00)
- [ ] Non-working hours grayed out on the dispatch grid (visible but not droppable)
- [ ] Utilization indicator per tech per day: small bar or percentage showing booked vs available hours
- [ ] Overbooked warning: if appointments exceed available hours, tech column header turns amber/red

#### 7.7 — Appointment Status Flow

```
SCHEDULED → EN_ROUTE → ON_SITE → COMPLETE
    ↓                               ↓
CANCELLED                    (spawn Charge)
```

- [ ] Status transitions via: appointment popover buttons, right-click menu, or mobile swipe actions
- [ ] EN_ROUTE and ON_SITE timestamps recorded as `actualStart` approximations
- [ ] ON_SITE → COMPLETE records `actualEnd`
- [ ] Status changes fire push notifications to the assigned tech (and dispatcher if configured)

#### 7.8 — Schema Changes Required

```prisma
// Updated TH_Appointment model
model TH_Appointment {
  id              String    @id @default(cuid())
  ticketId        String
  ticket          TH_Ticket @relation(fields: [ticketId], references: [id])
  technicianId    String
  technician      TH_User   @relation(fields: [technicianId], references: [id])
  createdById     String
  createdBy       TH_User   @relation("CreatedAppointments", fields: [createdById], references: [id])

  scheduledStart  DateTime
  scheduledEnd    DateTime
  actualStart     DateTime?
  actualEnd       DateTime?
  travelMinutes   Int?              // optional travel time

  notes           String?
  status          TH_AppointmentStatus @default(SCHEDULED)

  // Link to charge created on completion
  chargeId        String?  @unique
  charge          TH_Charge? @relation(fields: [chargeId], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([technicianId, scheduledStart])
  @@index([ticketId])
  @@map("th_appointments")
}

enum TH_AppointmentStatus {
  SCHEDULED
  EN_ROUTE
  ON_SITE
  COMPLETE
  CANCELLED
}

// New: per-tech working hours
model TH_WorkingHours {
  id            String  @id @default(cuid())
  userId        String
  user          TH_User @relation(fields: [userId], references: [id])
  dayOfWeek     Int     // 0=Sun, 1=Mon, ..., 6=Sat
  startTime     String  // "08:00" (HH:mm)
  endTime       String  // "17:00" (HH:mm)
  isWorkingDay  Boolean @default(true)

  @@unique([userId, dayOfWeek])
  @@map("th_working_hours")
}
```

#### 7.9 — Mobile Dispatch View

- [ ] Single-day view only on mobile (no room for week grid)
- [ ] Vertical scroll through the day's 15-min slots
- [ ] Swipe between techs (horizontal) or between days (tabs at top)
- [ ] Tap empty slot → "Schedule ticket" picker (replaces drag-and-drop)
- [ ] Appointment cards show status + tap to transition (EN_ROUTE → ON_SITE → COMPLETE)
- [ ] "My Day" default view: shows only the logged-in tech's schedule for today

#### Checklist Summary

- [ ] Dispatch board page (`/schedule`)
- [ ] Unscheduled ticket queue panel with drag-and-drop
- [ ] Tech column grid with 15-min increments, 7-day week view
- [ ] Week navigation (prev/next/today)
- [ ] Day focus expand view
- [ ] Appointment CRUD (create via drag, resize, move, cancel)
- [ ] Multi-tech dispatch (same ticket, separate appointments)
- [ ] Appointment status flow (SCHEDULED → EN_ROUTE → ON_SITE → COMPLETE)
- [ ] Appointment → Charge conversion on completion (per-tech, 15-min rounding)
- [ ] Auto-charge toggle in Settings
- [ ] Travel time field (optional separate charge)
- [ ] Tech working hours configuration
- [ ] Availability/utilization indicators
- [ ] Overbooked conflict warnings
- [ ] Mobile single-day view with swipe navigation
- [ ] Push notifications on status transitions

---

## 10. UI/UX Design System

### Design Philosophy

**Linear's interaction quality + ServiceTitan's field-tech context + Jobber's quote-to-cash simplicity.**

Every design decision should be measured against three questions:
1. How many clicks/taps does this take?
2. Does this work on a phone in bright sunlight with one hand?
3. Would a new tech understand this on day one?

### Color System

```css
/* TicketHub Design Tokens */

/* Brand */
--th-accent:          #F97316;  /* Amber/Orange — TicketHub identity */
--th-accent-hover:    #EA6C0A;
--th-accent-muted:    #FED7AA;  /* Light amber for backgrounds */

/* Backgrounds (dark theme matching DocHub) */
--th-bg-base:         #0a0f1a;  /* Darkest — page background */
--th-bg-surface:      #0d1526;  /* Cards, panels */
--th-bg-elevated:     #1e293b;  /* Hover states, elevated surfaces */
--th-border:          #1e3a5f;  /* Subtle borders */

/* Text */
--th-text-primary:    #e2e8f0;
--th-text-secondary:  #94a3b8;
--th-text-muted:      #475569;

/* Status Colors */
--th-new:             #3B82F6;  /* Blue */
--th-open:            #2563EB;  /* Darker blue */
--th-in-progress:     #F59E0B;  /* Amber */
--th-waiting:         #8B5CF6;  /* Purple */
--th-resolved:        #10B981;  /* Green */
--th-closed:          #6B7280;  /* Gray */
--th-cancelled:       #374151;  /* Dark gray */

/* Priority Colors */
--th-urgent:          #EF4444;  /* Red */
--th-high:            #F97316;  /* Orange (same as accent) */
--th-medium:          #3B82F6;  /* Blue */
--th-low:             #6B7280;  /* Gray */

/* SLA Health */
--th-sla-ok:          #10B981;  /* Green */
--th-sla-warning:     #F59E0B;  /* Amber — ≤25% remaining */
--th-sla-critical:    #EF4444;  /* Red — breached */
--th-sla-paused:      #6B7280;  /* Gray */
```

### Typography

```css
--th-font-mono:   'DM Mono', 'Courier New', monospace;  /* UI labels, IDs */
--th-font-sans:   'Inter', system-ui, sans-serif;        /* Body text */
```

### Spacing System

8px base grid. All spacing in multiples of 4 or 8.

### Component Specifications

**Ticket List Row (Desktop)**
```
Height: 48px
Columns: [Checkbox 40px] [Priority border 4px] [#ID 60px muted] 
         [Title flex] [Client 160px] [Assignee 32px avatar] 
         [SLA badge 80px] [Status badge 90px] [Updated 80px muted]
Hover: --th-bg-elevated background
```

**Ticket List Row (Mobile)**
```
Height: 64px
Layout: [Priority dot 8px] [Title + Client stacked] [SLA badge] [Status badge]
Touch target: minimum 44×44px
```

**Status Badge**
```
High emphasis (action needed): filled background + white text + icon
Low emphasis (informational): outlined border + colored text + icon
Size: text-xs, px-2 py-0.5, rounded-full
```

**SLA Timer Badge**
```
States: ON_TRACK (green, "2d 14h"), AT_RISK (amber, "3h 20m"), 
        CRITICAL (red pulsing, "0h 45m"), BREACHED (red, "-2h 30m"), 
        PAUSED (gray, "PAUSED")
Updates: live every minute via useEffect interval
```

**Quick Charge Pane**
```
Position: sticky bottom of ticket detail, always visible
Fields: [Item selector dropdown] [Duration quick-picks: 15m 30m 1h 2h] 
        [Custom duration input] [Description text] [Add button]
Values persist between entries
"Advanced" link opens full charge form
```

**Sticky Bottom Action Bar (Mobile)**
```
Height: 56px
Background: --th-bg-elevated with top border
Actions (4 max): [📝 Note] [⏱️ Time] [🔧 Part] [Status pill]
Always visible regardless of scroll position
```

### Navigation Structure

**Desktop Sidebar (240px expanded, 64px collapsed)**
```
[Module Switcher: DocHub | TicketHub]
─────────────────────────────────────
[🏠] Dashboard
[🎫] Tickets          ← Primary — most used
[👥] Clients
[💻] Assets
[⏱️] Time & Billing
[📊] Reports
─────────────────────────────────────
[MY VIEWS]
  My Queue
  Unassigned
  SLA At Risk
  Recently Updated
─────────────────────────────────────
[📚] Knowledge Base
[📅] Schedule
[⛽] Fuel Receipts
─────────────────────────────────────
[⚙️] Settings          ← bottom, de-emphasized
[👤] Profile
```

**Mobile Bottom Tab Bar**
```
[🏠 Home] [🎫 Tickets] [➕ Create] [⏱️ Time] [⋯ More]
           ↑ default                ↑ FAB-style elevated
```

**Keyboard Shortcuts**
```
⌘K       Command palette (universal)
C        Create new ticket
N        Add note (when on ticket)
T        Log time (when on ticket)
S        Change status (when on ticket)
A        Assign (when on ticket)
/        Focus filter
J / K    Navigate up / down in list
Enter    Open selected item
Esc      Close panel / modal
[        Toggle sidebar
```

---

## 11. Mobile Strategy — PWA & Offline-First

### PWA Configuration

```json
// public/manifest.json
{
  "name": "TicketHub",
  "short_name": "TicketHub",
  "description": "MSP Ticketing & Operations",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0a0f1a",
  "theme_color": "#F97316",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Offline Queue Schema (Dexie.js)

```typescript
interface SyncOperation {
  id: string;
  type: 'ADD_COMMENT' | 'LOG_TIME' | 'UPDATE_STATUS' | 'ADD_PART' | 'ATTACH_PHOTO' | 'CAPTURE_SIGNATURE';
  entityType: 'TICKET' | 'CHARGE';
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  retryCount: number;
  error?: string;
}
```

### Sync Strategy

1. User performs action while offline → optimistic UI update → operation stored in IndexedDB
2. Connectivity returns → Background Sync API fires (Android) or app-foreground event fires (iOS)
3. Sync service processes queue in chronological order
4. Success → mark as synced, remove from queue
5. Conflict detected → show merge prompt for critical fields, last-write-wins for notes
6. Failure → increment retry count, show error indicator on affected ticket

### Connection Status Indicator

```
● All synced                    ← green dot
⟳ Syncing 3 changes...         ← amber dot, spinning
⚠ Offline — 5 changes pending  ← red dot, tap to see queue
```

---

## 12. Notification System

### Push Providers

- **ntfy.sh** (self-hosted Docker container) — routine notifications, internal team alerts
- **Pushover** — P1 critical alerts, SLA breaches, urgent escalations that need to break through Do Not Disturb

### Notification Modes (Per User)

```
ON_CALL    → All notifications real-time (all channels)
WORKING    → Assigned tickets + SLA warnings only
OFF_DUTY   → Critical P1 + SLA breaches only (Pushover only)
```

Auto-switch schedule configurable per user. Dispatcher can override individual tech to ON_CALL regardless of preference.

### SLA Escalation Matrix

| Stage | Trigger | Visual | ntfy | Pushover | Manager Alert |
|---|---|---|---|---|---|
| Gentle | 50% elapsed | Yellow badge | ✓ | — | — |
| Urgent | 75% elapsed | Orange badge | ✓ | — | — |
| Critical | 90% elapsed | Red pulsing | ✓ | ✓ | — |
| Breached | 100% elapsed | Red, negative timer | ✓ | ✓ | ✓ |
| Extended | +30min breach | — | ✓ | ✓ | ✓ escalation chain |

### Notification Types

```
TICKET_ASSIGNED       → Your ticket
TICKET_UPDATED        → Client replied (unread indicator)
TICKET_ESCALATED      → Moved to you from another tech
SLA_WARNING           → SLA milestone (see matrix above)
NEW_HIGH_PRIORITY     → Urgent/High ticket created
TIMER_REMINDER        → Running timer (>4hr reminder)
INVOICE_VIEWED        → Client opened invoice email
SYNC_COMPLETE         → Offline queue flushed
PART_ARRIVED          → (future) order tracking webhook
```

---

## 13. Browser Extensions

### Extension 1 — Amazon Business Parts Scraper (TicketHub)

**Purpose:** On Amazon Business product pages, scrape item details and attach to an open ticket as a part, then route to invoice and accounting.

**Runs on:** `business.amazon.com`

**Manifest permissions:** `activeTab`, `storage`, `identity`

**Flow:**
1. Tech browses Amazon Business for a part
2. Extension icon activates on product page
3. Popup shows scraped: product name, ASIN, price, image
4. Claude API classifies part type → suggests chart of accounts code and markup %
5. Tech selects open ticket from dropdown
6. Part added to ticket as `TH_TicketPart`
7. Charge created automatically (BILLABLE, with markup applied)
8. On ticket close → part flows to invoice

**AI Classification categories:** Hardware, Networking, Consumables, Software, Tools, Other

### Extension 2 — Invoice/Receipt Capture (TicketHub)

**Purpose:** On Gmail or Outlook Web, detect purchase confirmation emails and extract invoice data to route to TicketHub accounting.

**Runs on:** `mail.google.com`, `outlook.live.com`, `outlook.office.com`

**Flow:**
1. Extension detects purchase confirmation or invoice email
2. Claude reads email content and extracts: vendor, line items, amounts, order #, date
3. Tech confirms extracted data (editable form)
4. Assign to client + ticket (or mark as overhead)
5. Posted to correct chart of accounts
6. PDF attachment stored against ticket

### Extension 3 — License & Credential Capture (DocHub)

**Note:** This extension lives in the **DocHub repo**, not TicketHub.

**Purpose:** On vendor/supplier sites, scrape purchased license keys, credentials, and software details and save directly to a DocHub client's Licenses or Credentials tab.

**Runs on:** any vendor site + webmail

---

## 14. Integrations

### Microsoft 365 (Email → Ticket)

- Webhook-based mailbox monitoring
- Incoming email to support address → auto-creates ticket
- Reply to ticket notification → appended as comment
- Client matched by email domain → auto-linked to correct TH_Client
- Unknown sender from known domain → new TH_Contact created automatically

### QuickBooks / Xero

- OAuth per-company connection (stored in settings)
- Invoice push: TicketHub invoice → QB/Xero invoice
- Charge line items mapped via `accountCode` on TH_Item
- External reference stored on TH_Invoice for reconciliation
- Once pushed and synced, charges locked (status = LOCKED)
- Payment status sync: QB/Xero paid → TicketHub invoice marked PAID

### NinjaOne RMM

- Webhook from NinjaOne alert → POST to `/api/integrations/ninjarmm`
- Creates TH_Ticket with type=INCIDENT, source data in description
- Auto-assigns to on-call tech or configured default queue
- Alert resolution in NinjaOne → webhook to close ticket (optional)

### Toggl Track (Per-User, Optional)

- Each tech stores their own Toggl API token in their profile
- Two-way: Start timer in TicketHub → starts Toggl entry; Stop → syncs
- Pull Toggl entries → match to tickets by description/tag
- Phase 3 feature — don't block on this

### Todoist (Per-User, Optional)

- Each tech stores their own Todoist API token
- Create ticket → option to also create Todoist task
- Todoist task complete → webhook to resolve ticket
- Phase 3 feature

### ntfy.sh (Self-Hosted)

- Docker container on same host
- Per-user topic subscription: `tickethub-{userId}`
- POST to ntfy API for each notification event
- iOS/Android apps subscribe to their topic

### Pushover

- Per-user Pushover user key stored in profile (encrypted)
- Used only for critical/P1 notifications
- Priority levels: 0 (normal), 1 (high, bypass quiet hours), 2 (emergency, repeat)

---

## 15. AI Features

### Principle: Narrow and Reliable

Don't build ten AI features that sometimes work. Build four that work perfectly every time.

### Feature 1 — Fuel Receipt Scanner (Phase 1)

- User uploads/photographs a receipt
- POST image to `/api/ai/scan-receipt` → Claude vision API
- Returns structured JSON: date, vendor, fuel type, gallons, price/gallon, total, payment method
- Editable review form before saving
- Stores to TH_FuelReceipt, creates TH_Charge (EXPENSE type)

### Feature 2 — Ticket Classification (Phase 4)

- On ticket creation → POST title + description to `/api/ai/classify-ticket`
- Claude returns: suggested category (from 47 types), suggested priority, suggested assignee based on type
- Applied as suggestions — tech can override
- Routing automation can trigger based on classification

### Feature 3 — Smart Ticket Search (Phase 4)

- Natural language search across ticket history
- "Find tickets where the client couldn't connect to the VPN last month"
- Returns semantically similar tickets, not just keyword matches
- Also auto-surfaces similar tickets when creating a new one ("These 3 similar tickets were resolved before")

### Feature 4 — AI Report Builder (Phase 4)

- Manager types: "Show me all P1 tickets this quarter by client sorted by resolution time"
- Claude translates to Prisma query
- Results rendered as table + chart
- Validated against schema before execution (no arbitrary SQL)

### Feature 5 — "Thank You" Detection (Phase 4)

- When a closed ticket receives a new email reply
- Claude reads the reply and classifies: action required vs. thank-you/acknowledgement
- If thank-you → ticket stays closed, no alert
- If action required → ticket reopens, tech notified

---

## 16. Build Phases & Priorities

### Summary Priority Table

| Priority | Feature | Phase |
|---|---|---|
| 🔴 Must-Nail | Charges as billing backbone (schema) | 1 |
| 🔴 Must-Nail | Ticket CRUD + detail page | 1 |
| 🔴 Must-Nail | Client management + Global Contract | 1 |
| 🔴 Must-Nail | Quick Charge pane | 2 |
| 🔴 Must-Nail | Cascading price resolution | 2 |
| 🔴 Must-Nail | Mobile PWA + offline sync | 3 |
| 🔴 Must-Nail | Push notifications (ntfy + Pushover) | 3 |
| 🟠 High | Batch Invoice Wizard → email | 2 |
| 🟠 High | Time Spent vs Time Charged | 2 |
| 🟠 High | Unread ticket indicators | 1 |
| 🟠 High | Client context injection | 1 |
| 🟠 High | SLA timers + escalation | 1 |
| 🟠 High | Ticket → KB conversion | 4 |
| 🟠 High | Amazon Business extension | 5 |
| 🟠 High | M365 email → ticket | 5 |
| 🟠 High | QuickBooks/Xero sync | 5 |
| 🟡 Medium | Customer signature capture | 3 |
| 🟡 Medium | Fuel receipt scanner (AI) | 4 |
| 🟡 Medium | AI ticket classification | 4 |
| 🟡 Medium | NinjaOne integration | 5 |
| 🟡 Medium | Toggl + Todoist (per-user) | 5 |
| 🟢 Lower | AI report builder | 4 |
| 🟢 Lower | Community automation templates | 6 |
| 🟢 Lower | Client-facing portal | 6 |
| 🔴 Must-Nail | Dispatch board + drag-and-drop scheduling | 7 |
| 🔴 Must-Nail | Multi-tech dispatch with per-tech billing | 7 |
| 🟠 High | Appointment → Charge auto-conversion (15-min rounding) | 7 |
| 🟠 High | Tech working hours + utilization indicators | 7 |
| 🟡 Medium | Travel time tracking (separate charge) | 7 |
| 🟡 Medium | Mobile single-day dispatch view | 7 |

### What We Build First

Before writing any page or component code:

1. **Complete Prisma schema** — reviewed and finalized together
2. **Design token file** — colors, typography, spacing, all CSS variables
3. **Core shared components** — Button, Badge, Input, Modal, Table, Sidebar, TopBar
4. **Auth middleware** — Entra ID session, role checking, redirect logic

Then, in order:
1. Dashboard skeleton (layout proof)
2. Client list + detail
3. Ticket list (queue view)
4. Ticket detail (full three-panel)
5. Comment/note system
6. SLA timers
7. Charge + time tracking
8. Invoice wizard

---

## 17. Design Decisions Log

This section records every significant decision made during planning so future-us understands the "why."

| Decision | Chosen | Alternative | Reason |
|---|---|---|---|
| Repo | Separate | Monorepo | DocHub is in production, can't risk dev noise |
| Starting point | Clone DocHub skeleton | Scaffold from zero | Infrastructure is solved, save time |
| Database | Shared with DocHub | Separate DB | Same data, shared auth, simpler ops |
| Deployment | Same server, separate containers | Separate server | Scale not needed at 200 clients |
| Auth | Entra ID (shared tenant) | Separate auth | Single login, shared session across apps |
| Billing architecture | Charges as first-class entity | Time entries + separate billing | RangerMSP proves this is the right model |
| Mobile | PWA | React Native / Expo | Same codebase, no app store dependency, instant updates |
| Offline storage | Dexie.js (IndexedDB) | localStorage | Structured, queryable, handles photos |
| Notifications | ntfy (self-hosted) + Pushover | Firebase / Pusher | Self-hosted = no external dependency; Pushover = reliable critical alerts |
| Desktop nav | Left sidebar | Top nav | Sidebar scales better for dense MSP navigation |
| Mobile nav | Bottom tab bar | Hamburger menu | 40% faster task completion, thumb-accessible |
| Color system | Dark theme with amber accent | Light theme | Consistency with DocHub, server room readability |
| AI model | Claude Sonnet (same as DocHub) | GPT-4, Gemini | Already integrated, consistent behavior |
| Invoice amounts | Stored as cents (integers) | Floats/decimals | No floating point errors in financial calculations |
| Soft deletes | Yes, for tickets/charges/invoices | Hard delete | Audit trail, billing history must be preserved |
| Scheduler layout | Tech columns + 15-min rows, 7-day week | Gantt rows per tech (HaloPSA/Autotask style) | Columns match small-MSP reality (2–5 techs), week view shows full picture at a glance |
| Appointment vs Charge | Decoupled — appointment spawns charge on completion | Auto-merge into single time entry | RangerMSP pattern: scheduling ≠ billing. Allows no-shows, cancellations, and walk-in charges without scheduling |
| Multi-tech billing | Separate appointment + separate charge per tech | Single shared appointment | Each tech's time is independently billable with its own rounding and price resolution |
| Time rounding | 15-min increment rounding (configurable) | Exact minutes | Industry standard for MSP billing, matches contract expectations |

---

*This document is the source of truth for the TicketHub build. All significant decisions should be recorded in Section 17. All feature scope changes should be reflected in Section 9. Do not start building a feature without reading the relevant sections of this document first.*

*Last reviewed: April 2026*
