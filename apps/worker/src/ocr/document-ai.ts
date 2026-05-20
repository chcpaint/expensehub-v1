// ============================================================================
// OCR provider interface — primary: Google Document AI Expense Parser.
//
// When DOCUMENT_AI_PROCESSOR_ID is set this calls the real Document AI REST
// endpoint. Otherwise it returns a deterministic stub so local dev still runs.
// ============================================================================

export interface OcrResult {
  provider: 'document_ai' | 'stub';
  fields: {
    merchant: string | null;
    date: string | null;       // ISO
    total: number | null;
    tax: number | null;
    currency: string;
  };
  confidence: Record<string, number>;
  boxes: Record<string, { x: number; y: number; w: number; h: number; page: number }>;
  raw: Record<string, unknown>;
}

export async function runOcr(fileUrl: string, _mime: string): Promise<OcrResult> {
  const project   = process.env.DOCUMENT_AI_PROJECT_ID;
  const location  = process.env.DOCUMENT_AI_LOCATION ?? 'us';
  const processor = process.env.DOCUMENT_AI_PROCESSOR_ID;

  if (!project || !processor) {
    // Deterministic stub for local dev
    return {
      provider: 'stub',
      fields: {
        merchant: 'Starbucks #4421',
        date: new Date().toISOString().slice(0, 10),
        total: 13.81,
        tax: 0.66,
        currency: 'CAD',
      },
      confidence: { merchant: 0.97, date: 0.99, total: 0.99, tax: 0.94 },
      boxes: {
        merchant: { x: 0.12, y: 0.05, w: 0.4, h: 0.05, page: 1 },
        total:    { x: 0.66, y: 0.86, w: 0.2, h: 0.05, page: 1 },
      },
      raw: { stub: true, source: fileUrl },
    };
  }

  // Real Document AI call
  const accessToken = await fetchGoogleAccessToken();
  const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors/${processor}:process`;
  const fileResp = await fetch(fileUrl);
  const bytes = new Uint8Array(await fileResp.arrayBuffer());
  const b64 = Buffer.from(bytes).toString('base64');
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawDocument: { mimeType: _mime, content: b64 } }),
  });
  const j: any = await r.json();
  const ents = j?.document?.entities ?? [];
  const pick = (key: string) => ents.find((e: any) => e.type === key);

  return {
    provider: 'document_ai',
    fields: {
      merchant: pick('supplier_name')?.mentionText ?? null,
      date: pick('receipt_date')?.normalizedValue?.text ?? null,
      total: parseFloat(pick('total_amount')?.normalizedValue?.text ?? '') || null,
      tax: parseFloat(pick('total_tax_amount')?.normalizedValue?.text ?? '') || null,
      currency: pick('currency')?.mentionText ?? 'CAD',
    },
    confidence: Object.fromEntries(ents.map((e: any) => [e.type, e.confidence])),
    boxes: {},
    raw: j,
  };
}

async function fetchGoogleAccessToken(): Promise<string> {
  // TODO: real GCP service account auth using google-auth-library.
  // For brevity in this scaffold, instruct ops to set GOOGLE_ACCESS_TOKEN directly.
  const tok = process.env.GOOGLE_ACCESS_TOKEN;
  if (!tok) throw new Error('GOOGLE_ACCESS_TOKEN missing (or wire up google-auth-library)');
  return tok;
}
