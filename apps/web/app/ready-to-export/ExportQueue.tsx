'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

interface Props { rows: any[]; accounts: any[]; tenant: any; }

export default function ExportQueue({ rows, accounts, tenant }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.map(r => r.id)));
  const [adapter, setAdapter] = useState(tenant?.file_export_adapter ?? 'accountedge');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);
  const [items, setItems] = useState(rows);

  const total = items.filter(r => selected.has(r.id))
    .reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

  const toggle = (id: string) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const changeAccount = async (expenseId: string, accountId: string) => {
    await supabaseBrowser().from('expenses').update({ account_id: accountId }).eq('id', expenseId);
    setItems(items.map(r => r.id === expenseId
      ? { ...r, account: accounts.find(a => a.id === accountId) }
      : r));
  };

  const exportNow = async () => {
    setBusy(true); setResult(null);
    const { data: { session } } = await supabaseBrowser().auth.getSession();
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/expenses-bulk-export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense_ids: Array.from(selected), adapter }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setResult({ ok: false, msg: j.error ?? 'failed' }); return; }
    setResult({ ok: true, msg: `Exported ${j.expense_count} expenses to ${j.filename}`, url: j.download_url });
    // Optimistically remove exported rows
    setItems(items.filter(r => !selected.has(r.id)));
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Ready to export</h1>
        <p className="text-sm text-ink-dim">{items.length} approved · ${total.toFixed(2)} selected</p>
      </header>

      <div className="flex gap-2 items-center flex-wrap">
        <input type="search" placeholder="Search merchant, submitter, notes…"
          className="border border-line-strong rounded-md px-3 py-2 text-sm flex-1 min-w-[240px]" />
        <select value={adapter} onChange={e => setAdapter(e.target.value)}
          className="border border-line-strong rounded-md px-3 py-2 text-sm font-semibold" style={{ color: 'var(--tenant)' }}>
          <option value="accountedge">AccountEdge Spend Money</option>
          <option value="universal_csv">Universal CSV / Excel</option>
          <option value="qb_desktop">QuickBooks Desktop (IIF)</option>
        </select>
        <button disabled={busy || selected.size === 0} onClick={exportNow}
          className="px-4 py-2 rounded-md bg-tenant text-white text-sm font-bold disabled:opacity-50">
          {busy ? 'Exporting…' : `⬇ Export ${selected.size}`}
        </button>
      </div>

      {result && (
        <div className={`p-3 rounded-md text-sm ${result.ok ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'}`}>
          {result.msg}
          {result.url && <> · <a className="underline" href={result.url} target="_blank">Download CSV</a></>}
        </div>
      )}

      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="p-3 text-left"><input type="checkbox" checked={selected.size === items.length && items.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(items.map(r => r.id)) : new Set())} /></th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Merchant</th>
              <th className="p-3 text-left">Submitter</th>
              <th className="p-3 text-left">GL Account</th>
              <th className="p-3 text-left">Project</th>
              <th className="p-3 text-left">Tax</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-t border-line hover:bg-line/20">
                <td className="p-3"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-3 whitespace-nowrap">{r.txn_date}</td>
                <td className="p-3">
                  <div className="font-semibold">{r.merchant}</div>
                  <div className="text-[11px] text-ink-dim">{r.justification ?? ''}</div>
                </td>
                <td className="p-3">{r.submitter?.display_name ?? '—'}</td>
                <td className="p-3">
                  <select value={r.account?.id ?? ''} onChange={e => changeAccount(r.id, e.target.value)}
                    className="border border-line-strong rounded px-2 py-1 text-xs max-w-[220px]">
                    <option value="">— Pick account —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </td>
                <td className="p-3">{r.project?.name ?? '—'}</td>
                <td className="p-3">{r.tax_code?.name ?? '—'}</td>
                <td className="p-3 text-right font-mono">${Number(r.total_amount ?? 0).toFixed(2)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-ink-dim">Nothing approved and waiting to export. 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
