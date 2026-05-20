// ============================================================================
// Merchant-name normalization + Levenshtein similarity used by the matcher.
// ============================================================================

const NOISE_PREFIXES = [
  'pos ', 'visa ', 'mc ', 'mastercard ', 'amex ', 'sq * ', 'sq*',
  'paypal *', 'paypal*', 'tst * ', 'tst*', 'gpc * ',
];
const NOISE_TOKENS = new Set([
  'inc', 'inc.', 'llc', 'ltd', 'ltd.', 'co', 'co.', 'corp', 'corp.',
  'the', 'a', 'an', 'and', 'of',
  'restaurant', 'restaurants',
]);
const STRIP_AFTER = ['#', '*', '  ', '\t'];

/** Strip the bank-feed cruft, location suffixes, and corporate suffixes. */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  for (const p of NOISE_PREFIXES) {
    if (s.startsWith(p)) s = s.slice(p.length);
  }
  for (const cut of STRIP_AFTER) {
    const i = s.indexOf(cut);
    if (i > 0) s = s.slice(0, i);
  }
  // Remove location codes commonly trailing the merchant: "STARBUCKS #4421 VANCOUVER BC"
  s = s.replace(/\b[a-z]{2}\b$/g, '');                  // trailing province/state
  s = s.replace(/\b\d{5,}\b/g, '');                     // store numbers
  s = s.replace(/[^a-z0-9 ]+/g, ' ');
  const tokens = s.split(/\s+/).filter(t => t && !NOISE_TOKENS.has(t));
  return tokens.join(' ').trim();
}

/** Damerau-Levenshtein-ish similarity in [0,1]. Cheap for short strings. */
export function merchantSimilarity(a: string, b: string): number {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - d / maxLen);
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Days between two ISO date strings (signed, positive when a > b). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + (a.length === 10 ? 'T00:00:00Z' : ''));
  const db = new Date(b + (b.length === 10 ? 'T00:00:00Z' : ''));
  return (da.getTime() - db.getTime()) / 86_400_000;
}
