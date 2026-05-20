-- ============================================================================
-- ExpenseHub V1 — Extensions and shared helpers
-- ============================================================================

create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- merchant-name fuzzy match
create extension if not exists "btree_gin";

-- ---------------------------------------------------------------------------
-- Tenant / role helpers: read from JWT app_metadata (server-set, immutable).
-- ---------------------------------------------------------------------------
create or replace function public.app_tenant() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

create or replace function public.app_role() returns text
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'submitter')
$$;

create or replace function public.app_aal() returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

create or replace function public.has_role(roles text[]) returns boolean
language sql stable
as $$
  select public.app_role() = any(roles)
$$;

-- ---------------------------------------------------------------------------
-- updated_at touch
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;
