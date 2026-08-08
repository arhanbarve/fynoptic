import { describe, expect, it } from 'vitest';
import { shuffle } from '../../src/lib/shuffle';
import type { Flashcard } from '../../src/types';

// The pieces under test here are unexported internals of
// src/islands/flashcard.ts closed over DOM elements (`els.*`) that don't
// exist outside a rendered flashcard.astro page. Per Phase 1e they're
// pinned via faithful, byte-for-byte-where-possible copies of the
// algorithmic bodies (cited to source line numbers) rather than modifying
// flashcard.ts, which this phase does not touch.

// ---- fill-in-the-blank answer comparison (flashcard.ts:756-764) ----
// `val` is trimmed; `target` is NOT. Both are lowercased only when
// `ciChecked` is true. In production `els.caseInsensitive` is always null
// (#case-insensitive has no markup anywhere — flashcard.ts:214), so
// `ciChecked` is unconditionally `true` today; that's pinned below too.
function checkFitbAnswer(rawInput: string, target: string, caseInsensitiveEl: { checked: boolean } | null): boolean {
  const val = (rawInput || '').trim();
  const ciChecked = caseInsensitiveEl ? !!caseInsensitiveEl.checked : true;
  const normalize = (s: string): string => (ciChecked ? s.toLowerCase() : s);
  return normalize(val) === normalize(target);
}

// ---- deck construction (flashcard.ts:582-589) ----
interface DeckCard extends Flashcard {
  unit: string;
  id: string;
}

function buildDeck(units: string[], flashcardUnits: Record<string, Flashcard[]>): DeckCard[] {
  const deck: DeckCard[] = [];
  units.forEach((u) => {
    (flashcardUnits[u] ?? []).forEach((card) => {
      deck.push({ ...card, unit: u, id: `${u}::${card.term}` });
    });
  });
  return deck;
}

// ---- multiple-choice distractors (flashcard.ts:690-705) ----
function buildMcOptions(card: Flashcard, pool: Flashcard[], useTermAnswers: boolean): string[] {
  const correctValue = useTermAnswers ? card.term : card.definition;
  const candidates = pool.map((c) => (useTermAnswers ? c.term : c.definition)).filter((v) => v && v !== correctValue);

  const values = new Set<string>([correctValue]);
  while (values.size < 4 && candidates.length) {
    const i = Math.floor(Math.random() * candidates.length);
    values.add(candidates[i]!);
    candidates.splice(i, 1);
  }
  return shuffle(Array.from(values));
}

describe('fill-in-the-blank answer comparison', () => {
  it('trims the input but not the target — a trailing target space fails a trimmed match', () => {
    expect(checkFitbAnswer('CD', 'CD ', null)).toBe(false);
  });

  it('a missing trailing period on the input fails', () => {
    expect(checkFitbAnswer('opportunity cost', 'opportunity cost.', null)).toBe(false);
  });

  it('an internal double space in the target fails a single-spaced input', () => {
    expect(checkFitbAnswer('time value of money', 'time  value of money', null)).toBe(false);
  });

  it('dropped parentheses fail — "Certificate of deposit (CD)" needs its parens', () => {
    expect(checkFitbAnswer('Certificate of deposit CD', 'Certificate of deposit (CD)', null)).toBe(false);
  });

  it('an exact match (including trimmed leading/trailing whitespace on input) passes', () => {
    expect(checkFitbAnswer('  Certificate of deposit (CD)  ', 'Certificate of deposit (CD)', null)).toBe(true);
  });

  it('case-insensitivity is unconditional today — #case-insensitive has no markup, so the element is always null', () => {
    expect(checkFitbAnswer('cd', 'CD', null)).toBe(true);
    expect(checkFitbAnswer('CERTIFICATE', 'certificate', null)).toBe(true);
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
