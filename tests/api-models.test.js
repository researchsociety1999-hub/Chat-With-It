import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, CURATED_FREE } from '../js/api.js';
import { AppState } from '../js/state.js';

describe('free provider model discovery', () => {
  beforeEach(() => {
    AppState._apiKey = '';
    AppState._hfToken = '';
    AppState.currentProvider = 'openrouter';
    vi.restoreAllMocks();
  });

  it('returns curated free models without credentials and does not call the provider', async () => {
    globalThis.fetch = vi.fn();

    const models = await API.fetchModels('openrouter');

    expect(models.length).toBeGreaterThan(0);
    expect(models.every(model => model.id.endsWith(':free'))).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps only free OpenRouter chat models from a live response', async () => {
    AppState.apiKey = 'sk-' + 'x'.repeat(20);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { id: 'provider/free-model:free', name: 'Free Model', context_length: 16384, pricing: { prompt: '0', completion: '0' } },
        { id: 'provider/paid-model', name: 'Paid Model', pricing: { prompt: '0.001', completion: '0.002' } },
        { id: 'provider/embedding', name: 'Embedding', pricing: { prompt: '0', completion: '0' }, architecture: { modality: 'text->embedding' } },
      ] }),
    });

    const models = await API.fetchModels('openrouter');

    expect(models.map(model => model.id)).toEqual(['provider/free-model:free']);
  });

  it('keeps only curated Hugging Face models confirmed live by the provider', async () => {
    AppState.hfToken = 'hf_' + 'x'.repeat(10);
    const knownFree = CURATED_FREE.huggingface.find(model => model.type !== 'embedding');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { id: knownFree.id },
        { id: 'someone/unknown-paid-model' },
      ] }),
    });

    const models = await API.fetchModels('huggingface');

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ id: knownFree.id, live: true });
  });

  it('rejects provider authentication failures instead of returning fallback models', async () => {
    AppState.apiKey = 'sk-' + 'x'.repeat(20);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
    });

    await expect(API.fetchModels('openrouter')).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('returns no models when the provider has no live free models', async () => {
    AppState.apiKey = 'sk-' + 'x'.repeat(20);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { id: 'provider/paid-model', name: 'Paid Model', pricing: { prompt: '0.001', completion: '0.002' } },
      ] }),
    });

    await expect(API.fetchModels('openrouter')).resolves.toEqual([]);
  });

  it('does not classify unknown-size free models as giant', async () => {
    AppState.apiKey = 'sk-' + 'x'.repeat(20);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { id: 'provider/free-unknown:free', name: 'Unknown Size', pricing: { prompt: '0', completion: '0' } },
      ] }),
    });

    const models = await API.fetchModels('openrouter', 'giant');

    expect(models).toEqual([]);
  });
});
