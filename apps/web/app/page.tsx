// Owner Dashboard — RSC pulls aggregations via Supabase RPC.
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase
    .from('expenses')
    .select('total_amount, status, txn_date, account:coa_accounts(name)')
    .gte('txn_date', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));

  const mtd = (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const pendingCount = (rows ?? []).filter(r => r.status === 'pending_approval').length;
  const exportedCount = (rows ?? []).filter(r => r.status === 'exported' || r.status === 'reconciled').length;

  // Category aggregation
  const byCategory: Record<string, number> = {};
  (rows ?? []).forEach(r => {
    const name = (r as any).account?.name ?? 'Uncategorized';
    byCategory[name] = (byCategory[name] ?? 0) + Number(r.total_amount ?? 0);
  });
  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...top.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spend Dashboard</h1>
          <p className="text-sm text-ink-dim">Last 30 days</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ready-to-export" className="px-3 py-2 rounded-md bg-tenant text-white text-sm font-semibold">Ready to export →</Link>
          <Link href="/reconcile" className="px-3 py-2 rounded-md bg-white border border-line text-sm font-semibold">Reconcile statements →</Link>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Spend MTD"          value={'$' + mtd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
        <Kpi label="Receipts"           value={String(rows?.length ?? 0)} />
        <Kpi label="Pending approval"   value={String(pendingCount)} />
        <Kpi label="Exported/reconciled" value={String(exportedCount)} />
      </div>

      <section className="bg-white rounded-lg border border-line p-5">
        <h3 className="text-sm font-bold mb-3">Spend by category</h3>
        <ul className="space-y-2">
          {top.length === 0
            ? <li className="text-sm text-ink-dim">No expenses in the last 30 days.</li>
            : top.map(([name, val]) => (
              <li key={name} className="flex items-center gap-3">
                <div className="w-40 text-sm truncate">{name}</div>
                <div className="flex-1 bg-line h-3 rounded-full overflow-hidden">
                  <div className="h-3" style={{ width: `${(val / max) * 100}%`, background: 'var(--tenant)' }} />
                </div>
                <div className="w-28 text-right text-sm font-mono">${val.toFixed(2)}</div>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-line p-4">
      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-dim">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
