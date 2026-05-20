import './globals.css';
import type { Metadata } from 'next';
import { createSupabaseServer } from '@/lib/supabase-server';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'ExpenseHub Admin',
  description: 'Multi-tenant expense management — admin & accounting console.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Pull tenant for branding header
  let tenant: any = null;
  if (user) {
    const tenantId = (user.app_metadata as any)?.tenant_id;
    if (tenantId) {
      const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      tenant = data;
    }
  }

  const accent = tenant?.accent_color ?? '#1F3A5F';

  return (
    <html lang="en">
      <body>
        <style dangerouslySetInnerHTML={{
          __html: `:root { --tenant: ${accent}; --tenant-soft: ${accent}1a; }`
        }} />
        {user
          ? <div className="flex min-h-screen"><Sidebar tenant={tenant} role={(user.app_metadata as any)?.role} />
              <main className="flex-1 p-8">{children}</main>
            </div>
          : <main>{children}</main>}
      </body>
    </html>
  );
}
