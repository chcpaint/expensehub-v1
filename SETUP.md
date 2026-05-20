# Setup — Local Development

## Prerequisites

- Node.js 20+ and npm 10+
- Docker Desktop (for local Supabase)
- Supabase CLI (`brew install supabase/tap/supabase`)
- Expo CLI (`npm install -g expo-cli`)
- Optional for OCR: Google Cloud project with Document AI Expense Parser enabled, AWS account with Bedrock access for Claude

## 1. Clone and install

```bash
cd v1-accountedge-pilot
cp .env.example .env
npm install
```

## 2. Start Supabase locally

```bash
npx supabase start
```

This boots a local Postgres, Auth (GoTrue), Storage, and Edge Functions runtime in
Docker. Note the local API URL, anon key, and service-role key printed at the end —
copy them into `.env`.

## 3. Apply migrations and seed

```bash
npx supabase db reset
```

This wipes the local DB, re-applies all migrations in `supabase/migrations/`, and
runs `supabase/seed.sql` to populate one demo tenant.

Demo credentials (local only):

| Role        | Email                        | Password           |
|-------------|------------------------------|--------------------|
| Owner       | owner@northridge.local       | dev-password-only  |
| Accounting  | accounting@northridge.local  | dev-password-only  |
| Approver    | sarah@northridge.local       | dev-password-only  |
| Submitter   | adam@northridge.local        | dev-password-only  |

## 4. Run the web admin

```bash
npm run dev:web
```

Open <http://localhost:3000> and sign in as one of the demo users.

## 5. Run the mobile app

```bash
npm run dev:mobile
```

Scan the QR code with Expo Go (iOS / Android) or press `i` / `a` to open a simulator.

## 6. Run the worker

```bash
npm run dev:worker
```

The worker subscribes to `pg_notify('ocr_pending')` and `pg_notify('match_pending')`
and processes incoming jobs. With Document AI / Bedrock credentials configured the
worker runs the real pipeline; without them it runs deterministic stubs so you can
test the full state machine end-to-end.

## 7. Try the reconciliation flow

A sample statement CSV is provided at `supabase/fixtures/sample-visa-statement.csv`.
After seeding, sign in as `accounting@northridge.local`, navigate to
**Reconcile → Upload statement**, and drop in the sample file. The matcher will pair
most lines to seeded receipts and surface a handful of ambiguous and no-receipt
cases for manual resolution.

## 8. Try the export flow

Sign in as `accounting@northridge.local`, navigate to **Ready to Export**, tick the
approved rows, choose **AccountEdge Spend Money** from the dropdown, and click
**Export N to AccountEdge CSV**. The file downloads to your browser; open it in any
text editor to inspect the AccountEdge-compatible format. Open in AccountEdge via
File → Import Data → Disbursements → Spend Money Transactions.

## Deploying

Production deployment is out of scope for this README — see the **Technical Build
Plan** doc, Section 8, for infrastructure cost projections and the deployment
checklist. The short version:

- **Database / Auth / Storage**: deploy to Supabase Pro (US-East default, enable PITR)
- **Web app**: deploy to Vercel
- **Mobile app**: build with Expo EAS, submit to App Store / Play Store
- **Worker**: deploy to Fly.io (2 small machines is plenty for V1)
- **Secrets**: 1Password Business → Vercel env vars and Fly secrets via OP CLI
