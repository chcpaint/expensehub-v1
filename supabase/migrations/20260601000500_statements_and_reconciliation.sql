-- ============================================================================
-- ExpenseHub V1 — Credit-card statements + reconciliation
-- ============================================================================

create table public.card_statements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  uploaded_by     uuid not null references auth.users(id),
  card_account_id uuid references public.coa_accounts(id),  -- the bank/CC asset account
  card_last4      text,
  card_label      text,                                      -- 'Visa 8821 (corp)'
  period_start    date,
  period_end      date,
  source          text not null check (source in ('csv','ofx','qfx','pdf','manual')),
  storage_path    text,                                      -- original file
  line_count      int default 0,
  matched_count   int default 0,
  unmatched_count int default 0,
  status          text not null default 'parsed'
                  check (status in ('parsed','reconciling','closed','archived')),
  uploaded_at     timestamptz default now(),
  closed_at       timestamptz,
  closed_by       uuid references auth.users(id)
);

create index idx_card_statements_tenant_status
  on public.card_statements (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Individual lines parsed from the statement
-- ---------------------------------------------------------------------------
create table public.statement_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  statement_id        uuid not null references public.card_statements(id) on delete cascade,
  txn_date            date not null,
  post_date           date,
  description         text not null,
  amount              numeric(12,2) not null,         -- absolute value (sign in is_debit)
  is_debit            boolean not null default true,
  card_last4          text,
  external_ref        text,                            -- bank-side txn id if present

  -- match outcome
  matched_expense_id  uuid references public.expenses(id) on delete set null,
  match_score         int,                             -- 0-110 from matcher
  match_reason        jsonb,                           -- { amount:50, date:25, merchant:25, card:10 }
  match_alternates    jsonb,                           -- [{ expense_id, score }]

  status              text not null default 'unmatched'
                      check (status in ('unmatched','matched','suggested','dismissed','no_receipt','personal')),
  resolved_by         uuid references auth.users(id),
  resolved_at         timestamptz,
  resolution_note     text,

  created_at          timestamptz default now()
);

create index idx_statement_lines_status on public.statement_lines (tenant_id, status);
create index idx_statement_lines_statement on public.statement_lines (statement_id);
create index idx_statement_lines_matched_expense on public.statement_lines (matched_expense_id);

-- ---------------------------------------------------------------------------
-- Backfill the FK from expenses.reconciled_statement_line_id
-- ---------------------------------------------------------------------------
alter table public.expenses
  add constraint fk_expenses_recon_line
  foreign key (reconciled_statement_line_id) references public.statement_lines(id) on delete set null;

create index idx_expenses_recon_line on public.expenses (reconciled_statement_line_id);

-- ---------------------------------------------------------------------------
-- Audit table for manual reconciliation decisions
-- (separate from main audit_log so reconciliation work is queryable as a unit)
-- ---------------------------------------------------------------------------
create table public.match_overrides (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  line_id      uuid not null references public.statement_lines(id) on delete cascade,
  expense_id   uuid references public.expenses(id),
  action       text not null check (action in
               ('manual_match','unmatch','mark_personal','no_receipt_filed','request_receipt','recurring')),
  actor_id     uuid not null references auth.users(id),
  reason       text,
  occurred_at  timestamptz default now()
);
create index idx_match_overrides_line on public.match_overrides (line_id);

-- ---------------------------------------------------------------------------
-- CSV column mappings remembered per-card (so the bookkeeper only maps once)
-- ---------------------------------------------------------------------------
create table public.statement_csv_mappings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  card_account_id   uuid references public.coa_accounts(id),
  card_last4        text,
  bank_signature    text,                              -- hash of header row to auto-match next time
  date_column       text not null,
  description_column text not null,
  amount_column     text,                              -- some banks have one column
  debit_column      text,                              -- others split debit/credit
  credit_column     text,
  date_format       text not null default 'MM/DD/YYYY',
  amount_is_negative_for_debit boolean default false,
  updated_at        timestamptz default now(),
  unique (tenant_id, bank_signature)
);
