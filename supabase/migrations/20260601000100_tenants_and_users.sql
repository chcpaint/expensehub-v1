-- ============================================================================
-- ExpenseHub V1 — Tenants, tenant_users, user profiles
-- ============================================================================

create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  logo_path           text,                            -- storage path
  accent_color        text not null default '#1F3A5F',
  base_currency       text not null default 'CAD',
  tax_region          text not null default 'CA',

  -- v1 integration mode
  integration_mode    text not null default 'standalone'
                      check (integration_mode in ('standalone','file_export','api_sync')),
  file_export_adapter text check (file_export_adapter in
                      ('accountedge','qb_desktop','sage50','universal_csv')),
  api_sync_adapter    text check (api_sync_adapter in
                      ('qbo','xero','intacct','sage_acct')),

  sso_domain          text,
  status              text not null default 'active'
                      check (status in ('active','suspended','archived')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_users — source of truth for membership and role
-- ---------------------------------------------------------------------------
create table public.tenant_users (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in
              ('submitter','approver','accounting','admin','owner')),
  invited_by  uuid references auth.users(id),
  invited_at  timestamptz default now(),
  joined_at   timestamptz default now(),
  primary key (tenant_id, user_id)
);

create index idx_tenant_users_user on public.tenant_users (user_id);
create index idx_tenant_users_role on public.tenant_users (tenant_id, role);

-- ---------------------------------------------------------------------------
-- user_profiles — per-user app metadata
-- ---------------------------------------------------------------------------
create table public.user_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  initials         text,
  default_tenant_id uuid references public.tenants(id),
  email_alias      text unique,             -- e.g. adam.4f2a@receipts.expensehub.io
  mfa_required     boolean default false,
  push_token       text,                    -- Expo push token
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();
