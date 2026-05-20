// ============================================================================
// UniversalCsvAdapter — permissive column set that imports into anything
// (Excel, Google Sheets, QuickBooks Desktop via wizard, Wave, FreshBooks).
// ============================================================================

import type { AdapterSchema, ExpenseForExport, ExportFile, FileExportAdapter } from './interface';
import type { ExportProfile } from '../types';

const CRLF = '\r\n';

const SCHEMA: AdapterSchema = {
  id: 'universal_csv',
  displayName: 'Universal CSV / Excel',
  description:
    'A wide, permissive CSV that opens cleanly in Excel, Google Sheets, and most accounting systems. Includes signed receipt URLs.',
  supportedExtensions: ['.csv'],
  columns: [
    { key: 'Date', label: 'Date', required: true, source: 'expense' },
    { key: 'Reference', label: 'Reference', required: true, source: 'computed' },
    { key: 'Vendor', label: 'Vendor', required: false, source: 'vendor' },
    { key: 'Description', label: 'Description', required: false, source: 'expense' },
    { key: 'Account_Code', label: 'Account Code', required: false, source: 'account' },
    { key: 'Account_Name', label: 'Account Name', required: false, source: 'account' },
    { key: 'Class', label: 'Class', required: false, source: 'project' },
    { key: 'Project', label: 'Project', required: false, source: 'project' },
    { key: 'Payment_Method', label: 'Payment Method', required: false, source: 'expense' },
    { key: 'Subtotal', label: 'Subtotal', required: false, source: 'expense' },
    { key: 'Tax_Code', label: 'Tax Code', required: false, source: 'tax' },
    { key: 'Tax', label: 'Tax', required: false, source: 'expense' },
    { key: 'Total', label: 'Total', required: true, source: 'expense' },
    { key: 'Currency', label: 'Currency', required: true, source: 'expense' },
    { key: 'FX_Rate', label: 'FX Rate', required: false, source: 'expense' },
    { key: 'Receipt_URL', label: 'Receipt URL', required: false, source: 'computed' },
    { key: 'Submitter', label: 'Submitter', required: false, source: 'computed' },
    { key: 'Approved_By', label: 'Approved By', required: false, source: 'computed' },
    { key: 'Approved_At', label: 'Approved At', required: false, source: 'computed' },
    { key: 'Notes', label: 'Notes', required: false, source: 'expense' },
  ],
};

const HEADER = SCHEMA.columns.map(c => c.key);

function csv(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(iso: string | null | undefined, format: ExportProfile['dateFormat']): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  switch (format) {
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'MM/DD/YYYY':
    default:           return `${mm}/${dd}/${yyyy}`;
  }
}

function fmtAmount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return n.toFixed(2);
}

function nextRef(profile: ExportProfile, ordinal: number): string {
  return `${profile.chequeNumberPrefix}${String(profile.chequeNumberSeq + ordinal).padStart(5, '0')}`;
}

export class UniversalCsvAdapter implements FileExportAdapter {
  schema(): AdapterSchema { return SCHEMA; }

  buildExport(
    tenant: { id: string; slug: string; baseCurrency: string },
    profile: ExportProfile,
    rows: ExpenseForExport[],
  ): ExportFile {
    const warnings: string[] = [];
    const lines: string[] = [];
    lines.push(HEADER.map(csv).join(','));

    rows.forEach((row, i) => {
      const e = row.expense;
      const subtotal = e.totalAmount !== null && e.totalAmount !== undefined && e.taxAmount !== null && e.taxAmount !== undefined
        ? Number(e.totalAmount) - Number(e.taxAmount)
        : e.totalAmount ?? 0;

      const cols = [
        fmtDate(e.txnDate, profile.dateFormat),
        nextRef(profile, i + 1),
        row.vendor?.displayName ?? e.merchant ?? '',
        e.notes ?? e.merchant ?? '',
        row.account?.code ?? '',
        row.account?.name ?? '',
        row.classDim?.name ?? '',
        row.project?.name ?? '',
        e.paymentMethod ?? '',
        fmtAmount(subtotal),
        row.taxCode?.name ?? '',
        fmtAmount(e.taxAmount ?? null),
        fmtAmount(e.totalAmount ?? null),
        e.currency,
        e.fxRate !== null && e.fxRate !== undefined ? String(e.fxRate) : '',
        row.receiptUrls[0] ?? '',
        row.submitterName,
        row.approverName ?? '',
        row.approvedAt ?? '',
        e.justification ?? '',
      ];

      lines.push(cols.map(csv).join(','));
    });

    const body = lines.join(CRLF) + CRLF;
    const dateTag = new Date().toISOString().slice(0, 10);
    return {
      filename: `expensehub_${dateTag}_${tenant.slug}_expenses.csv`,
      mime: 'text/csv',
      body,
      expenseIds: rows.map(r => r.expense.id),
      warnings,
    };
  }
}
