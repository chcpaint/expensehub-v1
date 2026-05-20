'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

interface Props { tenant: any; role: string; }
export default function Sidebar({ tenant, role }: Props) {
  const path = usePathname();
  const router = useRouter();
  const initials = tenant?.name?.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() ?? 'EH';

  const sections = [
    { title: 'Workflow', items: [
      { href: '/inbox',           label: '📥 Inbox',                roles: ['accounting','admin','owner'] },
      { href: '/approvals',       label: '✓ Approvals',             roles: ['approver','accounting','admin','owner'] },
      { href: '/ready-to-export', label: '🧾 Ready to export',      roles: ['accounting','admin','owner'] },
      { href: '/reconcile',       label: '💳 Reconcile statements', roles: ['accounting','admin','owner'] },
      { href: '/exported',        label: '📤 Exported',             roles: ['accounting','admin','owner'] },
    ]},
    { title: 'Reporting', items: [
      { href: '/',          label: '📊 Owner dashboard', roles: ['admin','owner'] },
      { href: '/audit-log', label: '📋 Audit log',       roles: ['admin','owner'] },
    ]},
    { title: 'Setup', items: [
      { href: '/users',         label: '👥 Users & roles',      roles: ['admin','owner'] },
      { href: '/chart-of-accounts', label: '📕 Chart of accounts', roles: ['accounting','admin','owner'] },
      { href: '/integrations',  label: '🔗 Integrations',       roles: ['admin','owner'] },
      { href: '/onboard',       label: '⚙ Tenant settings',     roles: ['admin','owner'] },
    ]},
  ];

  return (
    <aside className="w-64 bg-white border-r border-line h-screen sticky top-0 flex flex-col p-4">
      <div className="flex items-center gap-3 p-2 rounded-lg bg-white border border-line">
        <div className="w-9 h-9 rounded-md flex items-center justify-center text-white font-extrabold text-sm"
             style={{ background: 'var(--tenant)' }}>{initials}</div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-ink">{tenant?.name ?? 'ExpenseHub'}</div>
          <div className="text-[10px] text-ink-dim">{tenant?.integration_mode === 'file_export'
            ? `${(tenant?.file_export_adapter ?? '').toUpperCase()} (CSV export)`
            : tenant?.integration_mode}</div>
        </div>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim font-bold mt-4 mb-2 px-2">{s.title}</div>
            {s.items.filter(i => i.roles.includes(role)).map(item => {
              const active = path === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2 px-2 py-2 rounded text-[13px] my-0.5 ${active ? 'bg-tenant text-white font-semibold' : 'text-ink hover:bg-line/50'}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button onClick={async () => { await supabaseBrowser().auth.signOut(); router.refresh(); }}
        className="text-xs text-ink-dim hover:text-ink mt-4 text-left px-2">Sign out</button>
    </aside>
  );
}
