# PayChase

**Upload your invoices. See who still owes you money.**

PayChase helps freelancers, agencies, and small B2B businesses find overdue invoices, prioritize what to chase, and generate professional follow-ups.

It is **not** accounting software. V1 focuses on:

1. Upload / extract invoices  
2. Show outstanding & overdue money  
3. Prioritize today's chase list  
4. Generate → copy → mark sent reminders  
5. Track promises, disputes, payments, and timeline  

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Hono API (`/api/*`)
- PostgreSQL + Prisma
- Phumi Core for shared identity/tenancy sync (server-to-server)
- TanStack Query + Zod
- OpenAI for extraction & follow-ups (optional; heuristic fallback when no key)
- Invoice file storage: Cloudflare R2 in production; local `./uploads` for `pnpm dev` only

## Quick start

```bash
# 1) Install
pnpm install

# 2) Env
cp .env.example .env
# Optional: set OPENAI_API_KEY for real PDF/image extraction
# Required for signup: CORE_API_URL, CORE_APP_ID, CORE_REQUEST_SECRET (server-only)

# 3) Start Postgres, push schema, seed demo data
pnpm db:setup

# 4) Run
pnpm dev
```

Open [http://localhost:3002](http://localhost:3002) (or the next free port).

Demo login: `demo@paychase.app` / `paychase`

> Requires Docker Desktop. Postgres runs locally via `docker-compose.yml`
> (`postgresql://paychase:paychase@localhost:5433/paychase`).

## Demo seed highlights

| Customer         | Situation                         |
|------------------|-----------------------------------|
| ABC Logistics    | $1,200 · 21 days overdue          |
| Dara Studio      | $850 · 12 days overdue            |
| Mekong Supplies  | $2,400 · payment promised tomorrow|
| Sovan Agency     | $600 · due in 3 days              |

Several thousand dollars outstanding on first load.

## Identity and tenancy (Phumi Core)

PayChase keeps end-user login local (email/password + `pc_session` cookie). On signup, login, and profile updates, the server syncs users and workspaces to [Phumi Core](https://github.com/vathanakkongsothy/phumi-core) over a signed HMAC API:

- PayChase `User.id` → Core user `externalId`
- PayChase `Workspace.id` → Core tenant `externalId`
- Invoice and customer records stay in PayChase

If Core is unreachable during **signup** or **workspace creation**, the request fails with a clear error. **Login** retries sync in the background so existing users are not locked out. Core credentials (`CORE_REQUEST_SECRET`) are server-only and must never be exposed via `NEXT_PUBLIC_*` variables.

## Core flows

- **Auth** `/login` `/signup` — email/password sessions; profile at `/settings`
- **Upload** `/invoices/upload` — multi PDF/PNG/JPG → extract → review → save
- **Dashboard** `/dashboard` — outstanding / overdue / due this week / chase list
- **Invoice detail** `/invoices/[id]` — generate follow-up, copy, mark sent, promise, dispute, paid
- **Customers** `/customers` — aggregated balances + payment behavior
- **Reports** `/reports` — aging buckets + recovery metrics

## Domain layout

```text
src/server/
  auth/               # signup, login, sessions, profile
  core/               # Phumi Core signed client + identity sync
  ai/                 # replaceable AI providers
  domains/
    invoice/
    collection/       # status + priority (deterministic)
    analytics/
  storage/            # R2 in production, ./uploads in local dev
  api/                # Hono app
```

## Scripts

| Command        | Purpose                          |
|----------------|----------------------------------|
| `pnpm test`    | Run Core signing contract tests   |
| `pnpm dev`     | Start Next.js                    |
| `pnpm db:setup`| Start Postgres, push schema, seed |
| `pnpm db:up`   | Start Postgres via Docker         |
| `pnpm db:push` | Push Prisma schema only           |
| `pnpm db:seed` | Reseed demo workspace             |

## Product rule

Protect the core promise: **help businesses recover money they are already owed.**
