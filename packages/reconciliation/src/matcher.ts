// ============================================================================
// Statement-line ↔ receipt matching engine.
//
// Deterministic, explainable algorithm. Every score has a breakdown the UI
// surfaces so the bookkeeper can see WHY the matcher thinks two records pair.
//
// AUTO_MATCH_THRESHOLD = 80 AND winner-runner-up gap >= 20 → auto-match.
// SUGGEST_THRESHOLD    = 40 → render in the "needs confirmation" pile.
// Below 40                  → unmatched.
// ============================================================================

import type { Expense, StatementLine } from '@expensehub/shared';
import { merchantSimilarity, daysBetween } from './normalize';

export const AUTO_MATCH_THRESHOLD = 80;
export const SUGGEST_THRESHOLD = 40;
export const AMBIGUITY_GAP = 20;

export interface MatchReason {
  amount: number;
  date: number;
  merchant: number;
  card: number;
}

export interface MatchCandidate {
  expenseId: string;
  score: number;
  reason: MatchReason;
}

export interface MatchOutcome {
  lineId: string;
  status: 'matched' | 'suggested' | 'unmatched';
  best?: MatchCandidate;
  alternates: MatchCandidate[];
}

/** Score a (line, expense) pair. Returns 0 if amount mismatches. */
export function score(line: Pick<StatementLine, 'amount' | 'txnDate' | 'description' | 'cardLast4'>,
                     expense: Pick<Expense, 'totalAmount' | 'txnDate' | 'merchant' | 'paymentCardLast4'>):
  { total: number; reason: MatchReason } {

  const reason: MatchReason = { amount: 0, date: 0, merchant: 0, card: 0 };

  // 1. Amount — exact match within 1¢ is mandatory
  const a = Number(line.amount);
  const b = Number(expense.totalAmount ?? 0);
  if (Math.abs(a - b) > 0.01) return { total: 0, reason };
  reason.amount = 50;

  // 2. Date proximity
  if (!expense.txnDate) return { total: 0, reason };
  const days = Math.abs(daysBetween(line.txnDate, expense.txnDate));
  if      (days === 0)   reason.date = 25;
  else if (days <= 1)    reason.date = 20;
  else if (days <= 3)    reason.date = 12;
  else if (days <= 7)    reason.date = 5;
  else return { total: 0, reason };                 // > 7 days: not a match

  // 3. Merchant name similarity
  const sim = merchantSimilarity(line.description, expense.merchant ?? '');
  if      (sim >= 0.85) reason.merchant = 25;
  else if (sim >= 0.65) reason.merchant = 15;
  else if (sim >= 0.40) reason.merchant = 5;
  else                  reason.merchant = 0;

  // 4. Card last-4 alignment when both are known
  if (line.cardLast4 && expense.paymentCardLast4 && line.cardLast4 === expense.paymentCardLast4) {
    reason.card = 10;
  }

  const total = reason.amount + reason.date + reason.merchant + reason.card;
  return { total, reason };
}

/** Match a single statement line against a pool of candidate expenses. */
export function matchLine(
  line: Pick<StatementLine, 'id' | 'amount' | 'txnDate' | 'description' | 'cardLast4'>,
  candidates: Array<Pick<Expense, 'id' | 'totalAmount' | 'txnDate' | 'merchant' | 'paymentCardLast4'>>,
): MatchOutcome {
  const scored: MatchCandidate[] = candidates
    .map(e => {
      const { total, reason } = score(line, e);
      return { expenseId: e.id, score: total, reason };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { lineId: line.id, status: 'unmatched', alternates: [] };

  const [winner, ...rest] = scored;
  const runnerUp = rest[0]?.score ?? 0;

  if (winner.score >= AUTO_MATCH_THRESHOLD && (winner.score - runnerUp) >= AMBIGUITY_GAP) {
    return { lineId: line.id, status: 'matched', best: winner, alternates: rest.slice(0, 3) };
  }
  if (winner.score >= SUGGEST_THRESHOLD) {
    return { lineId: line.id, status: 'suggested', best: winner, alternates: rest.slice(0, 3) };
  }
  return { lineId: line.id, status: 'unmatched', alternates: [] };
}

/** Match every line against the candidate pool. */
export function matchStatement(
  lines: Array<Pick<StatementLine, 'id' | 'amount' | 'txnDate' | 'description' | 'cardLast4'>>,
  candidates: Array<Pick<Expense, 'id' | 'totalAmount' | 'txnDate' | 'merchant' | 'paymentCardLast4'>>,
): MatchOutcome[] {
  const consumed = new Set<string>();
  const outcomes: MatchOutcome[] = [];

  // Two-pass: first all confident auto-matches, then suggested.
  // This prevents a confident match from being stolen by an earlier ambiguous line.
  for (const phase of ['matched', 'suggested'] as const) {
    for (const line of lines) {
      if (outcomes.find(o => o.lineId === line.id)) continue;
      const pool = candidates.filter(c => !consumed.has(c.id));
      const out = matchLine(line, pool);
      if (out.status === phase) {
        if (out.best) consumed.add(out.best.expenseId);
        outcomes.push(out);
      }
    }
  }
  // Anything still without an outcome → unmatched
  for (const line of lines) {
    if (!outcomes.find(o => o.lineId === line.id)) {
      outcomes.push({ lineId: line.id, status: 'unmatched', alternates: [] });
    }
  }
  return outcomes;
}
