import { describe, expect, it } from 'vitest';
import { inferIntent, pickFreeModel, scoreFreeModel, suggestFreeAlternative } from '../js/providers/routing.mjs';

const models = [
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen Coder', ctx: 32768, paramTier: '32B' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', ctx: 65536, paramTier: '671B' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 8B', ctx: 131072, paramTier: '8B' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 27B', ctx: 131072, paramTier: '30B' },
];

describe('free-model routing', () => {
  it('infers coding / reasoning / fast intents', () => {
    expect(inferIntent('fix this TypeScript bug')).toBe('coding');
    expect(inferIntent('reason step by step about the math proof')).toBe('reasoning');
    expect(inferIntent('quick brief answer')).toBe('fast');
    expect(inferIntent('hello there')).toBe('general');
  });

  it('never returns embedding or excluded models', () => {
    const pick = pickFreeModel(
      [...models, { id: 'x/embed:free', type: 'embedding' }],
      { exclude: ['deepseek/deepseek-r1:free'] },
    );
    expect(pick.id).not.toBe('deepseek/deepseek-r1:free');
    expect(pick.type).not.toBe('embedding');
  });

  it('prefers coding models for coding intent', () => {
    const pick = pickFreeModel(models, { intent: 'coding' });
    expect(pick.id).toContain('coder');
  });

  it('suggestFreeAlternative skips the failed id', () => {
    const alt = suggestFreeAlternative(models, 'deepseek/deepseek-r1:free');
    expect(alt.id).not.toBe('deepseek/deepseek-r1:free');
  });

  it('scores :free ids above non-free when otherwise equal', () => {
    const a = scoreFreeModel({ id: 'x/y:free', ctx: 8192 }, 'general');
    const b = scoreFreeModel({ id: 'x/y', ctx: 8192 }, 'general');
    expect(a).toBeGreaterThan(b);
  });
});
