# What's done · What you do next

## Already done by Claude

### Supabase project — `expensehub-v1-pilot` (us-east-1)
- **Project URL**: <https://uhyfpvhrrkkqbppxfpdr.supabase.co>
- **Project ref**: `uhyfpvhrrkkqbppxfpdr`
- **Org**: Easeaiworks's Org (`awbkdmwegzsmelqgnewc`)
- **Cost**: $10/month, recurring (already confirmed)

Live and configured:
- All 11 migrations applied (extensions, tenants, CoA, expenses, statements, reconciliation, audit log, RLS, storage, auth hook, seed function)
- All 5 Edge Functions deployed (`expenses-submit`, `expenses-approve`, `expenses-bulk-export`, `statements-upload`, `statements-match`)
- All 4 storage buckets created with RLS (`receipts`, `statements`, `exports`, `logos`)
- Seeded the pilot tenant — Northridge Construction (slug `northridge`) — with AccountEdge-style dashed account codes, 6 tax codes, 11 categories, 7 vendors, 2 projects, 2 approval rules, 1 policy rule, AccountEdge export profile

### GitHub repo — `Easeaiworks/expensehub-v1` (Private)
- Empty repo created at <https://github.com/Easeaiworks/expensehub-v1>
- Visibility: Private ✓

---

## What YOU need to do next (15 minutes)

### 1. Push the code to GitHub (5 minutes)

The full codebase lives in your Cowork outputs folder. Open Terminal on your Mac and run:

```bash
cd "/Users/adamberube/Library/Application Support/Claude/local-agent-mode-sessions/0dd19cd1-1735-4f31-a283-0bf98f03d5b4/eed91424-0770-49b9-83eb-6f840816b308/local_c41c20f5-caaa-4969-94d3-705d09bc49ad/outputs/v1-accountedge-pilot"

git init
git add .
git commit -m "feat: V1 (AccountEdge pilot) — schema, RLS, edge functions, mobile, web, worker"
git branch -M main
git remote add origin https://github.com/Easeaiworks/expensehub-v1.git
git push -u origin main
```

If git asks for credentials, use a [GitHub Personal Access Token](https://github.com/settings/tokens?type=beta) with `repo` scope (recommended) or your username + a token as password. Don't use your account password — GitHub no longer accepts that.

You probably want to move the project out of the deep `Library/Application Support` path:

```bash
cp -R "/Users/.../v1-accountedge-pilot" ~/dev/expensehub-v1
cd ~/dev/expensehub-v1 && git init && ...    # then push from there
```

### 2. Create the first admin user (3 minutes)

The seed couldn't create the four demo users from this session (Supabase Auth user creation needs to happen via the Auth API, not raw SQL). Create yourself as the owner:

1. Open <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/auth/users>
2. Click **Add user** → **Create new user**
3. Email: `your-email@cofoundr-or-whatever.com`, password: pick a strong one
4. Click **Create user**, then click the new row to open it
5. Copy the user's UUID

Then in the SQL editor (<https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/sql/new>), paste:

```sql
-- Replace <USER_UUID> with the UUID you copied
insert into public.user_profiles (user_id, display_name, initials, default_tenant_id)
values ('<USER_UUID>', 'Adam Berube', 'AB', '11111111-1111-1111-1111-111111111111');

insert into public.tenant_users (tenant_id, user_id, role)
values ('11111111-1111-1111-1111-111111111111', '<USER_UUID>', 'owner');
```

Repeat for the other roles you need (`accounting`, `approver`, `submitter`).

### 3. Enable the JWT Auth Hook (2 minutes)

This is what attaches your `tenant_id` and `role` to every JWT so RLS works.

1. Open <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/auth/hooks>
2. Click **Add hook** → **Custom Access Token**
3. Type: Postgres function
4. Schema: `public`, Function: `custom_access_token_hook`
5. Enable the hook → Save

Sign out and back in on the web admin (after deploy) so the new claims get added to your JWT.

### 4. Grab the service-role key (1 minute)

Open <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/settings/api> and copy the **service_role** key (keep it secret — server-only). Paste it into `.env` as `SUPABASE_SERVICE_ROLE_KEY` when you deploy the web app and worker.

The publishable (anon) key is already in `.env.production.example`:
```
sb_publishable_2AYCvf_Grb3xtw9D7Cumcg_YQFKKt8u
```

### 5. Deploy the web app to Vercel (4 minutes)

```bash
cd ~/dev/expensehub-v1
npm install
cd apps/web
npx vercel link --yes
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
# → https://uhyfpvhrrkkqbppxfpdr.supabase.co
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# → sb_publishable_2AYCvf_Grb3xtw9D7Cumcg_YQFKKt8u
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# → (paste from dashboard)
npx vercel --prod
```

Sign in with the owner user you created in step 2, then visit `/onboard` to confirm Northridge Construction is wired up correctly.

### 6. Try the mobile app locally (3 minutes)

```bash
cd ~/dev/expensehub-v1/apps/mobile
npm install
cp ../../.env.production.example .env
npx expo start
# Scan the QR with Expo Go on your phone, or press 'i' for iOS sim
```

You should be able to sign in as the same owner user, snap a receipt (the deterministic stub will fill in "Starbucks $13.81"), and submit it for approval.

### 7. Upload the sample statement to test reconciliation

`supabase/fixtures/sample-visa-statement.csv` is included. After signing in to the web admin:
1. Navigate to **Reconcile statements**
2. Drag in the sample CSV
3. Watch the matcher pair it against the expenses you've submitted

---

## What's NOT done (V2 / Phase 2 work)

- Direct sync to QuickBooks Online / Xero / Sage Intacct (V2 — separate project)
- Plaid card-feed ingest (V2)
- Real Document AI + Claude calls (interfaces are in place, plug in credentials)
- Expo push notifications (interfaces ready, no FCM/APNS keys yet)
- App Store / Play Store submission

---

## Useful dashboard links

| What | URL |
|---|---|
| Project home | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr> |
| SQL editor | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/sql/new> |
| Auth users | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/auth/users> |
| Auth hooks | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/auth/hooks> |
| Storage | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/storage/buckets> |
| Edge functions | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/functions> |
| API keys | <https://supabase.com/dashboard/project/uhyfpvhrrkkqbppxfpdr/settings/api> |
| GitHub repo | <https://github.com/Easeaiworks/expensehub-v1> |
