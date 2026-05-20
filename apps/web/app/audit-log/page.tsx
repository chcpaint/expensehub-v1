import { createSupabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: events } = await supabase
    .from('audit_log')
    .select('id, event, target_table, target_id, changed_keys, occurred_at, actor:user_profiles!actor_id(display_name)')
    .order('occurred_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-ink-dim">Append-only record of every state change on this tenant.</p>
      </header>

      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="p-3 text-left">When</th>
              <th className="p-3 text-left">Actor</th>
              <th className="p-3 text-left">Event</th>
              <th className="p-3 text-left">Target</th>
              <th className="p-3 text-left">Changed fields</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map(e => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="p-3 whitespace-nowrap text-ink-dim">{new Date(e.occurred_at).toLocaleString()}</td>
                <td className="p-3 font-semibold">{(e as any).actor?.display_name ?? '—'}</td>
                <td className="p-3"><code className="text-xs">{e.event}</code></td>
                <td className="p-3"><code className="text-xs">{e.target_table}/{e.target_id?.slice(0, 8)}</code></td>
                <td className="p-3 text-xs text-ink-dim">{(e.changed_keys ?? []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
