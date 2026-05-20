import { createSupabaseServer } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ReconcileBoard from './ReconcileBoard';

export const dynamic = 'force-dynamic';

export default async function StatementDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: stmt } = await supabase.from('card_statements').select('*').eq('id', params.id).single();
  if (!stmt) notFound();

  const { data: lines } = await supabase
    .from('statement_lines')
    .select('*, matched_expense:expenses(id, merchant, txn_date, total_amount, submitter:user_profiles!submitter_id(display_name))')
    .eq('statement_id', params.id)
    .order('txn_date', { ascending: false });

  // Candidate pool for manual matching: unreconciled approved/exported expenses in the period
  const { data: candidates } = await supabase
    .from('expenses')
    .select('id, merchant, txn_date, total_amount, submitter:user_profiles!submitter_id(display_name)')
    .in('status', ['approved', 'exported'])
    .is('reconciled_statement_line_id', null);

  return <ReconcileBoard statement={stmt} lines={lines ?? []} candidates={candidates ?? []} />;
}
