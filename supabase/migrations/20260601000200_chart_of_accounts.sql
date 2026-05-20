-- ============================================================================
-- ExpenseHub V1 — Chart of accounts cache + dimensions
-- For Standalone tenants this IS the chart of accounts (no upstream system).
-- For file_export tenants this mirrors the structure they use in AccountEdge.
-- For api_sync tenants (V2) this caches what was pulled from QBO/Xero/etc.
-- ============================================================================

create table public.coa_accounts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  external_id text,                                   -- QBO/Xero/Intacct id (null for standalone)
  code        text,                                   -- '5215' or '5-215' or '5-1500'
  name        text not null,                          -- 'Meals & Entertainment'
  type        text not null check (type in
              ('asset','liability','equity','revenue','cogs','expense','other_expense')),
  parent_id   uuid references public.coa_accounts(id),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, external_id)
);

create index idx_coa_accounts_tenant_active on public.coa_accounts (tenant_id, active);
create index idx_coa_accounts_name_trgm on public.coa_accounts using gin (name gin_trgm_ops);

create trigger trg_coa_accounts_updated_at
  before update on public.coa_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vendors / suppliers / employee-as-payee
-- ---------------------------------------------------------------------------
create table public.coa_vendors (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  external_id  text,                                  -- AccountEdge "Card ID"
  display_name text not null,
  vendor_type  text not null default 'supplier'
               check (vendor_type in ('supplier','employee','one_time')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, external_id)
);
create index idx_coa_vendors_tenant on public.coa_vendors (tenant_id, active);
create index idx_coa_vendors_name_trgm on public.coa_vendors using gin (display_name gin_trgm_ops);

create trigger trg_coa_vendors_updated_at
  before update on public.coa_vendors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Dimensions: class, department, location, project (a.k.a. AccountEdge Jobs)
-- ---------------------------------------------------------------------------
create table public.coa_dimensions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  dim_type    text not null check (dim_type in
              ('class','department','location','project','tracking')),
  external_id text,
  code        text,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, dim_type, external_id)
);

-- ---------------------------------------------------------------------------
-- Tax codes (per-tenant, mirrors AccountEdge tax-code list for the pilot)
-- ---------------------------------------------------------------------------
create table public.tax_codes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  external_id text,                                   -- 'GST', 'HST', 'N-T'
  name        text not null,                          -- 'GST 5%'
  rate_pct    numeric(6,3),
  active      boolean not null default true,
  unique (tenant_id, external_id)
);
