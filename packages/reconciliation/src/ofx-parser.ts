// ============================================================================
// Minimal OFX / QFX parser — extracts STMTTRN records (statement transactions).
// OFX is SGML-ish; we sanitize it to XML and walk the tags. Sufficient for the
// 95% case of bank statement downloads.
// ============================================================================

import type { ParsedLine } from './csv-parser';

export function parseOfx(raw: string): ParsedLine[] {
  // Strip the OFX header (lines before the first '<')
  const idx = raw.indexOf('<');
  const body = idx > 0 ? raw.slice(idx) : raw;

  // Normalize SGML → XML by closing unclosed tags before the next opening tag
  // The OFX 1.x format omits closing tags; OFX 2.x is real XML.
  const xmlish = body.replace(/<([A-Z][A-Z0-9.]*)>([^<\r\n]*)(?=<)/g,
    (_, tag, value) => `<${tag}>${value.trim()}</${tag}>`);

  const out: ParsedLine[] = [];
  const trnRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let m: RegExpExecArray | null;
  while ((m = trnRe.exec(xmlish)) !== null) {
    const block = m[1];
    const type = pick(block, 'TRNTYPE');
    const dtPosted = pick(block, 'DTPOSTED');
    const amt = pick(block, 'TRNAMT');
    const name = pick(block, 'NAME') || pick(block, 'MEMO') || '';
    const memo = pick(block, 'MEMO');
    const fitid = pick(block, 'FITID');

    if (!dtPosted || !amt) continue;
    const iso = ofxDate(dtPosted);
    if (!iso) continue;
    const amount = Number(amt);
    if (isNaN(amount)) continue;

    out.push({
      txnDate: iso,
      description: [name, memo].filter(Boolean).join(' — ').trim() || `(${type})`,
      amount: Math.abs(amount),
      isDebit: amount < 0 || type === 'DEBIT' || type === 'POS',
      rawRow: { FITID: fitid, TRNTYPE: type, NAME: name, MEMO: memo },
    });
  }
  return out;
}

function pick(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<]*)<\/${tag}>`);
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function ofxDate(s: string): string | null {
  // OFX dates are YYYYMMDD[HHMMSS[.XXX][TZ]]
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
