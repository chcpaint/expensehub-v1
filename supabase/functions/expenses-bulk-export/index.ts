// ============================================================================
// POST /functions/v1/expenses-bulk-export
//
// Body: { expense_ids: string[], adapter: 'accountedge'|'universal_csv'|'qb_desktop' }
//
// Builds a file using the requested FileExportAdapter, uploads it to the
// 'exports' bucket, marks the included expenses as 'exported', and returns a
// signed download URL.
//
// Note: in this scaffold we inline a minimal copy of the AccountEdge builder
// because Deno can't import the workspace package directly. In a real build
// we'd publish @expensehub/shared to npm or use Deno's npm: specifier.
// ============================================================================
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { requireAuth, requireRole, HttpError } from '../_shared/auth.ts';

interface Body {
  expense_ids: string[];
  adapter: 'accountedge' | 'universal_csv' | 'qb_desktop';
}

const CRLF = '\r\n';
const csv = (v: any) => v === null || v === undefined || v === '' ? '""' : `"${String(v).replace(/"/g, '""')}"`;
const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};
const fmtAmount = (n: number | null) => n === null || n === undefined ? '' : Number(n).toFixed(2);

function buildAccountEdgeCsv(rows: any[], profile: any): string {
  const HEADER = ['Cheque No.','Date','Amount','Cheque Account','Allocation Memo',
                  'Allocation Account No.','Allocation Amount','Job No.','Tax Code','Tax Amount','Card ID'];
  const lines = [HEADER.map(csv).join(',')];
  rows.forEach((r, i) => {
    const cheque = `${profile.cheque_number_prefix ?? 'EH-'}${String((profile.cheque_number_seq ?? 0) + i + 1).padStart(5, '0')}`;
    const memo = [r.merchant ?? '', r.submitter_name ? `· ${r.submitter_name}` : '',
                  r.project_name ? `· ${r.project_name}` : ''].filter(Boolean).join(' ');
    const taxOut = (profile.tax_code_map ?? {})[r.tax_code_name ?? ''] ?? r.tax_code_ext ?? '';
    const subtotal = r.total_amount && r.tax_amount ? Number(r.total_amount) - Number(r.tax_amount) : r.total_amount;
    const cols = [
      cheque, fmtDate(r.txn_date), fmtAmount(r.total_amount),
      profile.default_cheque_account ?? '',
      memo, r.account_code ?? '', fmtAmount(subtotal),
      r.project_ext ?? '', taxOut, fmtAmount(r.tax_amount),
      (r.vendor_ext ?? r.vendor_name ?? '').toUpperCase(),
    ];
    lines.push(cols.map(csv).join(','));
    if (i < rows.length - 1) lines.push('');
  });
  return lines.join(CRLF) + CRLF;
}

