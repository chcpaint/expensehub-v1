// ============================================================================
// ExpenseHub shared types — kept deliberately small and serializable so they
// flow between the mobile app, the web app, the Edge Functions, and the worker
// without translation.
// ============================================================================

export type Role = 'submitter' | 'approver' | 'accounting' | 'admin' | 'owner';

export type IntegrationMode = 'standalone' | 'file_export' | 'api_sync';
export type FileExportAdapterId = 'accountedge' | 'qb_desktop' | 'sage50' | 'universal_csv';
export type ApiSyncAdapterId = 'qbo' | 'xero' | 'intacct' | 'sage_acct';

export type ExpenseStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'queued_export'
  | 'exported'
  | 'reconciled'
  | 'queued_post'
  | 'posted'
  | 'post_failed'
  | 'archived';

export type PaymentMethod = 'cash' | 'personal_card' | 'corp_card' | 'reimbursable';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoPath?: string | null;
  accentColor: string;
  baseCurrency: string;
  taxRegion: string;
  integrationMode: IntegrationMode;
  fileExportAdapter?: FileExportAdapterId | null;
  apiSyncAdapter?: ApiSyncAdapterId | null;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  initials: string;
  defaultTenantId?: string | null;
  emailAlias?: string | null;
}

export interface CoaAccount {
  id: string;
  tenantId: string;
  externalId?: string | null;
  code?: string | null;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense' | 'other_expense';
  parentId?: string | null;
  active: boolean;
}

export interface CoaVendor {
  id: string;
  tenantId: string;
  externalId?: string | null;
  displayName: string;
  vendorType: 'supplier' | 'employee' | 'one_time';
  active: boolean;
}

export interface CoaDimension {
  id: string;
  tenantId: string;
  dimType: 'class' | 'department' | 'location' | 'project' | 'tracking';
  externalId?: string | null;
  code?: string | null;
  name: string;
  active: boolean;
}

export interface TaxCode {
  id: string;
  tenantId: string;
  externalId?: string | null;
  name: string;
  ratePct: number | null;
  active: boolean;
}

export interface Expense {
  id: string;
  tenantId: string;
  submitterId: string;
  status: ExpenseStatus;

  merchant?: string | null;
  txnDate?: string | null;          // ISO date
  totalAmount?: number | null;
  currency: string;
  fxRate?: number | null;
  taxAmount?: number | null;
  taxCodeId?: string | null;

  categoryId?: string | null;
  accountId?: string | null;
  vendorId?: string | null;
  classId?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  projectId?: string | null;

  paymentMethod?: PaymentMethod | null;
  paymentCardLast4?: string | null;
  notes?: string | null;
  justification?: string | null;

  geoLat?: number | null;
  geoLng?: number | null;
  geoLocationName?: string | null;
  capturedAt?: string | null;
  perceptualHash?: string | null;

  reconciledStatementLineId?: string | null;
  reconciledAt?: string | null;

  exportJobId?: string | null;
  exportedAt?: string | null;
  chequeNumber?: string | null;
  postRef?: Record<string, unknown> | null;
  postedAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  tenantId: string;
  expenseId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes?: number | null;
  pageCount?: number | null;
  uploadedAt: string;
}

export interface OcrResult {
  expenseId: string;
  tenantId: string;
  provider: 'document_ai' | 'veryfi' | 'stub';
  rawJson: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  aiSuggestion?: {
    accountExternalId?: string | null;
    accountId?: string | null;
    confidence: number;
    reasoning: string;
    flags: string[];
  } | null;
  boundingBoxes?: Record<string, { x: number; y: number; w: number; h: number; page: number }>;
  processedAt: string;
}

export interface ApprovalStep {
  id: string;
  tenantId: string;
  expenseId: string;
  stepOrder: number;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  actedAt?: string | null;
  comment?: string | null;
}

export interface ExportProfile {
  id: string;
  tenantId: string;
  adapter: FileExportAdapterId;
  defaultChequeAccount?: string | null;
  defaultPaymentAccountId?: string | null;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  accountCodeStyle: 'plain' | 'dashed' | 'fullname';
  vendorNaming: 'UPPER' | 'TitleCase' | 'lowercase' | 'asis';
  taxCodeMap: Record<string, string>;
  chequeNumberPrefix: string;
  chequeNumberSeq: number;
}

export interface ExportJob {
  id: string;
  tenantId: string;
  adapter: FileExportAdapterId;
  requestedBy: string;
  expenseIds: string[];
  filename?: string | null;
  storagePath?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'confirmed';
  downloadCount: number;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

// ----- Statement reconciliation -----

export interface CardStatement {
  id: string;
  tenantId: string;
  uploadedBy: string;
  cardAccountId?: string | null;
  cardLast4?: string | null;
  cardLabel?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  source: 'csv' | 'ofx' | 'qfx' | 'pdf' | 'manual';
  storagePath?: string | null;
  lineCount: number;
  matchedCount: number;
  unmatchedCount: number;
  status: 'parsed' | 'reconciling' | 'closed' | 'archived';
  uploadedAt: string;
}

export interface StatementLine {
  id: string;
  tenantId: string;
  statementId: string;
  txnDate: string;
  postDate?: string | null;
  description: string;
  amount: number;
  isDebit: boolean;
  cardLast4?: string | null;
  externalRef?: string | null;
  matchedExpenseId?: string | null;
  matchScore?: number | null;
  matchReason?: Record<string, number> | null;
  matchAlternates?: Array<{ expenseId: string; score: number }>;
  status: 'unmatched' | 'matched' | 'suggested' | 'dismissed' | 'no_receipt' | 'personal';
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}
