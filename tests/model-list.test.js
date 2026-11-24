import { describe, expect, it } from 'vitest';
import {
  inferParamTier,
  resolveParamTier,
  tierMatches,
  buildLiveHuggingFaceExtras,
} from '../js/providers/model-list.mjs';

describe('inferParamTier', () => {
  it('reads plain size tokens from model ids', () => {
    expect(inferParamTier('meta-llama/Llama-3.1-8B-Instruct')).toBe('8B');
    expect(inferParamTier('google/gemma-2-2b-it')).toBe('2B');
    expect(inferParamTier('Qwen/Qwen3-30B-A3B')).toBe('30B');
    expect(inferParamTier('x/model-0.6b')).toBe('0.6B');
    expect(inferParamTier('google/gemma-4-31b-it:free')).toBe('31B');
  });

  it('returns ? when the id has no plain size token', () => {
    expect(inferParamTier('mistralai/Mixtral-8x7B-Instruct-v0.1')).toBe('?');
    expect(inferParamTier('google/gemma-3n-e4b-it')).toBe('?');
    expect(inferParamTier('provider/free-unknown:free')).toBe('?');
    expect(inferParamTier('')).toBe('?');
  });

  it('prefers a curated size and falls back to inference for ?', () => {
    expect(resolveParamTier('70B', 'x/model-8b')).toBe('70B');
    expect(resolveParamTier('?', 'x/model-8b')).toBe('8B');
    expect(resolveParamTier(undefined, 'x/model')).toBe('?');
  });
});

describe('tierMatches', () => {
  it('buckets sizes by numeric range', () => {
    expect(tierMatches('tiny', '0.6B')).toBe(true);
    expect(tierMatches('small', '4B')).toBe(true);
    expect(tierMatches('small', '8B')).toBe(true);
    expect(tierMatches('mid', '13B')).toBe(true);
    expect(tierMatches('large', '70B')).toBe(true);
    expect(tierMatches('giant', '671B')).toBe(true);
    expect(tierMatches('giant', '70B')).toBe(false);
  });

  it('only matches unknown sizes for all', () => {
    expect(tierMatches('all', '?')).toBe(true);
    expect(tierMatches('giant', '?')).toBe(false);
    expect(tierMatches('tiny', '?')).toBe(false);
  });
});

describe('buildLiveHuggingFaceExtras', () => {
  it('adds unknown live models, labelled unverified, with inferred size', () => {
    const extras = buildLiveHuggingFaceExtras([{ id: 'org/Cool-Chat-8B-Instruct' }]);
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatchObject({ id: 'org/Cool-Chat-8B-Instruct', paramTier: '8B', live: true, curated: false, type: 'chat' });
    expect(extras[0].name).toMatch(/\(unverified\)$/);
  });

  it('skips known ids, duplicates and embedding models', () => {
    const extras = buildLiveHuggingFaceExtras(
      [
        { id: 'known/model' },
        { id: 'org/a-1b' },
        { id: 'org/a-1b' },
        { id: 'org/text-embed-small' },
        { id: 'org/vec', architecture: { modality: 'text->embedding' } },
      ],
      new Set(['known/model'])
    );
    expect(extras.map((m) => m.id)).toEqual(['org/a-1b']);
  });

  it('tolerates a missing list', () => {
    expect(buildLiveHuggingFaceExtras(undefined)).toEqual([]);
  });
});
