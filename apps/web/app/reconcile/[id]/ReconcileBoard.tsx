'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function ReconcileBoard({ statement, lines, candidates }: any) {
  const [items, setItems] = useState<any[]>(lines);
  const router = useRouter();

  const grouped = {
    matched:   items.filter(l => l.status === 'matched'),
    suggested: items.filter(l => l.status === 'suggested'),
    unmatched: items.filter(l => l.status === 'unmatched'),
    no_receipt: items.filter(l => l.status === 'no_receipt'),
    personal:  items.filter(l => l.status === 'personal'),
  };

  async function setStatus(line: any, status: string, expenseId?: string | null) {
    const sb = supabaseBrowser();
    const patch: any = { status };
    if (expenseId !== undefined) patch.matched_expense_id = expenseId;
    await sb.from('statement_lines').update(patch).eq('id', line.id);

    if (status === 'matched' && expenseId) {
      await sb.from('expenses').update({
        reconciled_statement_line_id: line.id,
        reconciled_at: new Date().toISOString(),
        status: 'reconciled',
      }).eq('id', expenseId);
    }
    setItems(items.map(l => l.id === line.id ? { ...l, ...patch } : l));
    await sb.from('match_overrides').insert({
      tenant_id: line.tenant_id, line_id: line.id, expense_id: expenseId,
      action: status === 'matched' ? 'manual_match' : status === 'personal' ? 'mark_personal' : status === 'no_receipt' ? 'no_receipt_filed' : 'unmatch',
    });
  }

  async function closeStatement() {
    const sb = supabaseBrowser();
    await sb.from('card_statements').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', statement.id);
    router.push('/reconcile');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">{statement.card_label ?? `••••${statement.card_last4 ?? ''}`}</h1>
          <p className="text-sm text-ink-dim">{statement.period_start} → {statement.period_end} · {items.length} lines</p>
        </div>
        <button onClick={closeStatement} className="px-3 py-2 rounded-md bg-tenant text-white text-sm font-bold">Close reconciliation</button>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Tile color="ok"   label="Auto-matched"               n={grouped.matched.length} />
        <Tile color="warn" label="Suggested · needs confirm"  n={grouped.suggested.length} />
        <Tile color="bad"  label="No receipt"                  n={grouped.unmatched.length + grouped.no_receipt.length} />
        <Tile color="info" label="Personal / dismissed"        n={grouped.personal.length} />
      </div>

      <Section title="⚠ Suggested matches — confirm or pick another">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="p-2 text-left">Statement line</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-left">Best-match receipt</th>
              <th className="p-2 text-left">Score</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {grouped.suggested.map(l => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-2 font-semibold">{l.description}</td>
                <td className="p-2 whitespace-nowrap">{l.txn_date}</td>
                <td className="p-2 text-right font-mono">${Number(l.amount).toFixed(2)}</td>
                <td className="p-2">
                  <select defaultValue={l.matched_expense_id ?? ''}
                    onChange={e => setStatus(l, 'matched', e.target.value || null)}
                    className="border border-line-strong rounded px-2 py-1 text-xs max-w-[260px]">
                    {l.matched_expense
                      ? <option value={l.matched_expense_id}>{l.matched_expense.merchant} · ${Number(l.matched_expense.total_amount).toFixed(2)}</option>
                      : <option value="">— No suggestion —</option>}
                    {candidates.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.merchant} · {c.txn_date} · ${Number(c.total_amount).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2"><Badge>{l.match_score}</Badge></td>
                <td className="p-2">
                  <button onClick={() => setStatus(l, 'matched', l.matched_expense_id)} className="px-2 py-1 bg-ok text-white text-xs rounded">✓</button>
                </td>
              </tr>
            ))}
            {grouped.suggested.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-ink-dim text-sm">No ambiguous matches. 🎉</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="🔴 Statement lines with no receipt">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="p-2 text-left">Statement line</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {grouped.unmatched.map(l => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-2 font-semibold">{l.description}</td>
                <td className="p-2 whitespace-nowrap">{l.txn_date}</td>
                <td className="p-2 text-right font-mono">${Number(l.amount).toFixed(2)}</td>
                <td className="p-2">
                  <select onChange={e => setStatus(l, e.target.value)} defaultValue="">
                    <option value="">Choose…</option>
                    <option value="no_receipt">Request receipt</option>
                    <option value="personal">Mark personal / dispute</option>
                    <option value="dismissed">Dismiss</option>
                  </select>
                </td>
              </tr>
            ))}
            {grouped.unmatched.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-ink-dim text-sm">All lines accounted for. 🎉</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="✓ Auto-matched">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="p-2 text-left">Statement line</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-left">Matched receipt</th>
              <th className="p-2 text-left">Score</th>
            </tr>
          </thead>
          <tbody>
            {grouped.matched.map(l => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-2 font-semibold">{l.description}</td>
                <td className="p-2 whitespace-nowrap">{l.txn_date}</td>
                <td className="p-2 text-right font-mono">${Number(l.amount).toFixed(2)}</td>
                <td className="p-2 text-ok">{l.matched_expense?.merchant} ({l.matched_expense?.submitter?.display_name})</td>
                <td className="p-2"><Badge tone="ok">{l.match_score}</Badge></td>
              </tr>
            ))}
            {grouped.matched.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-ink-dim text-sm">No auto-matches yet. Try running the matcher.</td></tr>}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Tile({ color, label, n }: { color: 'ok'|'warn'|'bad'|'info'; label: string; n: number }) {
  const bg = { ok: 'bg-ok/10 border-ok/30', warn: 'bg-warn/10 border-warn/30', bad: 'bg-bad/10 border-bad/30', info: 'bg-tenant/10 border-tenant/30' }[color];
  const fg = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-tenant' }[color];
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className={`text-[10px] uppercase tracking-wider font-bold ${fg}`}>{label}</div>
      <div className="text-2xl font-bold mt-1">{n}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-line overflow-hidden">
      <h3 className="text-sm font-bold p-3 border-b border-line">{title}</h3>
      {children}
    </section>
  );
}
function Badge({ children, tone = 'warn' }: { children: React.ReactNode; tone?: 'ok'|'warn' }) {
  const cls = tone === 'ok' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn';
  return <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${cls}`}>{children}</span>;
}
