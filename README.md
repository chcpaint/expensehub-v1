# ExpenseHub V1 — AccountEdge Pilot Edition

Mobile-first, multi-tenant expense management for the AccountEdge pilot tenant.
Export-first integration. No third-party accounting API dependencies.
Includes credit-card statement reconciliation as a core feature.

## What's in this build

This is the **V1 pilot edition** — designed for the first tenant (who uses AccountEdge,
which has no API) and for any small business with no current accounting software.

- **Mobile app** (React Native / Expo) — capture, approve, my-expenses
- **Web admin** (Next.js) — re-code & export, statement reconciliation, owner dashboard, onboarding
- **Backend** (Supabase / Postgres) — full schema, row-level security, audit log, edge functions
- **Worker** (Node on Fly.io) — OCR pipeline (Document AI + Claude), statement matcher
- **Shared package** — TypeScript types, accounting-export adapter interface, AccountEdge CSV builder, Universal CSV builder, IIF builder
- **Reconciliation engine** — statement parser (CSV / OFX / PDF-via-Document-AI), fuzzy matching algorithm, unit tests

## Repository structure

```
v1-accountedge-pilot/
├── README.md                    ← this file
├── SETUP.md                     ← step-by-step setup
├── package.json                 ← npm workspaces root
├── .env.example
├── supabase/
│   ├── config.toml
│   ├── migrations/              ← schema, RLS, triggers, seed
│   └── functions/               ← Deno Edge Functions
├── packages/
│   ├── shared/                  ← types + adapter interface + AccountEdge + Universal CSV
│   └── reconciliation/          ← statement matcher + parsers + tests
└── apps/
    ├── mobile/                  ← Expo React Native app
    ├── web/                     ← Next.js admin app
    └── worker/                  ← OCR + match worker (Node)
```

## V1 vs V2

This is **V1** — purpose-built for the AccountEdge pilot tenant. The market-ready
**V2** edition (separate project, also being built) layers in direct API integration
with QuickBooks Online, Xero, and Sage Intacct plus Plaid card feeds. Both editions
share the same shared package, schema, mobile app, and web app — V2 just adds the
ApiSyncAdapter family and the card-feed worker.

## Quick start

See `SETUP.md` for the full local-development walkthrough. The short version:

```bash
# 1. Install dependencies
npm install

# 2. Spin up local Supabase (Docker required)
npx supabase start

# 3. Apply migrations + seed
npx supabase db reset

# 4. Run the apps (three terminals)
npm run dev:web        # Next.js on http://localhost:3000
npm run dev:mobile     # Expo dev server
npm run dev:worker     # background worker
```

The seed creates one tenant (`Northridge Construction`), one owner user
(`owner@northridge.local` / `dev-password-only`), one approver, and one submitter,
plus a starter chart of accounts and a sample statement file you can upload to test
the reconciliation flow.

## Security posture

- Row-level security on every tenant-scoped table
- Audit-log triggers on every money-affecting table (append-only)
- Receipts and statements stored in private buckets with path-scoped RLS
- JWT `app_metadata.tenant_id` + `role` set server-side via Auth Hook
- TOTP MFA mandatory for Admin / Owner / Accounting roles (enforced in edge functions)
- All secrets in Supabase Vault; never in client bundle

## What this build does NOT do yet

These are tracked stubs — interfaces are in place, implementations need credentials
or Phase-2 work:

- Real Document AI OCR (interface is in place, returns a deterministic stub for now)
- Real Claude classification (interface is in place, returns rule-based stub for now)
- Push notifications (Expo notification permissions wired, server send-call stubbed)
- AccountEdge import-log parsing for auto-confirm (manual confirm in v1)
- Plaid card feeds (V2)
- Direct QBO/Xero/Sage API sync (V2)

## License

Proprietary — internal use only.
