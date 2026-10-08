import { describe, it, expect } from 'vitest';
import {
  bootstrapProviders,
  getProvider,
  listProviderIds,
  hasProvider,
} from '../js/providers/index.js';

describe('provider registry', () => {
  it('registers OpenRouter and Hugging Face on bootstrap', () => {
    bootstrapProviders();
    expect(hasProvider('openrouter')).toBe(true);
    expect(hasProvider('huggingface')).toBe(true);
    expect(listProviderIds().sort()).toEqual(['huggingface', 'openrouter']);
  });

  it('getProvider returns adapters with required methods', () => {
    const or = getProvider('openrouter');
    expect(typeof or.listModels).toBe('function');
    expect(typeof or.streamChat).toBe('function');
    expect(or.name).toBe('OpenRouter');

    const hf = getProvider('huggingface');
    expect(typeof hf.listModels).toBe('function');
    expect(typeof hf.streamChat).toBe('function');
    expect(hf.name).toBe('Hugging Face');
  });

  it('throws for unknown provider', () => {
    expect(() => getProvider('does-not-exist')).toThrow(/Unknown provider/);
  });
});
