-- ============================================================================
-- ExpenseHub V1 — Categories, approval rules, policy rules, export profiles
-- ============================================================================

-- User-facing category (maps to a default GL account at posting time)
create table public.categories (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  name               text not null,                  -- 'Meals & Entertainment'
  default_account_id uuid references public.coa_accounts(id),
  active             boolean not null default true,
  sort_order         int default 100,
  created_at         timestamptz not null default now()
);
create index idx_categories_tenant on public.categories (tenant_id, active);

-- ---------------------------------------------------------------------------
-- Approval routing rules — JSON-condition DSL
-- ---------------------------------------------------------------------------
--
-- condition examples:
--   { "amount_gt": 500 }
--   { "category": "Meals" }
--   { "amount_gt": 1000, "submitter_role": "submitter" }
--
-- steps examples (ordered list of approver selectors):
--   [{ "selector": "user_id", "value": "<uuid>" }]
--   [{ "selector": "role",    "value": "approver" },
--    { "selector": "role",    "value": "accounting" }]
-- ---------------------------------------------------------------------------
create table public.approval_rules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  condition   jsonb not null,
  steps       jsonb not null,
  priority    int not null default 100,             -- lower = evaluated first
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Policy rules — flag (warn) or block at submission time
-- ---------------------------------------------------------------------------
create table public.policy_rules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  rule        jsonb not null,           -- { category, max_amount, requires_field }
  severity    text not null default 'warn' check (severity in ('warn','block')),
  message     text,                     -- shown to user
  active      boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Export profiles — per-tenant CSV/IIF mapping
-- ---------------------------------------------------------------------------
create table public.export_profiles (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  adapter                  text not null,                -- 'accountedge' | 'universal_csv' | 'qb_iif'
  default_cheque_account   text,                         -- e.g. '1-1140'
  default_payment_account_id uuid references public.coa_accounts(id),
  date_format              text default 'MM/DD/YYYY',
  account_code_style       text default 'plain' check (account_code_style in ('plain','dashed','fullname')),
  vendor_naming            text default 'UPPER' check (vendor_naming in ('UPPER','TitleCase','lowercase','asis')),
  tax_code_map             jsonb default '{}'::jsonb,    -- {'GST 5%':'GST'}
  custom_columns           jsonb default '[]'::jsonb,
  cheque_number_prefix     text default 'EH-',
  cheque_number_seq        bigint default 0,             -- monotonically increasing per tenant
  updated_at               timestamptz default now()
);
create unique index idx_export_profiles_one_per_adapter
  on public.export_profiles (tenant_id, adapter);
