# TicketHub

**TicketHub** is a self-hosted MSP ticketing and operations platform built and maintained by PCC2K. It is a companion to [DocHub](https://github.com/michaelsaville/dochub), sharing the same database, authentication, and deployment infrastructure.

TicketHub centralises MSP field operations — ticket management, time tracking, parts procurement, billing, invoicing, and mobile field work — into a single fast, offline-capable web application.

---

## Features

| Area | What it does |
|---|---|
| **Tickets** | Full lifecycle — Incident, Service Request, Problem, Change with SLA tracking |
| **Time & Billing** | Charges as first-class entities, time tracking, cascading price resolution |
| **Invoicing** | Batch invoice wizard, PDF generation, M365 email delivery, QuickBooks/Xero sync |
| **Parts** | Amazon Business extension → ticket → charge → invoice |
| **Mobile** | PWA, offline-capable, signature capture, camera, voice-to-text |
| **AI** | Receipt scanning, ticket classification, smart search, report builder |
| **Notifications** | ntfy (self-hosted) + Pushover, SLA escalation matrix, per-user preferences |
| **Integrations** | NinjaOne, M365 email, QuickBooks, Xero, Toggl, Todoist |
| **Fuel Receipts** | AI-powered receipt scanner → expense charge → accounting |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router) |
| Language | TypeScript |
| Database | PostgreSQL 16 (shared with DocHub) |
| ORM | Prisma 6 |
| Auth | Microsoft Entra ID via NextAuth.js |
| Styling | Tailwind CSS |
| PWA | next-pwa |
| Offline | Dexie.js (IndexedDB) |
| AI | Anthropic Claude API |
| Notifications | ntfy.sh + Pushover |
| Reverse Proxy | Caddy 2 |
| Containers | Docker + Docker Compose |

---

## Quick Start

### Prerequisites

- Linux server with Docker and Docker Compose
- Domain pointing at the server
- Microsoft Entra ID app registration (can share DocHub's registration)
- Existing DocHub deployment (shared database)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/michaelsaville/tickethub.git
cd tickethub

# 2. Copy and edit environment file
cp .env.example .env
nano .env

# 3. Add tickethub block to your existing Caddyfile
# tickethub.yourdomain.com {
#     reverse_proxy tickethub:3000
# }

# 4. Add tickethub service to your docker-compose.yml
# See docker-compose.example.yml for the full configuration

# 5. Start the stack
docker compose up -d

# 6. First run — push schema to the shared database
docker compose exec tickethub npx prisma db push
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (same as DocHub) |
| `NEXTAUTH_URL` | Full public URL, e.g. `https://tickethub.example.com` |
| `NEXTAUTH_SECRET` | Same secret as DocHub — enables shared sessions |
| `AZURE_AD_CLIENT_ID` | Entra ID app client ID |
| `AZURE_AD_CLIENT_SECRET` | Entra ID app client secret |
| `AZURE_AD_TENANT_ID` | Entra ID tenant ID |
| `ANTHROPIC_API_KEY` | Claude API key for AI features |
| `NTFY_URL` | ntfy server URL, e.g. `https://ntfy.yourdomain.com` |
| `PUSHOVER_APP_TOKEN` | Pushover application token for critical alerts |
| `QUICKBOOKS_CLIENT_ID` | QuickBooks OAuth client ID |
| `QUICKBOOKS_CLIENT_SECRET` | QuickBooks OAuth client secret |
| `CRON_SECRET` | Bearer token for cron endpoints |

---

## Development

```bash
cd tickethub
cp .env.example .env.local   # fill in your local values
npm install
npx prisma db push
npm run dev
```

Dev server runs on `http://localhost:3001` (3000 reserved for DocHub locally).

### Schema Changes

```bash
# After editing prisma/schema.prisma
DATABASE_URL="postgresql://user:pass@localhost:5432/dochub" npx prisma db push
```

---

## Planning

See [PLANNING.md](./PLANNING.md) for the complete architecture, feature specification, data model, UI/UX design system, and build roadmap.

---

## Relationship to DocHub

TicketHub and DocHub are separate applications that share:
- The same PostgreSQL database (separate table namespaces)
- The same Entra ID authentication tenant
- The same `NEXTAUTH_SECRET` (enabling seamless session sharing)
- The same Docker host and Caddy reverse proxy

They are accessed via separate subdomains and have a module switcher in their respective navigation bars for seamless switching.

---

## License

Internal tooling — PCC2K. Not licensed for external distribution.
