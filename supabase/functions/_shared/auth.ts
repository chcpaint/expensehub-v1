// Auth helpers for Edge Functions
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export interface AuthedContext {
  user: { id: string; email?: string; aal: string };
  tenantId: string;
  role: 'submitter' | 'approver' | 'accounting' | 'admin' | 'owner';
  /** Client scoped to the user's JWT — respects RLS */
  userClient: SupabaseClient;
  /** Service-role client — bypasses RLS. Use sparingly. */
  serviceClient: SupabaseClient;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export async function requireAuth(req: Request): Promise<AuthedContext> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw httpError(401, 'Missing Authorization header');
  }
  const jwt = authHeader.slice('Bearer '.length);

  // Decode the JWT (without verification — Supabase's edge runtime already verified it
  // because verify_jwt = true in config.toml)
  const claims = decodeJwt(jwt);
  const userId = claims.sub;
  const tenantId = claims.app_metadata?.tenant_id;
  const role = claims.app_metadata?.role ?? 'submitter';
  const aal = claims.aal ?? 'aal1';
  if (!userId || !tenantId) throw httpError(401, 'Invalid claims');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  return {
    user: { id: userId, email: claims.email, aal },
    tenantId,
    role,
    userClient,
    serviceClient,
  };
}

export function requireRole(ctx: AuthedContext, roles: Array<AuthedContext['role']>): void {
  if (!roles.includes(ctx.role)) throw httpError(403, `Forbidden — requires role ${roles.join('|')}`);
}

export function requireAal2(ctx: AuthedContext): void {
  if (ctx.user.aal !== 'aal2') throw httpError(403, 'MFA required for this action');
}

function decodeJwt(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) throw httpError(401, 'Malformed JWT');
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, '=');
  return JSON.parse(atob(padded));
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}
