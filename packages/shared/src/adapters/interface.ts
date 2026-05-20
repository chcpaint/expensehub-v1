// ============================================================================
// FileExportAdapter — the V1 integration model.
// Every file-based accounting integration implements this interface.
// ============================================================================

import type {
  CoaAccount, CoaVendor, CoaDimension, TaxCode,
  Expense, ExportProfile, FileExportAdapterId,
} from '../types';

/** A single expense fully resolved with everything the adapter needs to write it. */
export interface ExpenseForExport {
  expense: Expense;
  account: CoaAccount | null;          // ExpenseHub GL account
  vendor: CoaVendor | null;
  project: CoaDimension | null;
  classDim: CoaDimension | null;
  department: CoaDimension | null;
  location: CoaDimension | null;
  taxCode: TaxCode | null;
  submitterName: string;
  approverName: string | null;
  approvedAt: string | null;
  receiptUrls: string[];               // signed URLs to receipt files
}

/** Result of building an export. */
export interface ExportFile {
  filename: string;                    // 'expensehub_2026-05-19_northridge_spendmoney.csv'
  mime: string;                        // 'text/csv'
  body: Buffer | string;
  expenseIds: string[];                // for marking 'exported' status
  warnings: string[];                  // soft issues found while building (e.g. missing tax code)
}

/** Adapter-declared metadata. */
export interface AdapterSchema {
  id: FileExportAdapterId;
  displayName: string;                 // shown in the UI dropdown
  description: string;
  supportedExtensions: string[];       // ['.csv'] or ['.iif']
  columns: AdapterColumn[];
}

export interface AdapterColumn {
  key: string;
  label: string;
  required: boolean;
  source: 'expense' | 'vendor' | 'account' | 'project' | 'tax' | 'profile' | 'computed';
  notes?: string;
}

/** Base adapter contract. */
export interface FileExportAdapter {
  schema(): AdapterSchema;

  buildExport(
    tenant: { id: string; slug: string; baseCurrency: string },
    profile: ExportProfile,
    expenses: ExpenseForExport[],
  ): ExportFile;

  /** Optional: some adapters can parse the system's import log to auto-confirm. */
  parseImportLog?(file: Buffer): {
    confirmed: string[];                // expense IDs known to have imported
    failed: Array<{ expenseId: string; reason: string }>;
  };
}
