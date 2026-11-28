import { describe, expect, it } from 'vitest';
import {
  estimateTokens,
  estimateContext,
  contextLevel,
  formatCount,
  formatContextPill,
} from '../js/providers/context-estimate.mjs';

describe('estimateTokens', () => {
  it('is characters / 4 rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('treats anything that is not a string as empty', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(42)).toBe(0);
  });
});

describe('estimateContext', () => {
  it('adds the persona prompt, every history message and the draft', () => {
    const est = estimateContext({
      persona: 'a'.repeat(40),
      history: [{ content: 'a'.repeat(400) }, { content: 'a'.repeat(100) }],
      draft: 'b'.repeat(200),
      limit: 1000,
    });
    expect(est.used).toBe(10 + 100 + 25 + 50);
    expect(est.limit).toBe(1000);
    expect(est.ratio).toBeCloseTo(0.185, 5);
    expect(est.percent).toBe(19);
    expect(est.level).toBe('ok');
  });

  it('skips history entries without text', () => {
    const est = estimateContext({ history: [null, {}, { content: 7 }, { content: 'abcd' }], limit: 100 });
    expect(est.used).toBe(1);
  });

  it('falls back to an 8192 token window when the limit is missing or invalid', () => {
    expect(estimateContext({}).limit).toBe(8192);
    expect(estimateContext({ limit: 0 }).limit).toBe(8192);
    expect(estimateContext({ limit: NaN }).limit).toBe(8192);
    expect(estimateContext({ limit: -5 }).limit).toBe(8192);
  });

  it('reports the level of the whole estimate', () => {
    expect(estimateContext({ draft: 'x'.repeat(2800), limit: 1000 }).level).toBe('warning');
    expect(estimateContext({ draft: 'x'.repeat(3640), limit: 1000 }).level).toBe('critical');
  });
});

describe('contextLevel', () => {
  it('is ok below 70%', () => {
    expect(contextLevel(0, 100)).toBe('ok');
    expect(contextLevel(69, 100)).toBe('ok');
    expect(contextLevel(5734, 8192)).toBe('ok');
  });

  it('is warning from 70% up to and including 90%', () => {
    expect(contextLevel(70, 100)).toBe('warning');
    expect(contextLevel(90, 100)).toBe('warning');
    expect(contextLevel(5735, 8192)).toBe('warning');
    expect(contextLevel(7372, 8192)).toBe('warning');
  });

  it('is critical above 90%, including past 100%', () => {
    expect(contextLevel(91, 100)).toBe('critical');
    expect(contextLevel(7373, 8192)).toBe('critical');
    expect(contextLevel(150, 100)).toBe('critical');
  });

  it('is ok when there is nothing to measure', () => {
    expect(contextLevel(10, 0)).toBe('ok');
    expect(contextLevel(0, 0)).toBe('ok');
  });
});

describe('pill text', () => {
  it('formats counts compactly', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(1234)).toBe('1.2k');
    expect(formatCount(8192)).toBe('8.2k');
    expect(formatCount(9999)).toBe('10k');
    expect(formatCount(12000)).toBe('12k');
    expect(formatCount(131072)).toBe('131k');
  });

  it('renders used / limit with a leading ~', () => {
    expect(formatContextPill({ used: 1234, limit: 8192 })).toBe('~1.2k / 8.2k tokens');
    expect(formatContextPill({ used: 0, limit: 8192 })).toBe('~0 / 8.2k tokens');
    expect(formatContextPill({ used: 850, limit: 131072 })).toBe('~850 / 131k tokens');
  });
});
