# Deploying ExpenseHub V1 to Render

This guide gets the web admin and worker live on Render in about 10 minutes,
backed by the already-live Supabase project (`expensehub-v1-pilot`).

## What gets deployed

| Service | Type | Plan | Why |
|---|---|---|---|
| `expensehub-v1-web` | Web service (Next.js) | **Free** ($0) | Admin console — sleeps after 15 min idle, fine for testing |
| `expensehub-v1-worker` | Background worker (Node) | **Starter** ($7/mo) | OCR + reconciliation runner — Render doesn't allow free workers |

Mobile app is **not** on Render. You'll run it via Expo Go on your phone for testing
(scan a QR code). See `MOBILE_TESTING.md`.

## Pre-flight: things Claude already did

- ✅ `render.yaml` blueprint pushed to the repo (root)
- ✅ Supabase project `expensehub-v1-pilot` live with schema + edge functions
- ✅ First admin user created: **`adamberube@me.com`** / **`Pilot-Test-2026!`** (change at first login)
- ✅ Northridge Construction tenant seeded as the demo brokerage

## Things YOU do (≈10 minutes)

### Step 1 — Enable the JWT Auth Hook in Supabase (2 min)

The Auth Hook function exists in the DB but Supabase needs you to flip a switch
in the dashboard to actually invoke it on every JWT issuance. Until you do this,
the JWT will be missing `tenant_id` and `role` — RLS will block everything.

1. Open <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/auth/hooks>
2. Click **Add hook** → **Custom Access Token**
3. Hook type: **Postgres function**
4. Schema: `public`
5. Function: `custom_access_token_hook`
6. **Enable the hook** → **Save**

### Step 2 — Grab the secrets you'll paste into Render (2 min)

Open these two pages in new tabs:

- **Service Role Key** — <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/settings/api>
  - Copy the value under **service_role** (starts with `eyJ…` — long JWT, keep secret)
- **Database URL** — <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/settings/database>
  - Choose **Connection string** → **URI** mode
  - Copy the `postgresql://postgres:…@db.uhyfpvhrrkkqbppxfpdr.supabase.co:5432/postgres` URL
  - You'll need to substitute your database password (Supabase shows it once on project creation, or reset it here)

### Step 3 — Create the Blueprint in Render (3 min)

1. Open <https://dashboard.render.com>
2. Click **New +** → **Blueprint**
3. **Connect a repository**: select **chcpaint/expensehub-v1** (you may need to authorize Render to access the chcpaint org's repos first)
4. Render detects `render.yaml` and shows the two services
5. **Apply Blueprint**
6. Render asks for the secrets marked `sync: false`. Paste:
   - `SUPABASE_SERVICE_ROLE_KEY` → both services
   - `SUPABASE_DB_URL` → worker only
7. Click **Create services**

### Step 4 — Wait for build (5–8 min)

Render runs:
- `npm install` (pulls all workspace deps)
- `npm run render:build:web` (builds shared + reconciliation + web)
- `npm run render:build:worker` (same for worker)

Watch the build logs in the Render dashboard. Common gotchas:
- If npm install times out → click **Manual Deploy** → **Clear build cache & deploy**
- If `next build` fails on missing `@expensehub/shared` → see [troubleshooting](#troubleshooting)

### Step 5 — Sign in (1 min)

Once both services show **Live**, click the web service URL (looks like
`https://expensehub-v1-web.onrender.com`).

Sign in with:
- Email: `adamberube@me.com`
- Password: `Pilot-Test-2026!`

You should land on the Owner Dashboard for **Northridge Construction** with the
six pre-seeded approved expenses ready to export.

### Step 6 — Change the temp password (30 sec)

After logging in, change the password — that temp one is in this doc + the chat
history. In the web UI go to your profile (or just use Supabase Auth's password
update — we'll wire a profile page in v1.1).

## Verifying everything works

After login, walk through this 5-minute smoke test:

1. **Dashboard** → see KPIs and "Spend by Category" chart with the 6 demo expenses
2. **Ready to Export** → tick the 6 rows, confirm **AccountEdge Spend Money** in the dropdown, click **Export 6 to AccountEdge CSV** → file downloads
3. Open the CSV in any text editor — verify it has correct AccountEdge-style columns and dashed account codes (e.g., `5-2150`)
4. **Reconcile statements** → **+ Upload statement** → upload `supabase/fixtures/sample-visa-statement.csv` → ~5 of 14 lines auto-match the demo expenses
5. **Audit log** → see every approval, re-code, and export logged with actor + timestamp

If anything fails, check the Render logs for the failed service.

## Cost summary

| | Monthly cost |
|---|---|
| Supabase Pro (live, has PITR) | $25 + $100 PITR = $125 |
| Render Web Free | $0 |
| Render Worker Starter | $7 |
| **Total for testing** | **~$132/mo** |

Once you scale past testing, the Render Web can stay Free for low-traffic admin use, or jump to Starter ($7) to kill cold starts.

## Mobile testing

The mobile app isn't on Render. For testing:

```bash
cd ~/dev/expensehub-v1/apps/mobile
npm install
cp ../../.env.example .env
# Edit .env so EXPO_PUBLIC_SUPABASE_URL points at your Supabase project (already in .env.production.example)
npx expo start
```

Install **Expo Go** on your phone (App Store / Play Store), scan the QR code from
the terminal, sign in as `adamberube@me.com` / `Pilot-Test-2026!`, and you're in.

For a more "real" mobile test (without keeping a laptop running):
```bash
npx eas build --profile preview --platform ios       # or android
```
Builds a standalone IPA you can sideload via TestFlight.

## Troubleshooting

### `next build` can't find `@expensehub/shared`
Render's npm install sometimes skips workspace symlinks on first run. In the Render dashboard for the web service:
- Settings → Build & Deploy → Clear build cache → Deploy

### Worker logs say `SUPABASE_DB_URL not set — running in poll-mode every 30s`
You forgot to paste the DB URL in step 2/3. Add it in the worker's Environment tab, then redeploy.

### Logged in but every page says "no rows" or 401
The Auth Hook isn't enabled. See Step 1 above. Sign out and back in after enabling so a fresh JWT is issued.

### Web service is slow to respond
Free tier sleeps after 15 min of inactivity; first request takes ~30s to wake up. Upgrade to Starter ($7) to eliminate.

### Render asks for permission to access chcpaint org
Normal. The chcpaint org owner (you) needs to grant Render the `repo` scope OAuth permission. Click through the GitHub prompt.

## What's next (v1.1)

- Real Document AI OCR (replace the deterministic stub in the worker — set `DOCUMENT_AI_*` env vars)
- Real Claude classification via Bedrock (set `AWS_*` env vars)
- Expo push notifications
- AccountEdge import-log auto-confirm

These are wired with interfaces in place; just supply credentials.
