-- ============================================================================
-- Local-dev seed: one tenant + four users + a sample CoA + sample expenses
-- Run after `supabase db reset`. Do NOT use in production.
-- ============================================================================

-- 1. Create the tenant (AccountEdge file-export pilot)
insert into public.tenants (id, name, slug, accent_color, base_currency, tax_region,
                            integration_mode, file_export_adapter)
values
  ('11111111-1111-1111-1111-111111111111',
   'Northridge Construction', 'northridge',
   '#1F3A5F', 'CAD', 'CA',
   'file_export', 'accountedge');

-- 2. Seed the starter chart of accounts
select public.seed_standalone_starter('11111111-1111-1111-1111-111111111111');

-- 3. AccountEdge-style account code overrides (dashed style like '1-1140', '5-2150')
--    Keep the original first digit as the prefix so '5xxx' and '6xxx' don't collide.
update public.coa_accounts
  set code = substring(code from 1 for 1) || '-' || substring(code from 2)
  where tenant_id = '11111111-1111-1111-1111-111111111111'
    and code ~ '^[1-2]\d{3}$';

update public.coa_accounts
  set code = substring(code from 1 for 1) || '-' || substring(code from 2) || '0'
  where tenant_id = '11111111-1111-1111-1111-111111111111'
    and code ~ '^[5-6]\d{3}$';

-- 4. Export profile for AccountEdge
insert into public.export_profiles (tenant_id, adapter, default_cheque_account,
                                    date_format, account_code_style, vendor_naming, tax_code_map)
values
  ('11111111-1111-1111-1111-111111111111', 'accountedge', '1-1140',
   'MM/DD/YYYY', 'dashed', 'UPPER',
   '{"GST 5%":"GST","HST 13%":"HST","PST 7% (BC)":"PST","GST + PST 12%":"GSTPST","Non-taxable":"N-T","Tax exempt":"N-T"}'::jsonb);

-- 5. Four demo users — passwords are literal text (HASHED by GoTrue on insert)
-- NOTE: This relies on the Supabase auth.users table convention. In a real env,
-- create users via the Admin API or sign-up flow.
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data,
  aud, role, created_at, updated_at
) values
  ('22222222-2222-2222-2222-222222222201',
   '00000000-0000-0000-0000-000000000000',
   'owner@northridge.local',
   crypt('dev-password-only', gen_salt('bf')),
   now(), '{"display_name":"Adam Berube"}'::jsonb,
   'authenticated','authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222202',
   '00000000-0000-0000-0000-000000000000',
   'accounting@northridge.local',
   crypt('dev-password-only', gen_salt('bf')),
   now(), '{"display_name":"Sarah Kowalski"}'::jsonb,
   'authenticated','authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222203',
   '00000000-0000-0000-0000-000000000000',
   'sarah@northridge.local',
   crypt('dev-password-only', gen_salt('bf')),
   now(), '{"display_name":"Sarah Kowalski (approver)"}'::jsonb,
   'authenticated','authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222204',
   '00000000-0000-0000-0000-000000000000',
   'adam@northridge.local',
   crypt('dev-password-only', gen_salt('bf')),
   now(), '{"display_name":"Adam B"}'::jsonb,
   'authenticated','authenticated', now(), now())
on conflict (id) do nothing;

insert into public.user_profiles (user_id, display_name, initials, default_tenant_id)
values
  ('22222222-2222-2222-2222-222222222201', 'Adam Berube', 'AB', '11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222202', 'Sarah Kowalski', 'SK', '11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222203', 'Sarah Kowalski', 'SK', '11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222204', 'Adam B', 'AB', '11111111-1111-1111-1111-111111111111')
on conflict (user_id) do nothing;

