// ============================================================================
// ExpenseHub worker
//
// Subscribes to pg_notify channels:
//   - 'ocr_pending'   → receipt was uploaded; run OCR + classification
//   - 'match_pending' → statement was uploaded; run match engine
//
// With Document AI + Bedrock credentials configured the worker runs the real
// pipeline. Without them it runs deterministic stubs so the full state machine
// can be exercised end-to-end in local dev.
// ============================================================================
import 'dotenv/config';
import { Client as PgClient } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { runOcr } from './ocr/document-ai';
import { classify } from './ocr/classifier';
import { runStatementMatch } from './statements/match-runner';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PG_CONNECTION = process.env.SUPABASE_DB_URL!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function handleOcrPending(receiptId: string) {
  console.log(`[ocr] receipt=${receiptId}`);
  const { data: receipt } = await sb.from('receipts')
    .select('id, expense_id, tenant_id, storage_path, mime_type').eq('id', receiptId).single();
  if (!receipt) return;

  const { data: signed } = await sb.storage.from('receipts').createSignedUrl(receipt.storage_path, 300);
  if (!signed) return;

  // 1. OCR
  const ocr = await runOcr(signed.signedUrl, receipt.mime_type);

  // 2. Load tenant CoA + submitter recent classifications for classifier
  const { data: accounts } = await sb.from('coa_accounts')
    .select('id, external_id, code, name, type').eq('tenant_id', receipt.tenant_id).eq('active', true);

  const ai = await classify(ocr, accounts ?? []);

  // 3. Write back to expenses + ocr_results
  await sb.from('expenses').update({
    merchant: ocr.fields.merchant,
    txn_date: ocr.fields.date,
    total_amount: ocr.fields.total,
    tax_amount: ocr.fields.tax,
    account_id: ai.accountId,
  }).eq('id', receipt.expense_id);

  await sb.from('ocr_results').insert({
    expense_id: receipt.expense_id, tenant_id: receipt.tenant_id,
    provider: ocr.provider,
    raw_json: ocr.raw,
    field_confidence: ocr.confidence,
    ai_suggestion: ai,
    bounding_boxes: ocr.boxes,
  });

  console.log(`[ocr] done expense=${receipt.expense_id} merchant=${ocr.fields.merchant}`);
}

async function handleMatchPending(statementId: string) {
  console.log(`[match] statement=${statementId}`);
  await runStatementMatch(sb, statementId);
  console.log(`[match] done statement=${statementId}`);
}

async function main() {
  if (!PG_CONNECTION) {
    console.warn('SUPABASE_DB_URL not set — running in poll-mode every 30s instead of LISTEN/NOTIFY');
    setInterval(pollOnce, 30_000);
    await pollOnce();
    return;
  }

  const pg = new PgClient({ connectionString: PG_CONNECTION });
  await pg.connect();
  await pg.query('LISTEN ocr_pending');
  await pg.query('LISTEN match_pending');
  pg.on('notification', async (msg) => {
    try {
      if (msg.channel === 'ocr_pending')   await handleOcrPending(msg.payload!);
      if (msg.channel === 'match_pending') await handleMatchPending(msg.payload!);
    } catch (err) { console.error('worker handler error', err); }
  });
  console.log('worker listening on ocr_pending, match_pending');

  // Catch-up sweep on boot in case anything was missed
  await pollOnce();
}

async function pollOnce() {
  const { data: receipts } = await sb.from('receipts')
    .select('id, expense_id')
    .order('uploaded_at', { ascending: true })
    .limit(20);
  // Process receipts that don't yet have an ocr_results row
  for (const r of receipts ?? []) {
    const { data: existing } = await sb.from('ocr_results').select('expense_id').eq('expense_id', r.expense_id).maybeSingle();
    if (!existing) await handleOcrPending(r.id);
  }

  const { data: stmts } = await sb.from('card_statements')
    .select('id').eq('status', 'parsed').limit(10);
  for (const s of stmts ?? []) await handleMatchPending(s.id);
}

main().catch(err => { console.error(err); process.exit(1); });
