-- ============================================================================
-- ExpenseHub V1 — Standalone-Mode starter chart of accounts (template)
-- These are NOT inserted per tenant by this migration — they're seeded in the
-- onboarding flow via the seed_standalone_starter() function below.
-- ============================================================================

create or replace function public.seed_standalone_starter(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  -- Skip if already seeded
  if exists (select 1 from public.coa_accounts where tenant_id = p_tenant_id) then
    return;
  end if;

  -- ASSET (1xxx)
  insert into public.coa_accounts (tenant_id, code, name, type) values
    (p_tenant_id, '1100', 'Bank — Operating', 'asset'),
    (p_tenant_id, '1140', 'Bank — Credit Card Visa', 'asset'),
    (p_tenant_id, '1145', 'Bank — Credit Card MasterCard', 'asset'),
    (p_tenant_id, '1200', 'Accounts Receivable', 'asset'),
    (p_tenant_id, '1400', 'GST/HST Receivable', 'asset');

  -- LIABILITY (2xxx)
  insert into public.coa_accounts (tenant_id, code, name, type) values
    (p_tenant_id, '2100', 'Accounts Payable', 'liability'),
    (p_tenant_id, '2200', 'GST/HST Collected', 'liability'),
    (p_tenant_id, '2210', 'PST Collected', 'liability');

  -- EXPENSE — Operating (5xxx-6xxx)
  insert into public.coa_accounts (tenant_id, code, name, type) values
    (p_tenant_id, '5100', 'Subcontractors', 'expense'),
    (p_tenant_id, '5145', 'Job Materials', 'expense'),
    (p_tenant_id, '5150', 'Job Site Supplies', 'expense'),
    (p_tenant_id, '5210', 'Office Supplies', 'expense'),
    (p_tenant_id, '5215', 'Meals & Entertainment', 'expense'),
    (p_tenant_id, '5220', 'Office Coffee & Snacks', 'expense'),
    (p_tenant_id, '5310', 'Client Entertainment', 'expense'),
    (p_tenant_id, '5410', 'Travel — Airfare', 'expense'),
    (p_tenant_id, '5420', 'Travel — Hotel', 'expense'),
    (p_tenant_id, '5430', 'Travel — Ground Transport', 'expense'),
    (p_tenant_id, '5440', 'Travel — Meals (per diem)', 'expense'),
    (p_tenant_id, '5510', 'Vehicle — Fuel', 'expense'),
    (p_tenant_id, '5520', 'Vehicle — Maintenance', 'expense'),
    (p_tenant_id, '5610', 'Telephone & Internet', 'expense'),
    (p_tenant_id, '6310', 'Professional Fees', 'expense'),
    (p_tenant_id, '6320', 'Software Subscriptions', 'expense'),
    (p_tenant_id, '6410', 'Marketing & Advertising', 'expense'),
    (p_tenant_id, '6510', 'Computer Equipment', 'expense'),
    (p_tenant_id, '6520', 'Equipment Rental', 'expense'),
    (p_tenant_id, '6710', 'Bank Charges', 'expense'),
    (p_tenant_id, '6810', 'Training & Development', 'expense'),
    (p_tenant_id, '6900', 'Miscellaneous', 'expense');

  -- Tax codes (CA default)
  insert into public.tax_codes (tenant_id, external_id, name, rate_pct) values
    (p_tenant_id, 'GST',  'GST 5%',          5.000),
    (p_tenant_id, 'HST',  'HST 13%',         13.000),
    (p_tenant_id, 'PST',  'PST 7% (BC)',     7.000),
    (p_tenant_id, 'GSTPST', 'GST + PST 12%', 12.000),
    (p_tenant_id, 'N-T',  'Non-taxable',     0.000),
    (p_tenant_id, 'EXEMPT', 'Tax exempt',    0.000);

  -- Default categories that map to the most-used expense accounts
  insert into public.categories (tenant_id, name, default_account_id)
  select p_tenant_id, c.name, a.id
  from (values
    ('Meals & Entertainment','5215'),
    ('Client Entertainment','5310'),
    ('Office Supplies','5210'),
    ('Job Materials','5145'),
    ('Software','6320'),
    ('Travel — Airfare','5410'),
    ('Travel — Hotel','5420'),
    ('Travel — Ground','5430'),
    ('Vehicle Fuel','5510'),
    ('Subcontractor','5100'),
    ('Other','6900')
  ) as c(name, code)
  join public.coa_accounts a on a.tenant_id = p_tenant_id and a.code = c.code;

  -- One starter approval rule: anything > $500 routes to accounting after manager
  insert into public.approval_rules (tenant_id, name, condition, steps, priority) values
    (p_tenant_id, 'Default — manager then accounting on > $500',
     jsonb_build_object('amount_gt', 500),
     jsonb_build_array(
       jsonb_build_object('selector', 'role', 'value', 'approver'),
       jsonb_build_object('selector', 'role', 'value', 'accounting')),
     100),
    (p_tenant_id, 'Default — manager only',
     '{}'::jsonb,
     jsonb_build_array(jsonb_build_object('selector', 'role', 'value', 'approver')),
     200);

  -- One starter policy: meals over $50 require justification
  insert into public.policy_rules (tenant_id, name, rule, severity, message) values
    (p_tenant_id, 'Meals over $50 require justification',
     jsonb_build_object('category', 'Meals & Entertainment', 'amount_gt', 50, 'requires_field', 'justification'),
     'block', 'Please add a justification — meals over $50 require it.');
end $$;
