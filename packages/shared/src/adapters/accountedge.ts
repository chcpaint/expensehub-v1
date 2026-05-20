// ============================================================================
// AccountEdgeAdapter — generates a Spend Money import file for AccountEdge.
//
// File format:
//   - Comma-separated values, CRLF line endings (AccountEdge convention)
//   - First line is the header row (mapped via AccountEdge's Import Wizard)
//   - Records separated by a blank line (AccountEdge multi-line records)
//   - Single-line records get no trailing blank line at end of file
//
// Recommended AccountEdge import path:
//   File → Import Data → Disbursements → Spend Money Transactions
// ============================================================================

import type { AdapterSchema, ExpenseForExport, ExportFile, FileExportAdapter } from './interface';
import type { ExportProfile } from '../types';

const CRLF = '\r\n';

const SCHEMA: AdapterSchema = {
  id: 'accountedge',
  displayName: 'AccountEdge Spend Money (CSV)',
  description:
    'Generates an AccountEdge-compatible Spend Money import CSV. Open AccountEdge → File → Import Data → Disbursements → Spend Money Transactions.',
  supportedExtensions: ['.csv'],
  columns: [
    { key: 'Cheque No.', label: 'Cheque No.', required: true, source: 'computed',
      notes: 'EH-NNNNN — unique per export per tenant.' },
    { key: 'Date', label: 'Date', required: true, source: 'expense' },
    { key: 'Amount', label: 'Amount', required: true, source: 'expense' },
    { key: 'Cheque Account', label: 'Cheque Account', required: true, source: 'profile' },
    { key: 'Allocation Memo', label: 'Allocation Memo', required: true, source: 'computed' },
    { key: 'Allocation Account No.', label: 'Allocation Account No.', required: true, source: 'account' },
    { key: 'Allocation Amount', label: 'Allocation Amount', required: true, source: 'expense' },
    { key: 'Job No.', label: 'Job No.', required: false, source: 'project' },
    { key: 'Tax Code', label: 'Tax Code', required: false, source: 'tax' },
    { key: 'Tax Amount', label: 'Tax Amount', required: false, source: 'expense' },
    { key: 'Card ID', label: 'Card ID', required: false, source: 'vendor' },
  ],
};

const HEADER = SCHEMA.columns.map(c => c.key);

/** Quote a CSV value per RFC 4180 — wrap in quotes, double up embedded quotes. */
function csv(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '""';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
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

function formatVendorName(name: string | null | undefined, style: ExportProfile['vendorNaming']): string {
  if (!name) return '';
  switch (style) {
    case 'UPPER':     return name.toUpperCase();
    case 'lowercase': return name.toLowerCase();
    case 'TitleCase':
      return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    case 'asis':
    default:          return name;
  }
}

function formatAccountCode(code: string | null | undefined, style: ExportProfile['accountCodeStyle']): string {
  if (!code) return '';
  if (style === 'plain') return code.replace(/[^0-9]/g, '');
  if (style === 'dashed') {
    // Ensure exactly one dash after the first digit: '52150' → '5-2150'
    const digits = code.replace(/[^0-9]/g, '');
    if (digits.length < 2) return digits;
    return digits[0] + '-' + digits.slice(1);
  }
  return code;
}

function nextChequeNumber(profile: ExportProfile, ordinal: number): string {
  const seq = profile.chequeNumberSeq + ordinal;
  return `${profile.chequeNumberPrefix}${String(seq).padStart(5, '0')}`;
}

export class AccountEdgeAdapter implements FileExportAdapter {
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
      const cheque = nextChequeNumber(profile, i + 1);

      // Cheque Account: from profile (e.g., '1-1140 Visa - 8821')
      const chequeAccount = profile.defaultChequeAccount ?? '';
      if (!chequeAccount) warnings.push(`Cheque Account is empty for ${cheque}; AccountEdge will reject.`);

      // Allocation Account
      const allocationAccountRaw = row.account?.code ?? row.account?.externalId ?? '';
      const allocationAccount = formatAccountCode(allocationAccountRaw, profile.accountCodeStyle);
      if (!allocationAccount) warnings.push(`Missing GL account on expense ${e.id} (${e.merchant})`);

      // Memo
      const memoParts = [
        e.merchant ?? '',
        row.submitterName ? `· ${row.submitterName}` : '',
        row.project ? `· ${row.project.name}` : '',
      ].filter(Boolean);
      const memo = memoParts.join(' ');

      // Tax code translation (e.g. 'GST 5%' → 'GST')
      const taxName = row.taxCode?.name ?? '';
      const taxOut = profile.taxCodeMap[taxName] ?? row.taxCode?.externalId ?? '';

      // Vendor / Card ID
      const cardId = formatVendorName(row.vendor?.externalId ?? row.vendor?.displayName ?? '', profile.vendorNaming);

      // Job No. (project)
      const jobNo = row.project?.externalId ?? row.project?.code ?? '';

      const subtotal = e.totalAmount !== null && e.totalAmount !== undefined && e.taxAmount !== null && e.taxAmount !== undefined
        ? Number(e.totalAmount) - Number(e.taxAmount)
        : e.totalAmount ?? 0;

      const cols = [
        cheque,
        fmtDate(e.txnDate, profile.dateFormat),
        fmtAmount(e.totalAmount ?? null),
        chequeAccount,
        memo,
        allocationAccount,
        fmtAmount(subtotal),
        jobNo,
        taxOut,
        fmtAmount(e.taxAmount ?? null),
        cardId,
      ];

      lines.push(cols.map(csv).join(','));
      // Trailing blank line per AccountEdge multi-record convention
      if (i < rows.length - 1) lines.push('');
    });

    const body = lines.join(CRLF) + CRLF;

    const dateTag = new Date().toISOString().slice(0, 10);
    return {
      filename: `expensehub_${dateTag}_${tenant.slug}_spendmoney.csv`,
      mime: 'text/csv',
      body,
      expenseIds: rows.map(r => r.expense.id),
      warnings,
    };
  }
}
