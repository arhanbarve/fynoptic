import { describe, expect, it } from 'vitest';
import { computeReadMins, deriveBlurb } from '../../src/lib/article-summary';

const wordsHtml = (n: number): string => `<p>${Array.from({ length: n }, () => 'word').join(' ')}</p>`;

describe('computeReadMins', () => {
  it('floors at 3 minutes for very short content', () => {
    expect(computeReadMins(wordsHtml(10))).toBe(3);
    expect(computeReadMins('')).toBe(3);
  });

  it('rounds to the nearest minute at 225 wpm once past the floor', () => {
    // 787 / 225 = 3.4977... -> rounds down to 3 (still at the floor)
    expect(computeReadMins(wordsHtml(787))).toBe(3);
    // 788 / 225 = 3.502... -> rounds up to 4
    expect(computeReadMins(wordsHtml(788))).toBe(4);
  });

  it('strips script/style content before counting words', () => {
    // 900 real words -> 4 min. A script body with another 900 words must not
    // leak into the count (900+900=1800 -> would round to 8 if it did).
    const html = `${wordsHtml(900)}<script>${Array.from({ length: 900 }, () => 'ignored').join(' ')}</script>`;
    expect(computeReadMins(html)).toBe(4);
  });
});

describe('deriveBlurb', () => {
  it('returns short text unchanged, at exactly the 160-char threshold', () => {
    const exact = 'a'.repeat(160);
    expect(deriveBlurb(exact)).toBe(exact);
    expect(deriveBlurb(exact)).not.toContain('…');
  });

  it('cuts on a word boundary rather than mid-word', () => {
    // 150 a's + space + 20 b's = 171 chars. The 160-char slice lands 9 b's
    // in; the word-boundary rule must discard that partial word entirely.
    const text = `${'a'.repeat(150)} ${'b'.repeat(20)}`;
    const blurb = deriveBlurb(text);
    expect(blurb).toBe(`${'a'.repeat(150)}…`);
  });

  it('falls back to a hard cut when there is no space to break on', () => {
    const text = 'a'.repeat(161);
    expect(deriveBlurb(text)).toBe(`${'a'.repeat(160)}…`);
  });

  it('strips trailing punctuation left dangling by the cut', () => {
    // Cutting at the word boundary leaves "...aaa," right before the
    // ellipsis; the trailing comma must be stripped.
    const text = `${'a'.repeat(149)}, ${'b'.repeat(30)}`;
    const blurb = deriveBlurb(text);
    expect(blurb).toBe(`${'a'.repeat(149)}…`);
  });

  it('decodes entities and strips tags/scripts before blurbing', () => {
    const html = `<p>Fees &amp; charges &nbsp; add up &#8217;fast&rsquo;.</p><script>ignored</script>`;
    expect(deriveBlurb(html)).toBe('Fees & charges add up ’fast’.');
  });
});
