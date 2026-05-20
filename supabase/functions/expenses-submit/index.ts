// ============================================================================
// POST /functions/v1/expenses-submit
//
// Move a draft expense → pending_approval, evaluate approval_rules, write the
// approval_steps chain, and notify the first approver.
// ============================================================================
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { requireAuth, HttpError } from '../_shared/auth.ts';

interface Body {
  expense_id: string;
  client_idempotency_key?: string;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const ctx = await requireAuth(req);
    const body: Body = await req.json();
    if (!body.expense_id) return jsonResponse({ error: 'expense_id required' }, { status: 400 });

    // 1. Load expense (RLS enforces tenant scope + submitter ownership for drafts)
    const { data: expense, error: e1 } = await ctx.userClient
      .from('expenses')
      .select('id, tenant_id, submitter_id, status, total_amount, category_id, account_id, vendor_id, justification, txn_date')
      .eq('id', body.expense_id)
      .single();
    if (e1 || !expense) return jsonResponse({ error: 'expense not found' }, { status: 404 });
    if (expense.status !== 'draft') return jsonResponse({ error: 'not in draft', status: expense.status }, { status: 409 });

    // 2. Evaluate policy rules (block-level only — warns are advisory)
    const { data: policies } = await ctx.serviceClient
      .from('policy_rules')
      .select('rule, severity, message, name')
      .eq('tenant_id', ctx.tenantId)
      .eq('active', true)
      .eq('severity', 'block');

    const violations: string[] = [];
    for (const p of policies ?? []) {
      const rule = p.rule as any;
      let triggered = true;
      if (rule.amount_gt !== undefined) triggered = triggered && (expense.total_amount ?? 0) > rule.amount_gt;
      if (rule.amount_lt !== undefined) triggered = triggered && (expense.total_amount ?? 0) < rule.amount_lt;
      if (rule.category !== undefined) {
        const { data: cat } = await ctx.serviceClient
          .from('categories').select('name').eq('id', expense.category_id).maybeSingle();
        triggered = triggered && cat?.name === rule.category;
      }
      if (triggered && rule.requires_field) {
        const v = (expense as any)[rule.requires_field];
        if (!v) violations.push(p.message ?? `${p.name}: ${rule.requires_field} required`);
      }
    }
    if (violations.length > 0) {
      return jsonResponse({ error: 'policy_block', violations }, { status: 422 });
    }

    // 3. Pick first matching approval_rule (by priority)
    const { data: rules } = await ctx.serviceClient
      .from('approval_rules')
      .select('id, name, condition, steps, priority')
      .eq('tenant_id', ctx.tenantId)
      .eq('active', true)
      .order('priority', { ascending: true });

    let chosenRule: any = null;
    for (const r of rules ?? []) {
      const c = r.condition as any;
      let ok = true;
      if (c.amount_gt !== undefined) ok = ok && (expense.total_amount ?? 0) > c.amount_gt;
      if (c.amount_lt !== undefined) ok = ok && (expense.total_amount ?? 0) < c.amount_lt;
      if (ok) { chosenRule = r; break; }
    }
    if (!chosenRule) return jsonResponse({ error: 'no_matching_rule' }, { status: 422 });

    // 4. Resolve each step into a concrete approver
    const steps: Array<{ approverId: string; stepOrder: number }> = [];
    for (let i = 0; i < (chosenRule.steps as any[]).length; i++) {
      const step = (chosenRule.steps as any[])[i];
      let approverId: string | null = null;

      if (step.selector === 'user_id') approverId = step.value;
      else if (step.selector === 'role') {
        const { data: members } = await ctx.serviceClient
          .from('tenant_users')
          .select('user_id')
          .eq('tenant_id', ctx.tenantId)
          .eq('role', step.value)
          .limit(1);
        approverId = members?.[0]?.user_id ?? null;
      }
      if (!approverId) return jsonResponse({ error: 'no_approver_found', step }, { status: 422 });
      steps.push({ approverId, stepOrder: i + 1 });
    }

    // 5. Update expense + insert approval_steps
    const { error: e3 } = await ctx.serviceClient
      .from('expenses')
      .update({ status: 'pending_approval' })
      .eq('id', expense.id);
    if (e3) throw e3;

    const { error: e4 } = await ctx.serviceClient
      .from('approval_steps')
      .insert(steps.map(s => ({
        tenant_id: ctx.tenantId,
        expense_id: expense.id,
        step_order: s.stepOrder,
        approver_id: s.approverId,
        status: 'pending',
      })));
    if (e4) throw e4;

    // TODO: send push notification to first approver via Expo
    return jsonResponse({
      ok: true,
      status: 'pending_approval',
      next_approver: steps[0].approverId,
      step_count: steps.length,
    });

  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, { status: err.status });
    console.error(err);
    return jsonResponse({ error: 'internal' }, { status: 500 });
  }
});