insert into public.tenant_users (tenant_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222202', 'accounting'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222203', 'approver'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222204', 'submitter')
on conflict do nothing;

-- 6. A few demo vendors (AccountEdge "Cards")
insert into public.coa_vendors (tenant_id, external_id, display_name, vendor_type) values
  ('11111111-1111-1111-1111-111111111111', 'STARBUCKS', 'Starbucks Coffee', 'supplier'),
  ('11111111-1111-1111-1111-111111111111', 'HOMEDEPOT', 'Home Depot Canada', 'supplier'),
  ('11111111-1111-1111-1111-111111111111', 'JOEYBISTRO', 'Joey Restaurants', 'supplier'),
  ('11111111-1111-1111-1111-111111111111', 'PETROCAN', 'Petro-Canada', 'supplier'),
  ('11111111-1111-1111-1111-111111111111', 'AIRCANADA', 'Air Canada', 'supplier'),
  ('11111111-1111-1111-1111-111111111111', 'ADOBE', 'Adobe Inc.', 'supplier'),
  ('11111111-1111-1111-1111-111111111111', 'UBER', 'Uber Technologies', 'supplier');

-- 7. Two demo projects (AccountEdge "Jobs")
insert into public.coa_dimensions (tenant_id, dim_type, external_id, code, name) values
  ('11111111-1111-1111-1111-111111111111', 'project', '4112', '4112', 'Job #4112 — Westcoast Q3'),
  ('11111111-1111-1111-1111-111111111111', 'project', 'TOR1', 'TOR1', 'Toronto site visit');

-- 8. Six demo expenses spanning the lifecycle (approved + ready to export)
do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_submitter uuid := '22222222-2222-2222-2222-222222222204';
  v_meals_acct uuid;
  v_materials_acct uuid;
  v_software_acct uuid;
  v_air_acct uuid;
  v_client_acct uuid;
  v_office_acct uuid;
  v_starbucks uuid;
  v_homedepot uuid;
  v_joey uuid;
  v_adobe uuid;
  v_air uuid;
  v_uber uuid;
  v_proj_west uuid;
  v_proj_tor uuid;
  v_gst uuid;
  v_gstpst uuid;
  v_meals_cat uuid;
begin
  select id into v_meals_acct from public.coa_accounts where tenant_id = v_tenant and code = '5-2150';
  select id into v_materials_acct from public.coa_accounts where tenant_id = v_tenant and code = '5-1450';
  select id into v_software_acct from public.coa_accounts where tenant_id = v_tenant and code = '5-3200';
  select id into v_air_acct from public.coa_accounts where tenant_id = v_tenant and code = '5-4100';
  select id into v_client_acct from public.coa_accounts where tenant_id = v_tenant and code = '5-3100';
  select id into v_office_acct from public.coa_accounts where tenant_id = v_tenant and code = '5-2100';

  select id into v_starbucks from public.coa_vendors where tenant_id = v_tenant and external_id = 'STARBUCKS';
  select id into v_homedepot from public.coa_vendors where tenant_id = v_tenant and external_id = 'HOMEDEPOT';
  select id into v_joey from public.coa_vendors where tenant_id = v_tenant and external_id = 'JOEYBISTRO';
  select id into v_adobe from public.coa_vendors where tenant_id = v_tenant and external_id = 'ADOBE';
  select id into v_air from public.coa_vendors where tenant_id = v_tenant and external_id = 'AIRCANADA';
  select id into v_uber from public.coa_vendors where tenant_id = v_tenant and external_id = 'UBER';

  select id into v_proj_west from public.coa_dimensions where tenant_id = v_tenant and external_id = '4112';
  select id into v_proj_tor from public.coa_dimensions where tenant_id = v_tenant and external_id = 'TOR1';

  select id into v_gst from public.tax_codes where tenant_id = v_tenant and external_id = 'GST';
  select id into v_gstpst from public.tax_codes where tenant_id = v_tenant and external_id = 'GSTPST';

  select id into v_meals_cat from public.categories where tenant_id = v_tenant and name = 'Meals & Entertainment';

  insert into public.expenses (id, tenant_id, submitter_id, status, merchant, txn_date,
                               total_amount, currency, tax_amount, tax_code_id, category_id,
                               account_id, vendor_id, project_id, payment_method, payment_card_last4,
                               captured_at) values
    -- Approved, ready to export
    (gen_random_uuid(), v_tenant, v_submitter, 'approved', 'Starbucks #4421', '2026-05-19',
     13.81, 'CAD', 0.66, v_gst, v_meals_cat, v_meals_acct, v_starbucks, null,
     'corp_card', '8821', '2026-05-19 09:41:00-07'),
    (gen_random_uuid(), v_tenant, v_submitter, 'approved', 'Home Depot Vancouver', '2026-05-18',
     84.27, 'CAD', 9.03, v_gstpst, null, v_materials_acct, v_homedepot, v_proj_west,
     'corp_card', '8821', '2026-05-18 14:22:00-07'),
    (gen_random_uuid(), v_tenant, v_submitter, 'approved', 'Joey Bistro', '2026-05-18',
     187.40, 'CAD', 8.92, v_gst, null, v_client_acct, v_joey, v_proj_west,
     'corp_card', '8821', '2026-05-18 20:12:00-07'),
    (gen_random_uuid(), v_tenant, v_submitter, 'approved', 'Air Canada YVR-YYZ', '2026-05-17',
     642.18, 'CAD', 30.58, v_gst, null, v_air_acct, v_air, v_proj_tor,
     'corp_card', '8821', '2026-05-17 11:00:00-07'),
    (gen_random_uuid(), v_tenant, v_submitter, 'approved', 'Adobe Creative Cloud', '2026-05-16',
     79.99, 'CAD', null, null, null, v_software_acct, v_adobe, null,
     'corp_card', '8821', '2026-05-16 09:00:00-07'),
    (gen_random_uuid(), v_tenant, v_submitter, 'approved', 'Uber YVR-DT', '2026-05-14',
     32.14, 'CAD', 1.53, v_gst, null, v_office_acct, v_uber, v_proj_west,
     'corp_card', '8821', '2026-05-14 18:45:00-07');
end $$;
