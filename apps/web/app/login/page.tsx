'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-3xl font-extrabold" style={{ color: 'var(--tenant)' }}>ExpenseHub</div>
          <div className="text-sm text-ink-dim mt-1">Admin & accounting console</div>
        </div>
        <label className="block">
          <span className="text-xs uppercase text-ink-dim font-bold tracking-wider">Work email</span>
          <input className="block w-full border border-line-strong rounded-md px-3 py-2 mt-1"
            type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-ink-dim font-bold tracking-wider">Password</span>
          <input className="block w-full border border-line-strong rounded-md px-3 py-2 mt-1"
            type="password" value={pw} onChange={e => setPw(e.target.value)} required />
        </label>
        {err && <p className="text-bad text-sm">{err}</p>}
        <button disabled={busy} className="w-full bg-tenant text-white py-3 rounded-md font-bold disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-ink-dim text-center">Use one of the demo accounts seeded by <code>supabase db reset</code>.</p>
      </form>
    </div>
  );
}
