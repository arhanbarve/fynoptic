import { describe, expect, it } from 'vitest';
import { buildDeck, buildMcOptions, checkFitbAnswer } from '../../src/hooks/useFlashcardDeck';
import type { Flashcard } from '../../src/types';

// Phase 10e extracted buildDeck/checkFitbAnswer/buildMcOptions out of
// src/islands/flashcard.ts (closed over DOM elements and a module-level
// `state`) into src/hooks/useFlashcardDeck.ts as real exported functions.
// These tests now import that real module instead of the byte-for-byte
// copies Phase 1e pinned this file with — same algorithm, same assertions,
// no copy left to drift.
//
// checkFitbAnswer dropped the dead `els.caseInsensitive` parameter entirely
// (Appendix E — `#case-insensitive` has no markup anywhere, so that read
// was unconditionally the case-insensitive branch); the real function
// always lowercases both sides, matching what every one of these tests
// already exercised (none of them ever passed a truthy checked object).

describe('fill-in-the-blank answer comparison', () => {
  it('trims the input but not the target — a trailing target space fails a trimmed match', () => {
    expect(checkFitbAnswer('CD', 'CD ')).toBe(false);
  });

  it('a missing trailing period on the input fails', () => {
    expect(checkFitbAnswer('opportunity cost', 'opportunity cost.')).toBe(false);
  });

  it('an internal double space in the target fails a single-spaced input', () => {
    expect(checkFitbAnswer('time value of money', 'time  value of money')).toBe(false);
  });

  it('dropped parentheses fail — "Certificate of deposit (CD)" needs its parens', () => {
    expect(checkFitbAnswer('Certificate of deposit CD', 'Certificate of deposit (CD)')).toBe(false);
  });

  it('an exact match (including trimmed leading/trailing whitespace on input) passes', () => {
    expect(checkFitbAnswer('  Certificate of deposit (CD)  ', 'Certificate of deposit (CD)')).toBe(true);
  });

  it('case-insensitivity is unconditional today — #case-insensitive has no markup, so the element is always null', () => {
    expect(checkFitbAnswer('cd', 'CD')).toBe(true);
    expect(checkFitbAnswer('CERTIFICATE', 'certificate')).toBe(true);
  });
});

describe('deck id format and ordering (I4 storage contract)', () => {
  const units: Record<string, Flashcard[]> = {
    Unit_A: [
      { term: 'Alpha', definition: 'first' },
      { term: 'Beta', definition: 'second' },
    ],
    Unit_B: [
      { term: 'Gamma', definition: 'third' },
      { term: 'Delta', definition: 'fourth' },
    ],
  };

  it('the deck id is exactly `${unit}::${term}` — the localStorage key contract', () => {
    const deck = buildDeck(['Unit_A'], units);
    expect(deck.map((c) => c.id)).toEqual(['Unit_A::Alpha', 'Unit_A::Beta']);
  });

  it('preserves unit-selection order, then source order within each unit', () => {
    const deck = buildDeck(['Unit_B', 'Unit_A'], units);
    expect(deck.map((c) => c.id)).toEqual(['Unit_B::Gamma', 'Unit_B::Delta', 'Unit_A::Alpha', 'Unit_A::Beta']);
  });

  it('an unknown unit contributes nothing (no throw)', () => {
    const deck = buildDeck(['Unit_A', 'does-not-exist'], units);
    expect(deck).toHaveLength(2);
  });
});

describe('multiple-choice distractors', () => {
  it('the correct value is always present', () => {
    const card = { term: 'Alpha', definition: 'first' };
    const pool = [card, { term: 'Beta', definition: 'second' }, { term: 'Gamma', definition: 'third' }];
    const options = buildMcOptions(card, pool, true);
    expect(options).toContain('Alpha');
  });

  it('duplicate candidate values collapse via the Set, so fewer than 4 options is possible', () => {
    const card = { term: 'Alpha', definition: 'first' };
    // Every distractor candidate shares the same term value -> the Set can
    // only ever grow to size 2 (correct + one duplicate-collapsed value),
    // no matter how many cards are in the pool.
    const pool = [
      card,
      { term: 'Same', definition: 'x' },
      { term: 'Same', definition: 'y' },
      { term: 'Same', definition: 'z' },
      { term: 'Same', definition: 'w' },
    ];
    const options = buildMcOptions(card, pool, true);
    expect(options).toHaveLength(2);
    expect(options).toContain('Alpha');
    expect(options).toContain('Same');
  });

  it('caps at 4 options when there are enough unique distractors', () => {
    const card = { term: 'Alpha', definition: 'first' };
    const pool = [
      card,
      { term: 'Beta', definition: '2' },
      { term: 'Gamma', definition: '3' },
      { term: 'Delta', definition: '4' },
      { term: 'Epsilon', definition: '5' },
    ];
    const options = buildMcOptions(card, pool, true);
    expect(options).toHaveLength(4);
    expect(options).toContain('Alpha');
  });

  it('excludes cards with an empty distractor value instead of offering a blank option', () => {
    const card = { term: 'Alpha', definition: 'first' };
    const pool = [card, { term: '', definition: 'x' }, { term: 'Beta', definition: 'y' }];
    const options = buildMcOptions(card, pool, true);
    expect(options).not.toContain('');
    expect(options.sort()).toEqual(['Alpha', 'Beta']);
  });
});
