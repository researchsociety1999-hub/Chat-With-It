import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppState } from '../js/state.js';
import { API } from '../js/api.js';
import '../js/local-bridge.js';
import {
  setEngineLoader,
  isEngineConfigured,
  loadLocalModel,
  unloadLocalModel,
  getLoadedLocalModel,
  getLastRun,
  wllamaAdapter,
  __resetLocalEngineForTests,
} from '../js/providers/wllama.js';

function fakeEngine({ tokens = ['Hel', 'lo'], failLoad = false } = {}) {
  class FakeWllama {
    constructor(config) { this.config = config; }
    async loadModel(files, params) {
      if (failLoad) throw new Error('boom');
      this.files = files;
      this.params = params;
    }
    async exit() { this.exited = true; }
    isMultithread() { return false; }
    getNumThreads() { return 1; }
    isSupportWebGPU() { return false; }
    async createChatCompletion(request) {
      const signal = request.abortSignal;
      async function* generate() {
        for (const token of tokens) {
          if (signal && signal.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            throw err;
          }
          yield { choices: [{ delta: { content: token } }] };
        }
      }
      return generate();
    }
  }
  return async () => ({ Wllama: FakeWllama, config: { default: 'wllama.wasm' } });
}

const gguf = (name = 'tiny-1.5b-q4.gguf') => new File(['GGUF'], name);

describe('local provider state', () => {
  it('treats local as a valid provider that needs no key', () => {
    expect(AppState.isValidProvider('local')).toBe(true);
    expect(AppState.isAuthenticatedFor('local')).toBe(true);
    const previous = AppState.currentProvider;
    AppState.currentProvider = 'local';
    expect(AppState.getAuthToken()).toBe('');
    AppState.currentProvider = previous;
  });

  it('still rejects unknown providers', () => {
    expect(AppState.isValidProvider('nope')).toBe(false);
    expect(AppState.isAuthenticatedFor('nope')).toBe(false);
  });
});

describe('wllama local adapter', () => {
  beforeEach(() => __resetLocalEngineForTests());
  afterEach(() => __resetLocalEngineForTests());

  it('rejects files that are not .gguf', async () => {
    setEngineLoader(fakeEngine());
    await expect(loadLocalModel(new File(['x'], 'notes.txt'))).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(loadLocalModel(new File([], 'empty.gguf'))).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('reports a missing engine instead of crashing', async () => {
    expect(isEngineConfigured()).toBe(false);
    await expect(loadLocalModel(gguf())).rejects.toMatchObject({ code: 'ENGINE_MISSING' });
  });

  it('loads a gguf file and lists it as the only model', async () => {
    setEngineLoader(fakeEngine());
    const model = await loadLocalModel(gguf());
    expect(model).toMatchObject({ id: 'local/tiny-1.5b-q4.gguf', name: 'tiny-1.5b-q4', paramTier: '1.5B', local: true, ctx: 4096 });
    expect(model.runtime).toMatchObject({ threads: 1, multithread: false, webgpu: false });
    expect(getLoadedLocalModel()).toBe(model);
    expect(await wllamaAdapter.listModels()).toEqual([model]);
  });

  it('surfaces engine load errors and leaves nothing loaded', async () => {
    setEngineLoader(fakeEngine({ failLoad: true }));
    await expect(loadLocalModel(gguf())).rejects.toThrow('boom');
    expect(getLoadedLocalModel()).toBeNull();
  });

  it('streams tokens and records the run', async () => {
    setEngineLoader(fakeEngine());
    const model = await loadLocalModel(gguf());
    const seen = [];
    const out = await wllamaAdapter.streamChat({
      modelId: model.id,
      messages: [{ role: 'user', content: 'hi' }],
      options: { temperature: 0.2, maxTokens: 16 },
      onToken: (t) => seen.push(t),
    });
    expect(seen).toEqual(['Hel', 'lo']);
    expect(out.content).toBe('Hello');
    expect(out.usage.completion_tokens).toBeGreaterThan(0);
    expect(getLastRun().tokens).toBe(2);
  });

  it('maps an aborted request to the ABORTED code', async () => {
    setEngineLoader(fakeEngine());
    const model = await loadLocalModel(gguf());
    const controller = new AbortController();
    controller.abort();
    await expect(wllamaAdapter.streamChat({
      modelId: model.id,
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('refuses to chat when nothing is loaded', async () => {
    await expect(wllamaAdapter.streamChat({ messages: [] })).rejects.toMatchObject({ code: 'MODEL_MISSING' });
  });

  it('unloads the model', async () => {
    setEngineLoader(fakeEngine());
    await loadLocalModel(gguf());
    await unloadLocalModel();
    expect(getLoadedLocalModel()).toBeNull();
    expect(await wllamaAdapter.listModels()).toEqual([]);
  });
});

describe('local bridge', () => {
  beforeEach(() => __resetLocalEngineForTests());
  afterEach(() => __resetLocalEngineForTests());

  it('returns no local models until one is loaded', async () => {
    await expect(API.fetchModels('local')).resolves.toEqual([]);
  });

  it('returns the loaded model and applies the size filter', async () => {
    setEngineLoader(fakeEngine());
    await loadLocalModel(gguf());
    const all = await API.fetchModels('local', 'all');
    expect(all.map((m) => m.id)).toEqual(['local/tiny-1.5b-q4.gguf']);
    expect((await API.fetchModels('local', 'tiny')).length).toBe(1);
    expect((await API.fetchModels('local', 'large')).length).toBe(0);
  });

  it('reports local models as costing nothing', async () => {
    expect(API.estimateCost({ id: 'local/x.gguf', local: true })).toMatchObject({ available: false, label: 'Local · no cost' });
  });
});
