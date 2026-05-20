-- ============================================================================
-- ExpenseHub V1 — Expenses, receipts, OCR results, approvals, post/export jobs
-- ============================================================================

create table public.expenses (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references public.tenants(id) on delete restrict,
  submitter_id                  uuid not null references auth.users(id),
  status                        text not null default 'draft' check (status in (
                                  'draft','pending_approval','approved','rejected',
                                  'queued_export','exported','reconciled',
                                  'queued_post','posted','post_failed',
                                  'archived')),

  -- core
  merchant                      text,
  txn_date                      date,
  total_amount                  numeric(12,2),
  currency                      text default 'CAD',
  fx_rate                       numeric(14,6),
  tax_amount                    numeric(12,2),
  tax_code_id                   uuid references public.tax_codes(id),

  -- categorization
  category_id                   uuid references public.categories(id),
  account_id                    uuid references public.coa_accounts(id),
  vendor_id                     uuid references public.coa_vendors(id),
  class_id                      uuid references public.coa_dimensions(id),
  department_id                 uuid references public.coa_dimensions(id),
  location_id                   uuid references public.coa_dimensions(id),
  project_id                    uuid references public.coa_dimensions(id),

  -- payment / source
  payment_method                text check (payment_method in
                                ('cash','personal_card','corp_card','reimbursable')),
  payment_card_last4            text,
  notes                         text,
  justification                 text,                  -- required if policy demands

  -- capture context
  geo_lat                       numeric(9,6),
  geo_lng                       numeric(9,6),
  geo_location_name             text,
  captured_at                   timestamptz,
  perceptual_hash               text,                  -- duplicate detection

  -- reconciliation linkage
  reconciled_statement_line_id  uuid,                  -- FK added in statements migration
  reconciled_at                 timestamptz,

  -- export / post results
  export_job_id                 uuid,
  exported_at                   timestamptz,
  cheque_number                 text,                  -- AccountEdge ref e.g. EH-04421
  post_ref                      jsonb,                 -- v2 API-sync result
  posted_at                     timestamptz,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index idx_expenses_tenant_status   on public.expenses (tenant_id, status);
create index idx_expenses_tenant_submitter on public.expenses (tenant_id, submitter_id);
create index idx_expenses_tenant_date     on public.expenses (tenant_id, txn_date desc);
create index idx_expenses_tenant_phash    on public.expenses (tenant_id, perceptual_hash);
create index idx_expenses_merchant_trgm   on public.expenses using gin (merchant gin_trgm_ops);

create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Receipts (the actual files; metadata only — file in storage)
-- ---------------------------------------------------------------------------
create table public.receipts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  storage_path text not null,                          -- 'receipts/{tenant}/{expense}/{uuid}.png'
  mime_type    text not null,
  size_bytes   int,
  page_count   int default 1,
  uploaded_by  uuid references auth.users(id),
  uploaded_at  timestamptz default now()
);
create index idx_receipts_expense on public.receipts (expense_id);

-- ---------------------------------------------------------------------------
-- OCR results (one row per expense; latest run)
-- ---------------------------------------------------------------------------
create table public.ocr_results (
  expense_id     uuid primary key references public.expenses(id) on delete cascade,
  tenant_id      uuid not null,
  provider       text not null default 'document_ai',  -- 'document_ai' | 'veryfi' | 'stub'
  raw_json       jsonb not null,
  field_confidence jsonb not null default '{}'::jsonb, -- { merchant: 0.98, total: 0.99 }
  ai_suggestion  jsonb,                                -- { account_external_id, confidence, reasoning, flags }
  bounding_boxes jsonb,                                -- for tap-to-correct mobile UI
  processed_at   timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Approval steps (ordered chain)
-- ---------------------------------------------------------------------------
create table public.approval_steps (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  step_order  int not null,
  approver_id uuid not null references auth.users(id),
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','skipped')),
  acted_at    timestamptz,
  comment     text,
  created_at  timestamptz default now()
);
create index idx_approval_steps_approver_pending
  on public.approval_steps (approver_id, status) where status = 'pending';
create index idx_approval_steps_expense on public.approval_steps (expense_id, step_order);

-- ---------------------------------------------------------------------------
-- Export jobs (file-based) — built by FileExportAdapter
-- ---------------------------------------------------------------------------
create table public.export_jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  adapter         text not null,                       -- 'accountedge' | 'universal_csv' | 'qb_iif'
  requested_by    uuid not null references auth.users(id),
  expense_ids     uuid[] not null,
  expense_count   int generated always as (array_length(expense_ids, 1)) stored,
  filename        text,
  storage_path    text,                                -- generated file in storage
  status          text not null default 'pending'
                  check (status in ('pending','running','completed','failed','confirmed')),
  download_count  int default 0,
  confirmed_by    uuid references auth.users(id),     -- accounting clicks "confirm import"
  confirmed_at    timestamptz,
  error           text,
  created_at      timestamptz default now(),
  completed_at    timestamptz
);
create index idx_export_jobs_tenant on public.export_jobs (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Post jobs (API-sync, V2) — defined now so the state machine handles both modes
-- ---------------------------------------------------------------------------
create table public.post_jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  expense_id      uuid not null references public.expenses(id) on delete cascade,
  adapter         text not null,                        -- 'qbo' | 'xero' | 'intacct'
  idempotency_key text not null,
  status          text not null default 'queued'
                  check (status in ('queued','running','success','failed')),
  attempts        int default 0,
  last_error      text,
  created_at      timestamptz default now(),
  completed_at    timestamptz
);
create unique index idx_post_jobs_idem on public.post_jobs (tenant_id, idempotency_key);

-- ---------------------------------------------------------------------------
-- Backfill FK on expenses now that export_jobs exists
-- ---------------------------------------------------------------------------
alter table public.expenses
  add constraint fk_expenses_export_job
  foreign key (export_job_id) references public.export_jobs(id) on delete set null;
