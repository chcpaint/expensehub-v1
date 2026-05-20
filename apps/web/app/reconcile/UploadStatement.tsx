'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function UploadStatement() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cardLabel, setCardLabel] = useState('Visa 8821 (corp)');
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setErr(null);
    try {
      const sb = supabaseBrowser();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error('not signed in');
      const tenantId = (session.user.app_metadata as any).tenant_id;

      const path = `${tenantId}/statements/${Date.now()}-${file.name}`;
      const { error: e1 } = await sb.storage.from('statements').upload(path, file, { upsert: false });
      if (e1) throw e1;

      const source = file.name.endsWith('.csv') ? 'csv'
                   : file.name.endsWith('.ofx') ? 'ofx'
                   : file.name.endsWith('.qfx') ? 'qfx'
                   : file.name.endsWith('.pdf') ? 'pdf' : 'manual';

      const r1 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/statements-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: path, source, card_label: cardLabel }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error ?? 'upload failed');

      // Run matcher immediately
      const r2 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/statements-match`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement_id: j1.statement_id }),
      });
      if (!r2.ok) throw new Error((await r2.json()).error ?? 'match failed');

      router.push(`/reconcile/${j1.statement_id}`);
      router.refresh();
    } catch (err: any) {
      setErr(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input className="border border-line-strong rounded-md px-2 py-1 text-sm" value={cardLabel}
        onChange={e => setCardLabel(e.target.value)} placeholder="Card label" />
      <label className="px-3 py-2 rounded-md bg-tenant text-white text-sm font-bold cursor-pointer">
        {busy ? 'Uploading…' : '+ Upload statement'}
        <input type="file" hidden accept=".csv,.ofx,.qfx,.pdf" onChange={onFile} disabled={busy} />
      </label>
      {err && <span className="text-bad text-xs">{err}</span>}
    </div>
  );
}
