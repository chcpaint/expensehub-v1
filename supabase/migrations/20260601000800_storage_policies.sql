-- ============================================================================
-- ExpenseHub V1 — Storage buckets and RLS
-- ============================================================================

-- Buckets are private; access is via signed URLs and bucket policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 26214400,                 -- 25 MB
    array['image/png','image/jpeg','image/gif','image/heic','application/pdf']),
  ('statements', 'statements', false, 52428800,             -- 50 MB
    array['text/csv','application/vnd.ms-excel',
          'application/x-ofx','application/x-qfx','application/pdf']),
  ('exports', 'exports', false, 10485760,                   -- 10 MB
    array['text/csv','text/tab-separated-values','application/vnd.ms-excel','application/octet-stream']),
  ('logos', 'logos', false, 2097152,                        -- 2 MB
    array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Path convention is '{tenant_id}/...' for every bucket.
-- storage.foldername(name)[1] gives the first path segment.
-- ---------------------------------------------------------------------------

-- Receipts: tenant-scoped read; tenant-scoped insert
create policy "receipts: tenant read"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = public.app_tenant()::text
  );

create policy "receipts: tenant insert"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = public.app_tenant()::text
  );

create policy "receipts: tenant update own draft"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = public.app_tenant()::text
    and owner = auth.uid()
  );

-- Statements
create policy "statements: tenant read"
  on storage.objects for select
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = public.app_tenant()::text
    and public.has_role(array['accounting','admin','owner'])
  );

create policy "statements: tenant insert"
  on storage.objects for insert
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = public.app_tenant()::text
    and public.has_role(array['accounting','admin','owner'])
  );

-- Exports
create policy "exports: tenant read"
  on storage.objects for select
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = public.app_tenant()::text
    and public.has_role(array['accounting','admin','owner'])
  );

-- Logos (public-ish but still RLS-gated; signed URLs used for display)
create policy "logos: tenant read"
  on storage.objects for select
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.app_tenant()::text
  );

create policy "logos: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.app_tenant()::text
    and public.has_role(array['admin','owner'])
  );
