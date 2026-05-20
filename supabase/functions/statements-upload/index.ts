// ============================================================================
// POST /functions/v1/statements-upload
//
// Body: { storage_path, source, card_last4?, card_label?, card_account_id?, csv_mapping? }
//
// Reads the file already uploaded to the 'statements' bucket, parses it,
// inserts a card_statements row + statement_lines rows. The notify trigger
// then fires 'match_pending' so the worker (or the call to statements-match)
// can run the matching algorithm.
// ============================================================================
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { requireAuth, requireRole, HttpError } from '../_shared/auth.ts';

interface Body {
  storage_path: string;
  source: 'csv' | 'ofx' | 'qfx' | 'pdf' | 'manual';
  card_last4?: string;
  card_label?: string;
  card_account_id?: string;
  csv_mapping?: any;
}

// Inline CSV parser (a subset of the @expensehub/reconciliation package)
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let buf = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i+1] === '"') { buf += '"'; i++; } else q = !q; continue; }
    if (ch === ',' && !q) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf); return out;
}
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(l => {
    const c = splitCsvLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => row[h] = (c[i] ?? '').trim());
    return row;
  });
}
function autoMapping(rows: Array<Record<string, string>>): any {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]); const lower = headers.map(h => h.toLowerCase());
  const find = (hints: string[]) => {
    for (const h of hints) { const i = lower.findIndex(x => x === h); if (i >= 0) return headers[i]; }
    for (const h of hints) { const i = lower.findIndex(x => x.includes(h)); if (i >= 0) return headers[i]; }
    return undefined;
  };
  return {
    date: find(['date','txn date','posting date']),
    desc: find(['description','details','merchant','payee']),
    amount: find(['amount','value']),
    debit: find(['debit','withdrawal']),
    credit: find(['credit','deposit']),
    card: find(['card','card last 4','last 4']),
  };
}
function tryDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (!m) { const d = new Date(raw); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
  const [, p1, p2, p3] = m;
  // Heuristic: 4-digit token is year
  let y, mo, d;
  if (p1.length === 4) { y = p1; mo = p2; d = p3; }
  else if (p3.length === 4) { mo = p1; d = p2; y = p3; }     // assume MM/DD/YYYY
  else return null;
  return `${y.padStart(4,'0')}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function parseAmount(raw: string): number | null {
  if (!raw || raw === '-') return null;
  let s = raw.replace(/\$/g, '').replace(/,/g, '').trim();
  if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1);
  const n = Number(s); return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const ctx = await requireAuth(req);
    requireRole(ctx, ['accounting', 'admin', 'owner']);

    const body: Body = await req.json();
    if (!body.storage_path) return jsonResponse({ error: 'storage_path required' }, { status: 400 });

    // 1. Download the file from storage
    const { data: file, error: e1 } = await ctx.serviceClient.storage
      .from('statements').download(body.storage_path);
    if (e1 || !file) return jsonResponse({ error: 'file not found in storage' }, { status: 404 });

    const text = await file.text();

    // 2. Parse
    let parsedLines: Array<{ txnDate: string; description: string; amount: number; isDebit: boolean; cardLast4?: string }> = [];

    if (body.source === 'csv') {
      const rows = parseCsv(text);
      const mapping = body.csv_mapping ?? autoMapping(rows);
      if (!mapping?.date || !mapping?.desc) {
        return jsonResponse({ error: 'could not auto-detect CSV columns; supply csv_mapping', headers: Object.keys(rows[0] ?? {}) }, { status: 422 });
      }
      for (const row of rows) {
        const iso = tryDate(row[mapping.date] ?? '');
        if (!iso) continue;
        let amt = 0; let isDebit = true;
        if (mapping.debit || mapping.credit) {
          const d = parseAmount(row[mapping.debit ?? ''] ?? '');
          const c = parseAmount(row[mapping.credit ?? ''] ?? '');
          if (d !== null && Math.abs(d) > 0) { amt = Math.abs(d); isDebit = true; }
          else if (c !== null && Math.abs(c) > 0) { amt = Math.abs(c); isDebit = false; }
          else continue;
        } else {
          const v = parseAmount(row[mapping.amount ?? ''] ?? '');
          if (v === null) continue;
          amt = Math.abs(v); isDebit = v > 0;
        }
        parsedLines.push({ txnDate: iso, description: row[mapping.desc].trim(), amount: amt, isDebit, cardLast4: row[mapping.card ?? ''] });
      }
    } else {
      return jsonResponse({ error: 'source not yet supported in edge: ' + body.source }, { status: 501 });
    }

    if (parsedLines.length === 0) return jsonResponse({ error: 'no lines parsed' }, { status: 422 });

    // 3. Insert statement
    const periodStart = parsedLines.reduce((m, l) => l.txnDate < m ? l.txnDate : m, parsedLines[0].txnDate);
    const periodEnd   = parsedLines.reduce((m, l) => l.txnDate > m ? l.txnDate : m, parsedLines[0].txnDate);
    const { data: stmt, error: e2 } = await ctx.serviceClient
      .from('card_statements').insert({
        tenant_id: ctx.tenantId,
        uploaded_by: ctx.user.id,
        card_account_id: body.card_account_id,
        card_last4: body.card_last4 ?? parsedLines[0].cardLast4,
        card_label: body.card_label,
        period_start: periodStart, period_end: periodEnd,
        source: body.source, storage_path: body.storage_path,
        line_count: parsedLines.length, status: 'parsed',
      }).select().single();
    if (e2 || !stmt) throw e2 ?? new Error('failed to insert statement');

    // 4. Insert lines
    const { error: e3 } = await ctx.serviceClient
      .from('statement_lines').insert(parsedLines.map(l => ({
        tenant_id: ctx.tenantId, statement_id: stmt.id,
        txn_date: l.txnDate, description: l.description,
        amount: l.amount, is_debit: l.isDebit, card_last4: l.cardLast4 ?? body.card_last4,
        status: 'unmatched',
      })));
    if (e3) throw e3;

    return jsonResponse({ ok: true, statement_id: stmt.id, line_count: parsedLines.length });
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, { status: err.status });
    console.error(err);
    return jsonResponse({ error: 'internal', detail: String(err) }, { status: 500 });
  }
});
