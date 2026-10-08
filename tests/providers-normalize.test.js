import { describe, it, expect } from 'vitest';
import { normalizeModel, dedupeAndSort } from '../js/providers/normalize.js';

describe('normalizeModel', () => {
  it('normalizes a minimal live model', () => {
    const m = normalizeModel(
      { id: 'meta-llama/llama-3.1-8b-instruct:free', context_length: 131072 },
      'openrouter'
    );
    expect(m.id).toBe('meta-llama/llama-3.1-8b-instruct:free');
    expect(m.provider).toBe('openrouter');
    expect(m.ctx).toBe(131072);
    expect(m.type).toBe('chat');
    expect(m.paramTier).toBe('?');
  });

  it('prefers curated name and paramTier', () => {
    const m = normalizeModel(
      { id: 'deepseek/deepseek-r1:free', context_length: 65536 },
      'openrouter',
      { name: 'DeepSeek R1 (671B · Reasoning)', paramTier: '671B', ctx: 65536 }
    );
    expect(m.name).toContain('DeepSeek R1');
    expect(m.paramTier).toBe('671B');
  });

  it('marks embedding models', () => {
    const m = normalizeModel(
      { id: 'foo/embed-model', type: 'embedding' },
      'openrouter'
    );
    expect(m.type).toBe('embedding');
  });

  it('throws without id', () => {
    expect(() => normalizeModel({}, 'openrouter')).toThrow(/id/);
  });
});

describe('dedupeAndSort', () => {
  it('drops embeddings and duplicates, sorts by name', () => {
    const models = [
      { id: 'b', name: 'Bravo', type: 'chat', provider: 'or', ctx: 8 },
      { id: 'a', name: 'Alpha', type: 'chat', provider: 'or', ctx: 8 },
      { id: 'a', name: 'Alpha Dup', type: 'chat', provider: 'or', ctx: 8 },
      { id: 'e', name: 'Embed', type: 'embedding', provider: 'or', ctx: 8 },
    ];
    const out = dedupeAndSort(models);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
