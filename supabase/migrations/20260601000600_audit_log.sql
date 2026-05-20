-- ============================================================================
-- ExpenseHub V1 — Audit log (append-only) + generic audit trigger
-- ============================================================================

create table public.audit_log (
  id           bigserial primary key,
  tenant_id    uuid not null,
  actor_id     uuid,
  event        text not null,                          -- e.g. 'expenses.update', 'statement.close'
  target_table text,
  target_id    uuid,
  before       jsonb,
  after        jsonb,
  changed_keys text[],
  ip           inet,
  user_agent   text,
  occurred_at  timestamptz not null default now()
);

create index idx_audit_log_tenant_time on public.audit_log (tenant_id, occurred_at desc);
create index idx_audit_log_tenant_target on public.audit_log (tenant_id, target_id);
create index idx_audit_log_actor on public.audit_log (actor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- The audit_log accepts INSERT only — UPDATE/DELETE become silent no-ops.
-- (Rules at the public role level; service_role bypasses RLS but is itself
--  restricted in production to never run UPDATE/DELETE on audit_log via code review.)
-- ---------------------------------------------------------------------------
revoke update, delete on public.audit_log from public, authenticated, anon;
create rule audit_no_update as on update to public.audit_log do instead nothing;
create rule audit_no_delete as on delete to public.audit_log do instead nothing;

-- ---------------------------------------------------------------------------
-- Generic audit trigger — diffs OLD/NEW into JSONB, records the actor.
-- ---------------------------------------------------------------------------
create or replace function public.fn_audit() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_target uuid;
  v_before jsonb := null;
  v_after  jsonb := null;
  v_keys   text[] := array[]::text[];
  v_key    text;
begin
  if (TG_OP = 'INSERT') then
    v_tenant := (to_jsonb(NEW)->>'tenant_id')::uuid;
    v_target := (to_jsonb(NEW)->>'id')::uuid;
    v_after  := to_jsonb(NEW);
  elsif (TG_OP = 'UPDATE') then
    v_tenant := (to_jsonb(NEW)->>'tenant_id')::uuid;
    v_target := (to_jsonb(NEW)->>'id')::uuid;
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    for v_key in select jsonb_object_keys(v_after)
    loop
      if v_before->v_key is distinct from v_after->v_key then
        v_keys := array_append(v_keys, v_key);
      end if;
    end loop;
    if array_length(v_keys, 1) is null then
      return NEW; -- nothing meaningful changed; skip noise
    end if;
  elsif (TG_OP = 'DELETE') then
    v_tenant := (to_jsonb(OLD)->>'tenant_id')::uuid;
    v_target := (to_jsonb(OLD)->>'id')::uuid;
    v_before := to_jsonb(OLD);
  end if;

  insert into public.audit_log (
    tenant_id, actor_id, event, target_table, target_id,
    before, after, changed_keys
  ) values (
    v_tenant, v_actor,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME, v_target,
    v_before, v_after, v_keys
  );

  return coalesce(NEW, OLD);
end $$;

-- ---------------------------------------------------------------------------
-- Attach the audit trigger to every money- or access-affecting table
-- ---------------------------------------------------------------------------
create trigger trg_audit_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.fn_audit();

create trigger trg_audit_approval_steps
  after insert or update on public.approval_steps
  for each row execute function public.fn_audit();

create trigger trg_audit_tenant_users
  after insert or update or delete on public.tenant_users
  for each row execute function public.fn_audit();

create trigger trg_audit_export_jobs
  after insert or update on public.export_jobs
  for each row execute function public.fn_audit();

create trigger trg_audit_card_statements
  after insert or update on public.card_statements
  for each row execute function public.fn_audit();

create trigger trg_audit_statement_lines
  after update on public.statement_lines
  for each row execute function public.fn_audit();

create trigger trg_audit_match_overrides
  after insert on public.match_overrides
  for each row execute function public.fn_audit();