function buildUniversalCsv(rows: any[], profile: any): string {
  const HEADER = ['Date','Reference','Vendor','Description','Account_Code','Account_Name',
                  'Project','Payment_Method','Subtotal','Tax_Code','Tax','Total','Currency',
                  'Receipt_URL','Submitter','Approved_By','Approved_At','Notes'];
  const lines = [HEADER.join(',')];
  rows.forEach((r, i) => {
    const ref = `${profile.cheque_number_prefix ?? 'EH-'}${String((profile.cheque_number_seq ?? 0) + i + 1).padStart(5, '0')}`;
    const subtotal = r.total_amount && r.tax_amount ? Number(r.total_amount) - Number(r.tax_amount) : r.total_amount;
    const cells = [
      fmtDate(r.txn_date), ref, r.vendor_name ?? r.merchant ?? '', r.merchant ?? '',
      r.account_code ?? '', r.account_name ?? '', r.project_name ?? '',
      r.payment_method ?? '', fmtAmount(subtotal),
      r.tax_code_name ?? '', fmtAmount(r.tax_amount), fmtAmount(r.total_amount),
      r.currency ?? 'CAD', r.receipt_url ?? '', r.submitter_name ?? '',
      r.approver_name ?? '', r.approved_at ?? '', r.justification ?? '',
    ];
    lines.push(cells.map(c => /[",\r\n]/.test(String(c)) ? csv(c) : String(c)).join(','));
  });
  return lines.join(CRLF) + CRLF;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const ctx = await requireAuth(req);
    requireRole(ctx, ['accounting', 'admin', 'owner']);

    const body: Body = await req.json();
    if (!body.expense_ids?.length) return jsonResponse({ error: 'expense_ids required' }, { status: 400 });

    // 1. Load tenant + profile + denormalized expense rows
    const { data: tenant } = await ctx.serviceClient
      .from('tenants').select('id, slug, base_currency').eq('id', ctx.tenantId).single();

    const { data: profile } = await ctx.serviceClient
      .from('export_profiles').select('*')
      .eq('tenant_id', ctx.tenantId).eq('adapter', body.adapter).maybeSingle();

    if (!profile) return jsonResponse({ error: 'no export profile for ' + body.adapter }, { status: 422 });

    const { data: rows, error: e1 } = await ctx.serviceClient.rpc('build_export_rows', {
      p_tenant: ctx.tenantId, p_ids: body.expense_ids,
    });
    if (e1 || !rows) {
      // Fallback if RPC isn't defined: use a basic query
      const { data: basic } = await ctx.serviceClient
        .from('expenses')
        .select(`
          id, merchant, txn_date, total_amount, tax_amount, currency, payment_method, justification,
          account:coa_accounts(code, name, external_id),
          vendor:coa_vendors(display_name, external_id),
          project:coa_dimensions!project_id(name, code, external_id),
          tax_code:tax_codes(name, external_id)
        `)
        .in('id', body.expense_ids).eq('tenant_id', ctx.tenantId);
      if (!basic) return jsonResponse({ error: 'no rows' }, { status: 404 });
      // Flatten for the builder
      const flat = basic.map((r: any) => ({
        ...r,
        account_code: r.account?.code, account_name: r.account?.name,
        vendor_name: r.vendor?.display_name, vendor_ext: r.vendor?.external_id,
        project_name: r.project?.name, project_ext: r.project?.external_id ?? r.project?.code,
        tax_code_name: r.tax_code?.name, tax_code_ext: r.tax_code?.external_id,
      }));

      // 2. Build the file
      let body_text = '';
      let filename = '';
      const dateTag = new Date().toISOString().slice(0, 10);
      if (body.adapter === 'accountedge') {
        body_text = buildAccountEdgeCsv(flat, profile);
        filename = `expensehub_${dateTag}_${tenant?.slug ?? 'tenant'}_spendmoney.csv`;
      } else if (body.adapter === 'universal_csv') {
        body_text = buildUniversalCsv(flat, profile);
        filename = `expensehub_${dateTag}_${tenant?.slug ?? 'tenant'}_expenses.csv`;
      } else {
        return jsonResponse({ error: 'adapter not yet implemented in edge function: ' + body.adapter }, { status: 501 });
      }

      // 3. Insert export_jobs row
      const { data: job, error: e2 } = await ctx.serviceClient
        .from('export_jobs').insert({
          tenant_id: ctx.tenantId, adapter: body.adapter,
          requested_by: ctx.user.id, expense_ids: body.expense_ids,
          filename, status: 'running',
        }).select().single();
      if (e2 || !job) throw e2 ?? new Error('export_job insert failed');

      // 4. Upload to storage
      const storagePath = `${ctx.tenantId}/${job.id}/${filename}`;
      const { error: e3 } = await ctx.serviceClient.storage
        .from('exports')
        .upload(storagePath, new Blob([body_text], { type: 'text/csv' }), { upsert: true });
      if (e3) throw e3;

      // 5. Sign a download URL (5 min)
      const { data: signed } = await ctx.serviceClient.storage
        .from('exports').createSignedUrl(storagePath, 300);

      // 6. Bump cheque_number_seq + mark expenses 'exported'
      await ctx.serviceClient
        .from('export_profiles')
        .update({ cheque_number_seq: (profile.cheque_number_seq ?? 0) + body.expense_ids.length })
        .eq('id', profile.id);

      await ctx.serviceClient
        .from('expenses')
        .update({ status: 'exported', exported_at: new Date().toISOString(), export_job_id: job.id })
        .in('id', body.expense_ids);

      await ctx.serviceClient.from('export_jobs')
        .update({ status: 'completed', storage_path: storagePath, completed_at: new Date().toISOString() })
        .eq('id', job.id);

      return jsonResponse({
        ok: true,
        job_id: job.id,
        filename,
        download_url: signed?.signedUrl,
        expense_count: body.expense_ids.length,
      });
    }

    return jsonResponse({ error: 'no rows' }, { status: 404 });
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, { status: err.status });
    console.error(err);
    return jsonResponse({ error: 'internal', detail: String(err) }, { status: 500 });
  }
});
