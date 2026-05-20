-- ============================================================================
-- ExpenseHub V1 — Row-Level Security policies
--
-- Every tenant-scoped table is enforced. Service-role key bypasses RLS for
-- worker / Edge Function flows.
-- ============================================================================

alter table public.tenants            enable row level security;
alter table public.tenant_users       enable row level security;
alter table public.user_profiles      enable row level security;
alter table public.coa_accounts       enable row level security;
alter table public.coa_vendors        enable row level security;
alter table public.coa_dimensions     enable row level security;
alter table public.tax_codes          enable row level security;
alter table public.categories         enable row level security;
alter table public.approval_rules     enable row level security;
alter table public.policy_rules       enable row level security;
alter table public.export_profiles    enable row level security;
alter table public.expenses           enable row level security;
alter table public.receipts           enable row level security;
alter table public.ocr_results        enable row level security;
alter table public.approval_steps     enable row level security;
alter table public.export_jobs        enable row level security;
alter table public.post_jobs          enable row level security;
alter table public.card_statements    enable row level security;
alter table public.statement_lines    enable row level security;
alter table public.match_overrides    enable row level security;
alter table public.statement_csv_mappings enable row level security;
alter table public.audit_log          enable row level security;

-- ---------------------------------------------------------------------------
-- TENANTS — anyone in the tenant can read; only owner/admin can update
-- ---------------------------------------------------------------------------
create policy tenants_self_read on public.tenants for select
  using (id = public.app_tenant());

create policy tenants_admin_update on public.tenants for update
  using (id = public.app_tenant() and public.has_role(array['owner','admin']));

-- ---------------------------------------------------------------------------
-- TENANT_USERS — readable to all members, writable only by admin/owner
-- ---------------------------------------------------------------------------
create policy tenant_users_read on public.tenant_users for select
  using (tenant_id = public.app_tenant());

create policy tenant_users_admin_write on public.tenant_users for all
  using (tenant_id = public.app_tenant() and public.has_role(array['owner','admin']))
  with check (tenant_id = public.app_tenant() and public.has_role(array['owner','admin']));

-- ---------------------------------------------------------------------------
-- USER_PROFILES — user owns their profile
-- ---------------------------------------------------------------------------
create policy user_profiles_self_read on public.user_profiles for select
  using (user_id = auth.uid()
         or exists (select 1 from public.tenant_users tu
                    where tu.user_id = public.user_profiles.user_id
                      and tu.tenant_id = public.app_tenant()));

create policy user_profiles_self_write on public.user_profiles for update
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- COA / dimensions / categories / tax / rules — read all in tenant,
-- write only by admin/owner/accounting
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'coa_accounts','coa_vendors','coa_dimensions','tax_codes',
    'categories','approval_rules','policy_rules','export_profiles'
  ]
  loop
    execute format(
      'create policy %I_tenant_read on public.%I for select using (tenant_id = public.app_tenant())',
      tbl||'_read', tbl);
    execute format(
      'create policy %I_admin_write on public.%I for all using
       (tenant_id = public.app_tenant() and public.has_role(array[%L,%L,%L]))
       with check (tenant_id = public.app_tenant() and public.has_role(array[%L,%L,%L]))',
      tbl||'_write', tbl, 'owner','admin','accounting','owner','admin','accounting');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- EXPENSES — tenant-scoped read; submitter writes own drafts; accounting recodes
-- ---------------------------------------------------------------------------
create policy expenses_tenant_read on public.expenses for select
  using (tenant_id = public.app_tenant());

create policy expenses_submitter_insert on public.expenses for insert
  with check (tenant_id = public.app_tenant() and submitter_id = auth.uid());

-- Submitter edits own drafts only
create policy expenses_submitter_self_edit on public.expenses for update
  using (tenant_id = public.app_tenant()
         and submitter_id = auth.uid()
         and status = 'draft')
  with check (tenant_id = public.app_tenant() and submitter_id = auth.uid());

-- Accounting/admin/owner can recode anything that is not yet posted/exported (or that failed)
create policy expenses_accounting_recode on public.expenses for update
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner'])
         and status in ('approved','queued_export','exported','queued_post','post_failed','reconciled'));

-- No deletions ever — archived flag is used instead
create policy expenses_no_delete on public.expenses for delete using (false);

-- ---------------------------------------------------------------------------
-- RECEIPTS / OCR_RESULTS — read with the parent expense
-- ---------------------------------------------------------------------------
create policy receipts_tenant_read on public.receipts for select
  using (tenant_id = public.app_tenant());

create policy receipts_submitter_insert on public.receipts for insert
  with check (tenant_id = public.app_tenant());

create policy ocr_results_tenant_read on public.ocr_results for select
  using (tenant_id = public.app_tenant());

-- ---------------------------------------------------------------------------
-- APPROVAL_STEPS — visible to the assigned approver, the submitter, accounting
-- ---------------------------------------------------------------------------
create policy approval_steps_read on public.approval_steps for select
  using (tenant_id = public.app_tenant()
         and (approver_id = auth.uid()
              or public.has_role(array['accounting','admin','owner'])
              or exists (select 1 from public.expenses e
                         where e.id = approval_steps.expense_id
                           and e.submitter_id = auth.uid())));

-- The matching approver can update only their own pending step
create policy approval_steps_approver_act on public.approval_steps for update
  using (tenant_id = public.app_tenant()
         and approver_id = auth.uid()
         and status = 'pending');

-- ---------------------------------------------------------------------------
-- EXPORT_JOBS / POST_JOBS — read for accounting/admin/owner
-- ---------------------------------------------------------------------------
create policy export_jobs_read on public.export_jobs for select
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner']));

create policy export_jobs_insert on public.export_jobs for insert
  with check (tenant_id = public.app_tenant()
              and public.has_role(array['accounting','admin','owner']));

create policy export_jobs_confirm on public.export_jobs for update
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner']));

create policy post_jobs_read on public.post_jobs for select
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner']));

-- ---------------------------------------------------------------------------
-- STATEMENTS / LINES / OVERRIDES — accounting + admin + owner
-- ---------------------------------------------------------------------------
create policy card_statements_read on public.card_statements for select
  using (tenant_id = public.app_tenant());

create policy card_statements_acct_write on public.card_statements for all
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner']))
  with check (tenant_id = public.app_tenant()
              and public.has_role(array['accounting','admin','owner']));

create policy statement_lines_read on public.statement_lines for select
  using (tenant_id = public.app_tenant());

create policy statement_lines_acct_update on public.statement_lines for update
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner']));

create policy match_overrides_read on public.match_overrides for select
  using (tenant_id = public.app_tenant());

create policy match_overrides_acct_insert on public.match_overrides for insert
  with check (tenant_id = public.app_tenant()
              and public.has_role(array['accounting','admin','owner']));

create policy statement_csv_mappings_read on public.statement_csv_mappings for select
  using (tenant_id = public.app_tenant());

create policy statement_csv_mappings_write on public.statement_csv_mappings for all
  using (tenant_id = public.app_tenant()
         and public.has_role(array['accounting','admin','owner']))
  with check (tenant_id = public.app_tenant()
              and public.has_role(array['accounting','admin','owner']));

-- ---------------------------------------------------------------------------
-- AUDIT_LOG — read for admin/owner only; never writable from the client
-- ---------------------------------------------------------------------------
create policy audit_log_admin_read on public.audit_log for select
  using (tenant_id = public.app_tenant()
         and public.has_role(array['admin','owner']));

-- No insert/update/delete policies — the trigger uses SECURITY DEFINER
