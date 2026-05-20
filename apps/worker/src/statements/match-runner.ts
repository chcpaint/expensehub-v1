// ============================================================================
// Statement match runner — reuses @expensehub/reconciliation
// ============================================================================
import { matchStatement } from '@expensehub/reconciliation';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function runStatementMatch(sb: SupabaseClient, statementId: string) {
  const { data: stmt } = await sb.from('card_statements')
    .select('id, tenant_id, period_start, period_end').eq('id', statementId).single();
  if (!stmt) return;

  const { data: lines } = await sb.from('statement_lines')
    .select('id, txn_date, description, amount, card_last4')
    .eq('statement_id', statementId).eq('status', 'unmatched');
  if (!lines || lines.length === 0) return;

  const fromDate = isoMinusDays(stmt.period_start as string, 7);
  const toDate   = isoPlusDays(stmt.period_end as string, 7);

  const { data: candidates } = await sb.from('expenses')
    .select('id, total_amount, txn_date, merchant, payment_card_last4')
    .eq('tenant_id', stmt.tenant_id)
    .in('status', ['approved', 'exported'])
    .is('reconciled_statement_line_id', null)
    .gte('txn_date', fromDate).lte('txn_date', toDate);

  // Map DB rows to the matcher's expected types
  const lineArgs = lines.map(l => ({
    id: l.id, amount: Number(l.amount), txnDate: l.txn_date,
    description: l.description, cardLast4: l.card_last4 ?? undefined,
  }));
  const candArgs = (candidates ?? []).map(c => ({
    id: c.id, totalAmount: Number(c.total_amount), txnDate: c.txn_date,
    merchant: c.merchant, paymentCardLast4: c.payment_card_last4 ?? undefined,
  }));

  const outcomes = matchStatement(lineArgs as any, candArgs as any);

  let matched = 0, suggested = 0;
  for (const o of outcomes) {
    if (o.status === 'unmatched') continue;
    await sb.from('statement_lines').update({
      status: o.status,
      matched_expense_id: o.best?.expenseId ?? null,
      match_score: o.best?.score ?? null,
      match_reason: o.best?.reason ?? null,
      match_alternates: o.alternates,
    }).eq('id', o.lineId);

    if (o.status === 'matched' && o.best) {
      await sb.from('expenses').update({
        reconciled_statement_line_id: o.lineId,
        reconciled_at: new Date().toISOString(),
        status: 'reconciled',
      }).eq('id', o.best.expenseId);
      matched++;
    } else if (o.status === 'suggested') suggested++;
  }

  const unmatched = lines.length - matched - suggested;
  await sb.from('card_statements').update({
    matched_count: matched, unmatched_count: unmatched, status: 'reconciling',
  }).eq('id', statementId);
}

function isoMinusDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() - days * 86_400_000).toISOString().slice(0, 10);
}
function isoPlusDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
