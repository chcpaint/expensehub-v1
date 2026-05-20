// ============================================================================
// Bank-statement CSV parser. Auto-detects columns; remembers the mapping per
// bank-header signature so the bookkeeper only resolves ambiguity once.
// ============================================================================

export interface CsvMapping {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'AUTO';
  amountIsNegativeForDebit?: boolean;
}

export interface ParsedLine {
  txnDate: string;       // ISO YYYY-MM-DD
  description: string;
  amount: number;        // absolute value
  isDebit: boolean;
  rawRow: Record<string, string>;
}

/** Parse a CSV string into rows. Naive but RFC-4180-compatible enough. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length === 0 || cells.every(c => !c.trim())) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  // CSV-aware line splitter: quotes can contain newlines
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; buf += ch; continue; }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (buf.length > 0) { out.push(buf); buf = ''; }
      if (ch === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

// ---------------------------------------------------------------------------
// Column auto-detection
// ---------------------------------------------------------------------------

const DATE_HINTS = ['date', 'txn date', 'transaction date', 'posted', 'posting date'];
const DESC_HINTS = ['description', 'details', 'merchant', 'payee', 'narrative', 'memo', 'transaction'];
const AMOUNT_HINTS = ['amount', 'value', 'transaction amount'];
const DEBIT_HINTS = ['debit', 'withdrawal', 'spent', 'charge', 'charges'];
const CREDIT_HINTS = ['credit', 'deposit', 'payment', 'payments'];

function findColumn(headers: string[], hints: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase());
  for (const hint of hints) {
    const idx = lower.findIndex(h => h === hint);
    if (idx >= 0) return headers[idx];
  }
  for (const hint of hints) {
    const idx = lower.findIndex(h => h.includes(hint));
    if (idx >= 0) return headers[idx];
  }
  return undefined;
}

export function autoDetectMapping(rows: Array<Record<string, string>>): CsvMapping | null {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);

  const dateColumn = findColumn(headers, DATE_HINTS);
  const descriptionColumn = findColumn(headers, DESC_HINTS);
  if (!dateColumn || !descriptionColumn) return null;

  const debitColumn = findColumn(headers, DEBIT_HINTS);
  const creditColumn = findColumn(headers, CREDIT_HINTS);
  const amountColumn = !debitColumn ? findColumn(headers, AMOUNT_HINTS) : undefined;

  return {
    dateColumn,
    descriptionColumn,
    amountColumn,
    debitColumn,
    creditColumn,
    dateFormat: 'AUTO',
    amountIsNegativeForDebit: !!amountColumn,
  };
}

// ---------------------------------------------------------------------------
// Date parsing — tries the configured format; falls back to a few common ones.
// ---------------------------------------------------------------------------

function tryParseDate(raw: string, fmt: CsvMapping['dateFormat']): string | null {
  const candidates: Array<CsvMapping['dateFormat']> =
    fmt === 'AUTO' ? ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] : [fmt];

  for (const f of candidates) {
    const iso = parseWithFormat(raw, f);
    if (iso) return iso;
  }
  // Final fallback to Date()
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseWithFormat(raw: string, fmt: CsvMapping['dateFormat']): string | null {
  if (fmt === 'AUTO') return null;
  const m = raw.trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!m) return null;
  const [, p1, p2, p3] = m;
  let y, mo, d;
  if (fmt === 'YYYY-MM-DD') { y = p1; mo = p2; d = p3; }
  else if (fmt === 'MM/DD/YYYY') { mo = p1; d = p2; y = p3; }
  else { d = p1; mo = p2; y = p3; }
  if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
  const iso = `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const valid = new Date(iso + 'T00:00:00Z');
  return !isNaN(valid.getTime()) ? iso : null;
}

// ---------------------------------------------------------------------------
// Parse rows into ParsedLine[]
// ---------------------------------------------------------------------------

export function parseStatementRows(rows: Array<Record<string, string>>, mapping: CsvMapping): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const row of rows) {
    const iso = tryParseDate(row[mapping.dateColumn] ?? '', mapping.dateFormat);
    if (!iso) continue;

    let amount = 0;
    let isDebit = true;

    if (mapping.debitColumn || mapping.creditColumn) {
      const debit = parseAmount(row[mapping.debitColumn ?? ''] ?? '');
      const credit = parseAmount(row[mapping.creditColumn ?? ''] ?? '');
      if (debit !== null && Math.abs(debit) > 0)        { amount = Math.abs(debit);  isDebit = true; }
      else if (credit !== null && Math.abs(credit) > 0) { amount = Math.abs(credit); isDebit = false; }
      else continue;
    } else if (mapping.amountColumn) {
      const v = parseAmount(row[mapping.amountColumn] ?? '');
      if (v === null) continue;
      amount = Math.abs(v);
      isDebit = mapping.amountIsNegativeForDebit ? v < 0 : v > 0;
    } else continue;

    out.push({
      txnDate: iso,
      description: (row[mapping.descriptionColumn] ?? '').trim(),
      amount,
      isDebit,
      rawRow: row,
    });
  }
  return out;
}

function parseAmount(raw: string): number | null {
  if (raw === '' || raw === '-') return null;
  // Handle accounting parens for negatives: (123.45) → -123.45
  let s = raw.trim().replace(/\$/g, '').replace(/,/g, '');
  if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1);
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** Hash of the header row used to remember the mapping per bank. */
export function bankSignature(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim()).sort();
  return headers.join('|');
}
