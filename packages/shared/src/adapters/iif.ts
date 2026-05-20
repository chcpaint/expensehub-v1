// ============================================================================
// IIFAdapter — QuickBooks Desktop import file format.
// IIF is tab-delimited with TRNS/SPL/ENDTRNS record markers.
// ============================================================================

import type { AdapterSchema, ExpenseForExport, ExportFile, FileExportAdapter } from './interface';
import type { ExportProfile } from '../types';

const CRLF = '\r\n';
const TAB = '\t';

const SCHEMA: AdapterSchema = {
  id: 'qb_desktop',
  displayName: 'QuickBooks Desktop (IIF)',
  description: 'IIF file for QuickBooks Desktop. Import via File → Utilities → Import → IIF Files.',
  supportedExtensions: ['.iif'],
  columns: [
    { key: 'TRNSID', label: 'Transaction ID', required: true, source: 'computed' },
    { key: 'DATE', label: 'Date', required: true, source: 'expense' },
    { key: 'AMOUNT', label: 'Amount', required: true, source: 'expense' },
    { key: 'ACCNT', label: 'Account', required: true, source: 'profile' },
    { key: 'NAME', label: 'Vendor / Payee', required: false, source: 'vendor' },
    { key: 'MEMO', label: 'Memo', required: false, source: 'computed' },
    { key: 'CLASS', label: 'Class', required: false, source: 'project' },
  ],
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function clean(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\t\r\n]/g, ' ').trim();
}

export class IIFAdapter implements FileExportAdapter {
  schema(): AdapterSchema { return SCHEMA; }

  buildExport(
    tenant: { id: string; slug: string; baseCurrency: string },
    profile: ExportProfile,
    rows: ExpenseForExport[],
  ): ExportFile {
    const warnings: string[] = [];
    const lines: string[] = [];

    // IIF header rows
    lines.push(['!TRNS', 'TRNSID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'MEMO'].join(TAB));
    lines.push(['!SPL',  'SPLID',  'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'MEMO', 'CLASS'].join(TAB));
    lines.push(['!ENDTRNS'].join(TAB));

    rows.forEach((row, i) => {
      const e = row.expense;
      const ref = `${profile.chequeNumberPrefix}${String(profile.chequeNumberSeq + i + 1).padStart(5, '0')}`;
      const memo = clean(`${e.merchant ?? ''} ${row.submitterName ?? ''}`);
      const trnsAccount = profile.defaultChequeAccount ?? '';
      const splAccount = row.account?.name ?? '';
      const vendor = row.vendor?.displayName ?? '';
      const cls = row.project?.name ?? '';
      const amount = (e.totalAmount ?? 0).toFixed(2);

      // CHECK = QuickBooks check/spend-money transaction
      lines.push(['TRNS', ref, 'CHECK', fmtDate(e.txnDate), trnsAccount, vendor, `-${amount}`, memo].join(TAB));
      lines.push(['SPL',  `${ref}-1`, 'CHECK', fmtDate(e.txnDate), splAccount, vendor, amount, memo, cls].join(TAB));
      lines.push(['ENDTRNS'].join(TAB));
    });

    const body = lines.join(CRLF) + CRLF;
    const dateTag = new Date().toISOString().slice(0, 10);
    return {
      filename: `expensehub_${dateTag}_${tenant.slug}.iif`,
      mime: 'application/octet-stream',
      body,
      expenseIds: rows.map(r => r.expense.id),
      warnings,
    };
  }
}
