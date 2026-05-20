// ============================================================================
// AI classification — picks a GL account from the tenant's chart of accounts.
//
// Real implementation calls Claude on Bedrock. Stub uses a rules table so the
// local dev experience matches the production behaviour closely enough.
// ============================================================================
import type { OcrResult } from './document-ai';

interface CoaAccount { id: string; external_id: string | null; code: string | null; name: string; type: string; }

export interface AiSuggestion {
  accountId: string | null;
  accountName: string | null;
  accountExternalId: string | null;
  confidence: number;
  reasoning: string;
  flags: string[];
}

const RULES: Array<{ pattern: RegExp; acctMatch: RegExp; reasoning: string }> = [
  { pattern: /starbucks|tim hortons|coffee|caf[eé]|bakery|bistro|restaurant/i,
    acctMatch: /meals/i, reasoning: 'Merchant indicates meal/coffee.' },
  { pattern: /joey|cactus|hy.s|keg|earls|client/i,
    acctMatch: /client|entertainment/i, reasoning: 'Likely client entertainment venue.' },
  { pattern: /home depot|rona|lowe|materials/i,
    acctMatch: /materials|job materials/i, reasoning: 'Building/job materials supplier.' },
  { pattern: /staples|office|costco|amazon/i,
    acctMatch: /office supplies/i, reasoning: 'Office supplies vendor.' },
  { pattern: /adobe|microsoft|google|aws|zoom|slack/i,
    acctMatch: /software/i, reasoning: 'Software subscription vendor.' },
  { pattern: /air canada|westjet|delta|united|aircan/i,
    acctMatch: /airfare/i, reasoning: 'Airline.' },
  { pattern: /marriott|hilton|hyatt|hotel|airbnb|inn|suites/i,
    acctMatch: /hotel/i, reasoning: 'Lodging.' },
  { pattern: /uber|lyft|taxi/i,
    acctMatch: /ground|transport|travel/i, reasoning: 'Ground transport.' },
  { pattern: /shell|petro.?can|esso|chevron|fuel|gas/i,
    acctMatch: /fuel|vehicle/i, reasoning: 'Fuel.' },
];

export async function classify(ocr: OcrResult, accounts: CoaAccount[]): Promise<AiSuggestion> {
  if (process.env.ANTHROPIC_BEDROCK_MODEL_ID && process.env.AWS_ACCESS_KEY_ID) {
    // TODO: real Claude on Bedrock call. See @anthropic-ai/bedrock-sdk.
    return ruleBasedClassify(ocr, accounts);
  }
  return ruleBasedClassify(ocr, accounts);
}

function ruleBasedClassify(ocr: OcrResult, accounts: CoaAccount[]): AiSuggestion {
  const merchant = ocr.fields.merchant ?? '';
  for (const rule of RULES) {
    if (rule.pattern.test(merchant)) {
      const acct = accounts.find(a => rule.acctMatch.test(a.name));
      if (acct) return {
        accountId: acct.id, accountName: acct.name, accountExternalId: acct.external_id,
        confidence: 0.83, reasoning: rule.reasoning, flags: [],
      };
    }
  }
  // Fallback: "Miscellaneous" or first expense account
  const fallback = accounts.find(a => /misc/i.test(a.name)) ?? accounts.find(a => a.type === 'expense');
  return {
    accountId: fallback?.id ?? null,
    accountName: fallback?.name ?? null,
    accountExternalId: fallback?.external_id ?? null,
    confidence: 0.45,
    reasoning: 'No strong merchant pattern; defaulted to Miscellaneous.',
    flags: ['low_confidence'],
  };
}
