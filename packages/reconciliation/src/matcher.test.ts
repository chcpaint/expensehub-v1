// ============================================================================
// Unit tests for the matcher. Run with: npm run test:reconciliation
// ============================================================================

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { score, matchLine, matchStatement, AUTO_MATCH_THRESHOLD } from './matcher';
import { merchantSimilarity, normalizeMerchant } from './normalize';

// ---------------------------------------------------------------------------
// Normalize / similarity
// ---------------------------------------------------------------------------
test('normalizeMerchant strips bank-feed cruft', () => {
  assert.equal(normalizeMerchant('SQ * STARBUCKS #4421 VANCOUVER BC'), 'starbucks');
  assert.equal(normalizeMerchant('TST* Joey Restaurants Inc.'), 'joey');
  assert.equal(normalizeMerchant('PAYPAL *ADOBE INC LLC'), 'adobe');
});

test('merchantSimilarity recognizes related names', () => {
  assert.ok(merchantSimilarity('STARBUCKS #4421 VANCOUVER BC', 'Starbucks Coffee') >= 0.85);
  assert.ok(merchantSimilarity('JOEY BISTRO BURRARD ST', 'Joey Restaurants') >= 0.40);
  assert.equal(merchantSimilarity('UBER * TRIP', 'Lyft Ride'), 0);
});

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------
test('score: perfect match maxes out around 110', () => {
  const r = score(
    { amount: 13.81, txnDate: '2026-05-19', description: 'STARBUCKS #4421 VANCOUVER BC', cardLast4: '8821' },
    { totalAmount: 13.81, txnDate: '2026-05-19', merchant: 'Starbucks #4421', paymentCardLast4: '8821' },
  );
  assert.equal(r.reason.amount, 50);
  assert.equal(r.reason.date, 25);
  assert.equal(r.reason.merchant, 25);
  assert.equal(r.reason.card, 10);
  assert.equal(r.total, 110);
});

test('score: amount mismatch returns 0', () => {
  const r = score(
    { amount: 13.82, txnDate: '2026-05-19', description: 'starbucks', cardLast4: null },
    { totalAmount: 13.81, txnDate: '2026-05-19', merchant: 'starbucks', paymentCardLast4: null },
  );
  assert.equal(r.total, 0);
});

test('score: 1-cent rounding still matches on amount', () => {
  const r = score(
    { amount: 13.81, txnDate: '2026-05-19', description: 'starbucks', cardLast4: null },
    { totalAmount: 13.815, txnDate: '2026-05-19', merchant: 'starbucks', paymentCardLast4: null },
  );
  assert.ok(r.total > 0);
  assert.equal(r.reason.amount, 50);
});

test('score: date > 7 days disqualifies', () => {
  const r = score(
    { amount: 50, txnDate: '2026-05-19', description: 'starbucks', cardLast4: null },
    { totalAmount: 50, txnDate: '2026-05-01', merchant: 'starbucks', paymentCardLast4: null },
  );
  assert.equal(r.total, 0);
});

test('score: weekend lag still partially credits date', () => {
  const r = score(
    { amount: 50, txnDate: '2026-05-19', description: 'starbucks', cardLast4: null },
    { totalAmount: 50, txnDate: '2026-05-17', merchant: 'starbucks', paymentCardLast4: null },
  );
  assert.equal(r.reason.date, 12);
});

// ---------------------------------------------------------------------------
// matchLine
// ---------------------------------------------------------------------------
test('matchLine: clear winner auto-matches', () => {
  const out = matchLine(
    { id: 'L1', amount: 13.81, txnDate: '2026-05-19', description: 'STARBUCKS #4421', cardLast4: '8821' },
    [
      { id: 'E1', totalAmount: 13.81, txnDate: '2026-05-19', merchant: 'Starbucks #4421', paymentCardLast4: '8821' },
      { id: 'E2', totalAmount: 89.99, txnDate: '2026-05-19', merchant: 'Adobe Inc', paymentCardLast4: '8821' },
    ],
  );
  assert.equal(out.status, 'matched');
  assert.equal(out.best?.expenseId, 'E1');
});

test('matchLine: two candidates with identical amount → suggested, not matched', () => {
  const out = matchLine(
    { id: 'L1', amount: 48.20, txnDate: '2026-05-14', description: 'UBER * EATS', cardLast4: null },
    [
      { id: 'E1', totalAmount: 48.20, txnDate: '2026-05-14', merchant: 'Uber Eats', paymentCardLast4: null },
      { id: 'E2', totalAmount: 48.20, txnDate: '2026-05-14', merchant: 'Uber Eats Order #42', paymentCardLast4: null },
    ],
  );
  assert.equal(out.status, 'suggested');
  assert.equal(out.alternates.length, 1);
});

test('matchLine: no candidate hits → unmatched', () => {
  const out = matchLine(
    { id: 'L1', amount: 999.99, txnDate: '2026-05-19', description: 'MARRIOTT', cardLast4: null },
    [
      { id: 'E1', totalAmount: 13.81, txnDate: '2026-05-19', merchant: 'Starbucks', paymentCardLast4: null },
    ],
  );
  assert.equal(out.status, 'unmatched');
});

// ---------------------------------------------------------------------------
// matchStatement — consumes candidates so they don't get matched twice
// ---------------------------------------------------------------------------
test('matchStatement: confident matches happen before suggested', () => {
  const lines = [
    { id: 'L1', amount: 48.20, txnDate: '2026-05-14', description: 'UBER * EATS', cardLast4: null },
    { id: 'L2', amount: 13.81, txnDate: '2026-05-19', description: 'STARBUCKS #4421', cardLast4: null },
  ];
  const candidates = [
    { id: 'E_uber_a', totalAmount: 48.20, txnDate: '2026-05-14', merchant: 'Uber Eats',         paymentCardLast4: null },
    { id: 'E_uber_b', totalAmount: 48.20, txnDate: '2026-05-14', merchant: 'Uber Eats Order',   paymentCardLast4: null },
    { id: 'E_sbux',   totalAmount: 13.81, txnDate: '2026-05-19', merchant: 'Starbucks #4421',   paymentCardLast4: null },
  ];
  const outcomes = matchStatement(lines, candidates);
  const sbux = outcomes.find(o => o.lineId === 'L2');
  const uber = outcomes.find(o => o.lineId === 'L1');
  assert.equal(sbux?.status, 'matched');
  assert.equal(uber?.status, 'suggested');
});
