// ============================================================================
// POST /functions/v1/expenses-approve
// body: { expense_id, action: 'approve'|'reject', comment? }
// ============================================================================
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { requireAuth, HttpError } from '../_shared/auth.ts';

interface Body { expense_id: string; action: 'approve' | 'reject'; comment?: string; }

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const ctx = await requireAuth(req);
    const body: Body = await req.json();
    if (!body.expense_id || !body.action) return jsonResponse({ error: 'expense_id and action required' }, { status: 400 });
    if (body.action === 'reject' && !body.comment) return jsonResponse({ error: 'comment required on reject' }, { status: 400 });

    // 1. Find this approver's current pending step (RLS enforces approver_id = me)
    const { data: step, error: e1 } = await ctx.userClient
      .from('approval_steps')
      .select('id, expense_id, step_order, status')
      .eq('expense_id', body.expense_id)
      .eq('approver_id', ctx.user.id)
      .eq('status', 'pending')
      .order('step_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (e1) throw e1;
    if (!step) return jsonResponse({ error: 'no pending step for you on this expense' }, { status: 404 });

    const newStatus = body.action === 'approve' ? 'approved' : 'rejected';

    // 2. Update the step
    const { error: e2 } = await ctx.userClient
      .from('approval_steps')
      .update({ status: newStatus, acted_at: new Date().toISOString(), comment: body.comment ?? null })
      .eq('id', step.id);
    if (e2) throw e2;

    if (body.action === 'reject') {
      // Reject the whole expense
      await ctx.serviceClient
        .from('expenses')
        .update({ status: 'rejected' })
        .eq('id', body.expense_id);
      return jsonResponse({ ok: true, status: 'rejected' });
    }

    // 3. Approve: is there a next step?
    const { data: remaining } = await ctx.serviceClient
      .from('approval_steps')
      .select('id, approver_id, step_order')
      .eq('expense_id', body.expense_id)
      .eq('status', 'pending')
      .order('step_order', { ascending: true });

    if (remaining && remaining.length > 0) {
      // Notify next approver — TODO: Expo push
      return jsonResponse({ ok: true, status: 'pending_approval', next_approver: remaining[0].approver_id });
    }

    // No more steps → fully approved
    await ctx.serviceClient
      .from('expenses')
      .update({ status: 'approved' })
      .eq('id', body.expense_id);
    return jsonResponse({ ok: true, status: 'approved' });

  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, { status: err.status });
    console.error(err);
    return jsonResponse({ error: 'internal' }, { status: 500 });
  }
});
