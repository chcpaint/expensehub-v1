import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import UploadStatement from './UploadStatement';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: statements } = await supabase
    .from('card_statements')
    .select('id, card_label, card_last4, period_start, period_end, line_count, matched_count, unmatched_count, status, uploaded_at')
    .order('uploaded_at', { ascending: false });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reconcile statements</h1>
          <p className="text-sm text-ink-dim">Match credit-card statement lines to submitted receipts.</p>
        </div>
        <UploadStatement />
      </header>

      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="p-3 text-left">Card</th>
              <th className="p-3 text-left">Period</th>
              <th className="p-3 text-right">Lines</th>
              <th className="p-3 text-right">Matched</th>
              <th className="p-3 text-right">Unmatched</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(statements ?? []).map(s => (
              <tr key={s.id} className="border-t border-line">
                <td className="p-3 font-semibold">{s.card_label ?? `••••${s.card_last4 ?? ''}`}</td>
                <td className="p-3 whitespace-nowrap">{s.period_start} → {s.period_end}</td>
                <td className="p-3 text-right">{s.line_count}</td>
                <td className="p-3 text-right text-ok font-semibold">{s.matched_count}</td>
                <td className="p-3 text-right text-bad font-semibold">{s.unmatched_count}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3"><Link className="text-tenant underline" href={`/reconcile/${s.id}`}>Open →</Link></td>
              </tr>
            ))}
            {(!statements || statements.length === 0) && (
              <tr><td colSpan={7} className="p-8 text-center text-ink-dim">No statements uploaded yet. Drag one in above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
