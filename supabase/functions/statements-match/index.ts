// ============================================================================
// POST /functions/v1/statements-match
// Body: { statement_id }
//
// Runs the matching algorithm against all unmatched lines on the statement.
// ============================================================================
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { requireAuth, requireRole, HttpError } from '../_shared/auth.ts';

interface Body { statement_id: string; }

// Inline matching algorithm (mirror of @expensehub/reconciliation/src/matcher.ts)
const AUTO = 80, SUGGEST = 40, GAP = 20;

function normalizeMerchant(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  for (const p of ['sq * ','sq*','pos ','visa ','mc ','tst * ','tst*','paypal *','paypal*']) {
    if (s.startsWith(p)) s = s.slice(p.length);
  }
  const cuts = ['#','*','  ','\t'];
  for (const c of cuts) { const i = s.indexOf(c); if (i > 0) s = s.slice(0, i); }
  s = s.replace(/\b[a-z]{2}\b$/g, '').replace(/\b\d{5,}\b/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

function lev(a: string, b: string): number {
  if (!a) return b.length; if (!b) return a.length;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const c = a[i-1] === b[j-1] ? 0 : 1;
      curr[j] = Math.min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + c);
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const na = normalizeMerchant(a), nb = normalizeMerchant(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const m = Math.max(na.length, nb.length);
  return Math.max(0, 1 - lev(na, nb) / m);
}

function score(line: any, exp: any): { total: number; reason: any } {
  const reason = { amount: 0, date: 0, merchant: 0, card: 0 };
  if (Math.abs(Number(line.amount) - Number(exp.total_amount ?? 0)) > 0.01) return { total: 0, reason };
  reason.amount = 50;
  if (!exp.txn_date) return { total: 0, reason };
  const days = Math.abs((new Date(line.txn_date).getTime() - new Date(exp.txn_date).getTime()) / 86_400_000);
  if      (days === 0) reason.date = 25;
  else if (days <= 1)  reason.date = 20;
  else if (days <= 3)  reason.date = 12;
  else if (days <= 7)  reason.date = 5;
  else return { total: 0, reason };
  const sim = similarity(line.description, exp.merchant ?? '');
  if      (sim >= 0.85) reason.merchant = 25;
  else if (sim >= 0.65) reason.merchant = 15;
  else if (sim >= 0.40) reason.merchant = 5;
  if (line.card_last4 && exp.payment_card_last4 && line.card_last4 === exp.payment_card_last4) reason.card = 10;
  return { total: reason.amount + reason.date + reason.merchant + reason.card, reason };
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const ctx = await requireAuth(req);
    requireRole(ctx, ['accounting', 'admin', 'owner']);
    const body: Body = await req.json();

    // 1. Load the statement + its unmatched lines
    const { data: stmt } = await ctx.serviceClient
      .from('card_statements').select('id, period_start, period_end')
      .eq('id', body.statement_id).single();
    if (!stmt) return jsonResponse({ error: 'statement not found' }, { status: 404 });

    const { data: lines } = await ctx.serviceClient
      .from('statement_lines')
      .select('id, txn_date, description, amount, card_last4, status')
      .eq('statement_id', body.statement_id)
      .eq('status', 'unmatched');
    if (!lines || lines.length === 0) return jsonResponse({ ok: true, matched: 0, suggested: 0 });

    // 2. Candidate pool: every approved/exported expense in the same period ± 7 days
    const fromDate = new Date(new Date(stmt.period_start as string).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const toDate   = new Date(new Date(stmt.period_end   as string).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

    const { data: candidates } = await ctx.serviceClient
      .from('expenses')
      .select('id, total_amount, txn_date, merchant, payment_card_last4, reconciled_statement_line_id')
      .eq('tenant_id', ctx.tenantId)
      .in('status', ['approved', 'exported'])
      .is('reconciled_statement_line_id', null)
      .gte('txn_date', fromDate)
      .lte('txn_date', toDate);

    const consumed = new Set<string>();
    let matched = 0, suggested = 0;
    const updates: any[] = [];

    // Two-pass: confident matches first
    for (const phase of ['matched', 'suggested'] as const) {
      for (const line of lines) {
        if (updates.find(u => u.id === line.id)) continue;
        const pool = (candidates ?? []).filter(c => !consumed.has(c.id));
        const scored = pool.map(c => ({ exp: c, ...score(line, c) }))
                           .filter(s => s.total > 0)
                           .sort((a, b) => b.total - a.total);
        if (scored.length === 0) continue;

        const [winner, ...rest] = scored;
        const runnerUp = rest[0]?.total ?? 0;
        const auto = winner.total >= AUTO && (winner.total - runnerUp) >= GAP;
        const sug  = winner.total >= SUGGEST;

        if (phase === 'matched' && auto) {
          consumed.add(winner.exp.id);
          updates.push({
            id: line.id, matched_expense_id: winner.exp.id, status: 'matched',
            match_score: winner.total, match_reason: winner.reason,
            match_alternates: rest.slice(0, 3).map(r => ({ expense_id: r.exp.id, score: r.total })),
          });
          matched++;
        } else if (phase === 'suggested' && sug && !auto) {
          updates.push({
            id: line.id, matched_expense_id: winner.exp.id, status: 'suggested',
            match_score: winner.total, match_reason: winner.reason,
            match_alternates: rest.slice(0, 3).map(r => ({ expense_id: r.exp.id, score: r.total })),
          });
          suggested++;
        }
      }
    }

    // 3. Apply line updates
    for (const u of updates) {
      await ctx.serviceClient.from('statement_lines').update(u).eq('id', u.id);
    }

    // 4. Mark auto-matched expenses as reconciled
    const autoIds = updates.filter(u => u.status === 'matched');
    for (const u of autoIds) {
      await ctx.serviceClient.from('expenses')
        .update({
          reconciled_statement_line_id: u.id,
          reconciled_at: new Date().toISOString(),
          status: 'reconciled',
        })
        .eq('id', u.matched_expense_id);
    }

    // 5. Update statement summary
    const total = lines.length;
    const unmatched = total - matched - suggested;
    await ctx.serviceClient.from('card_statements').update({
      matched_count: matched, unmatched_count: unmatched, status: 'reconciling',
    }).eq('id', body.statement_id);

    return jsonResponse({ ok: true, total, matched, suggested, unmatched });
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, { status: err.status });
    console.error(err);
    return jsonResponse({ error: 'internal', detail: String(err) }, { status: 500 });
  }
});
