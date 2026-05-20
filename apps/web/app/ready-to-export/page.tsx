import { createSupabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import ExportQueue from './ExportQueue';

export const dynamic = 'force-dynamic';

export default async function ReadyToExportPage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase
    .from('expenses')
    .select(`
      id, merchant, txn_date, total_amount, currency, tax_amount, payment_method, status, justification,
      account:coa_accounts(id, code, name),
      vendor:coa_vendors(display_name, external_id),
      project:coa_dimensions!project_id(name, code, external_id),
      tax_code:tax_codes(name, external_id),
      submitter:user_profiles!submitter_id(display_name)
    `)
    .eq('status', 'approved')
    .order('txn_date', { ascending: false });

  const { data: accounts } = await supabase
    .from('coa_accounts').select('id, code, name').eq('active', true).order('code');

  const { data: tenant } = await supabase
    .from('tenants').select('id, name, file_export_adapter').single();

  return <ExportQueue rows={rows ?? []} accounts={accounts ?? []} tenant={tenant} />;
}
