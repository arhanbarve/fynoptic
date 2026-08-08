import { describe, expect, it } from 'vitest';
import { shuffle } from '../../src/lib/shuffle';

describe('shuffle', () => {
  it('returns a new array (does not mutate the input)', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves length', () => {
    const input = Array.from({ length: 37 }, (_, i) => i);
    expect(shuffle(input)).toHaveLength(37);
  });

  it('preserves the same multiset of elements, including duplicates', () => {
    const input = ['a', 'b', 'b', 'c', 'c', 'c'];
    const result = shuffle(input);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });

  it('handles empty and single-element arrays without throwing', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });
});
