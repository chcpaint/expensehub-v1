'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const ACCENTS = ['#1F3A5F','#7A2E2E','#1B5E3F','#5D3F8C','#C46A1F','#236B7A','#444'];
const ADAPTERS = [
  { id: 'accountedge',   label: 'AccountEdge',         sub: 'CSV export (Spend Money)' },
  { id: 'universal_csv', label: 'Universal CSV/Excel', sub: 'Works with any bookkeeper' },
  { id: 'qb_desktop',    label: 'QuickBooks Desktop',  sub: 'IIF file export' },
];

export default function OnboardForm({ tenant, profile }: any) {
  const [name, setName] = useState(tenant?.name ?? '');
  const [accent, setAccent] = useState(tenant?.accent_color ?? '#1F3A5F');
  const [adapter, setAdapter] = useState(tenant?.file_export_adapter ?? 'accountedge');
  const [mode, setMode] = useState<'standalone'|'file_export'|'api_sync'>(tenant?.integration_mode ?? 'file_export');
  const [taxRegion, setTaxRegion] = useState(tenant?.tax_region ?? 'CA');
  const [dateFormat, setDateFormat] = useState(profile?.date_format ?? 'MM/DD/YYYY');
  const [defaultCheque, setDefaultCheque] = useState(profile?.default_cheque_account ?? '1-1140');
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    const sb = supabaseBrowser();
    setStatus('Saving…');
    await sb.from('tenants').update({
      name, accent_color: accent, tax_region: taxRegion,
      integration_mode: mode,
      file_export_adapter: mode === 'file_export' ? adapter : null,
    }).eq('id', tenant.id);
    await sb.from('export_profiles').upsert({
      tenant_id: tenant.id, adapter,
      date_format: dateFormat, default_cheque_account: defaultCheque,
    }, { onConflict: 'tenant_id,adapter' });
    setStatus('Saved.');
    setTimeout(() => setStatus(null), 2000);
  }

  return (
    <div className="grid grid-cols-2 gap-8 max-w-5xl">
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Tenant settings</h1>

        <Field label="Company name">
          <input className="w-full border border-line-strong rounded-md px-3 py-2"
            value={name} onChange={e => setName(e.target.value)} />
        </Field>

        <Field label="Logo">
          <div className="border-2 border-dashed border-line-strong rounded-lg p-6 text-center text-sm text-ink-dim">
            Upload PNG · 512×512 recommended (drag-drop coming next milestone)
          </div>
        </Field>

        <Field label="Accent colour">
          <div className="flex gap-2 flex-wrap">
            {ACCENTS.map(c => (
              <button key={c} onClick={() => setAccent(c)} className="w-8 h-8 rounded-md border-white border-[3px]"
                style={{ background: c, boxShadow: accent === c ? '0 0 0 2px #1a1f2e' : '0 0 0 1px #cdd1da' }} />
            ))}
          </div>
        </Field>

        <Field label="Integration mode">
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(['standalone','file_export','api_sync'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`p-3 rounded-md border-2 text-left ${mode === m ? 'border-tenant bg-tenant-soft' : 'border-line'}`}>
                <div className="font-bold">{m === 'standalone' ? 'Standalone' : m === 'file_export' ? 'File export' : 'API sync'}</div>
                <div className="text-[11px] text-ink-dim mt-1">
                  {m === 'standalone' && 'ExpenseHub is system of record'}
                  {m === 'file_export' && 'Export CSV/IIF to import manually'}
                  {m === 'api_sync' && 'Direct sync (V2)'}
                </div>
              </button>
            ))}
          </div>
        </Field>

        {mode === 'file_export' && (
          <Field label="Accounting system">
            <div className="grid grid-cols-3 gap-2">
              {ADAPTERS.map(a => (
                <button key={a.id} onClick={() => setAdapter(a.id)}
                  className={`p-3 rounded-md border-2 text-left ${adapter === a.id ? 'border-tenant bg-tenant-soft' : 'border-line'}`}>
                  <div className="font-bold text-sm">{a.label}</div>
                  <div className="text-[11px] text-ink-dim mt-1">{a.sub}</div>
                </button>
              ))}
            </div>
          </Field>
        )}

        {mode === 'file_export' && (
          <>
            <Field label="Default cheque/bank account (in your accounting system)">
              <input className="w-full border border-line-strong rounded-md px-3 py-2" value={defaultCheque}
                onChange={e => setDefaultCheque(e.target.value)} placeholder="e.g. 1-1140" />
            </Field>
            <Field label="Date format for exports">
              <select className="w-full border border-line-strong rounded-md px-3 py-2"
                value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
                <option>MM/DD/YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option>
              </select>
            </Field>
          </>
        )}

        <Field label="Default tax region">
          <select className="w-full border border-line-strong rounded-md px-3 py-2"
            value={taxRegion} onChange={e => setTaxRegion(e.target.value)}>
            <option value="CA">Canada</option><option value="US">United States</option>
            <option value="UK">United Kingdom</option><option value="AU">Australia</option><option value="EU">European Union</option>
          </select>
        </Field>

        <button onClick={save} className="w-full bg-tenant text-white py-3 rounded-md font-bold">Save</button>
        {status && <p className="text-sm text-ink-dim text-center">{status}</p>}
      </div>

      <div className="bg-line/30 rounded-xl p-6">
        <div className="text-[10px] uppercase tracking-wider text-ink-dim font-bold">Live preview</div>
        <div className="mt-3 bg-white rounded-lg border border-line p-4 max-w-sm mx-auto">
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center text-white font-extrabold"
                 style={{ background: accent }}>
              {name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
            </div>
            <div>
              <div className="font-bold">{name}</div>
              <div className="text-[11px] text-ink-dim">My expenses</div>
            </div>
          </div>
          <div className="text-xs text-ink-dim mt-3">
            Per-tenant branding appears across phone, tablet, and desktop. Bookkeeper exports as <strong>{adapter}</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-ink-dim font-bold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
