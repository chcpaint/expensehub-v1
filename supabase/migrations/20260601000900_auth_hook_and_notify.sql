-- ============================================================================
-- ExpenseHub V1 — Auth Hook (sets app_metadata) + pg_notify helpers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Auth Hook: every JWT issuance recomputes app_metadata.tenant_id + role
-- from tenant_users (never trusts the client). Wire this hook into Supabase
-- Auth via Studio → Hooks → Custom Access Token.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (event->>'user_id')::uuid;
  v_claims  jsonb := event->'claims';
  v_app_md  jsonb := coalesce(v_claims->'app_metadata', '{}'::jsonb);
  v_tenant  uuid;
  v_role    text;
  v_explicit_tenant uuid;
begin
  -- A client can request a specific tenant via the "x-active-tenant" custom claim
  -- pushed in by the app on tenant-switch. Validate it.
  v_explicit_tenant := nullif(v_claims->>'x-active-tenant', '')::uuid;

  if v_explicit_tenant is not null then
    select tu.tenant_id, tu.role into v_tenant, v_role
    from public.tenant_users tu
    where tu.user_id = v_user_id and tu.tenant_id = v_explicit_tenant
    limit 1;
  end if;

  -- Fall back to default_tenant_id, then to any membership
  if v_tenant is null then
    select up.default_tenant_id into v_tenant
    from public.user_profiles up where up.user_id = v_user_id;

    if v_tenant is not null then
      select tu.role into v_role
      from public.tenant_users tu
      where tu.user_id = v_user_id and tu.tenant_id = v_tenant
      limit 1;
    end if;
  end if;

  if v_tenant is null then
    select tu.tenant_id, tu.role into v_tenant, v_role
    from public.tenant_users tu
    where tu.user_id = v_user_id
    order by tu.joined_at desc
    limit 1;
  end if;

  v_app_md := v_app_md
            || jsonb_build_object('tenant_id', v_tenant)
            || jsonb_build_object('role', coalesce(v_role, 'submitter'));

  event := jsonb_set(event, '{claims, app_metadata}', v_app_md);
  return event;
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- pg_notify channels — worker subscribes to these for queue work
-- ---------------------------------------------------------------------------
create or replace function public.notify_ocr_pending() returns trigger
language plpgsql as $$
begin
  perform pg_notify('ocr_pending', NEW.id::text);
  return NEW;
end $$;

create trigger trg_notify_ocr
  after insert on public.receipts
  for each row execute function public.notify_ocr_pending();

create or replace function public.notify_match_pending() returns trigger
language plpgsql as $$
begin
  if NEW.status = 'parsed' then
    perform pg_notify('match_pending', NEW.id::text);
  end if;
  return NEW;
end $$;

create trigger trg_notify_match
  after insert or update of status on public.card_statements
  for each row execute function public.notify_match_pending();
