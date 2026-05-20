import { createSupabaseServer } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import OnboardForm from './OnboardForm';

export const dynamic = 'force-dynamic';

export default async function OnboardPage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenant } = await supabase.from('tenants').select('*').single();
  const { data: profile } = await supabase.from('export_profiles').select('*').maybeSingle();

  return <OnboardForm tenant={tenant} profile={profile} />;
}
