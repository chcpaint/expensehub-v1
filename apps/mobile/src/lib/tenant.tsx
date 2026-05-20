// Tenant context — drives per-tenant branding (logo, accent colour, name)
// on every screen.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import type { Tenant } from '@expensehub/shared';

interface Ctx {
  tenant: Tenant | null;
  loading: boolean;
  reload: () => Promise<void>;
}
const TenantCtx = createContext<Ctx>({ tenant: null, loading: true, reload: async () => {} });
export const useTenant = () => useContext(TenantCtx);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { setTenant(null); setLoading(false); return; }
    const tenantId = (session.session.user.app_metadata as any)?.tenant_id;
    if (!tenantId) { setLoading(false); return; }
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (data) {
      setTenant({
        id: data.id, name: data.name, slug: data.slug,
        logoPath: data.logo_path, accentColor: data.accent_color,
        baseCurrency: data.base_currency, taxRegion: data.tax_region,
        integrationMode: data.integration_mode,
        fileExportAdapter: data.file_export_adapter,
        apiSyncAdapter: data.api_sync_adapter,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => reload());
    return () => sub.subscription.unsubscribe();
  }, []);

  return <TenantCtx.Provider value={{ tenant, loading, reload }}>{children}</TenantCtx.Provider>;
}
