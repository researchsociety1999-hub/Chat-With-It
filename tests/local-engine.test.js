import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCdnLoader, WLLAMA_BASE_URL, WLLAMA_VERSION } from '../js/providers/wllama-engine.js';
import {
  setEngineLoader,
  loadLocalModelFromHF,
  getLoadedLocalModel,
  __resetLocalEngineForTests,
} from '../js/providers/wllama.js';

describe('createCdnLoader', () => {
  it('imports the pinned engine build and points at its wasm file', async () => {
    const importer = vi.fn().mockResolvedValue({ Wllama: class {} });
    const lib = await createCdnLoader({ importer })();
    expect(importer).toHaveBeenCalledWith(`${WLLAMA_BASE_URL}/index.js`);
    expect(WLLAMA_BASE_URL).toContain(`@wllama/wllama@${WLLAMA_VERSION}/`);
    expect(lib.config).toEqual({ default: `${WLLAMA_BASE_URL}/wasm/wllama.wasm` });
    expect(typeof lib.Wllama).toBe('function');
  });

  it('fails clearly when the module does not export Wllama', async () => {
    const importer = vi.fn().mockResolvedValue({});
    await expect(createCdnLoader({ importer })()).rejects.toThrow(/could not be loaded/);
  });
});

function fakeHfEngine({ onLoad } = {}) {
  const calls = { exit: 0, spec: null, config: null };
  class FakeWllama {
    async loadModelFromHF(spec, config) {
      calls.spec = spec;
      calls.config = config;
      config.progressCallback({ loaded: 5, total: 10 });
      if (onLoad) onLoad();
    }
    async exit() { calls.exit += 1; }
    isMultithread() { return false; }
    getNumThreads() { return 1; }
    isSupportWebGPU() { return false; }
  }
  return { loader: async () => ({ Wllama: FakeWllama, config: { default: 'x.wasm' } }), calls };
}

describe('loadLocalModelFromHF', () => {
  beforeEach(() => __resetLocalEngineForTests());
  afterEach(() => __resetLocalEngineForTests());

  it('downloads through the engine, reports progress and registers the model', async () => {
    const { loader, calls } = fakeHfEngine();
    setEngineLoader(loader);
    const progress = [];
    const model = await loadLocalModelFromHF(
      { repo: 'org/repo', file: 'dir/m-q4.gguf', sizeBytes: 123 },
      { onProgress: (p) => progress.push(p) }
    );
    expect(calls.spec).toEqual({ repo: 'org/repo', file: 'dir/m-q4.gguf' });
    expect(calls.config.n_ctx).toBe(4096);
    expect(progress).toEqual([{ loaded: 5, total: 10 }]);
    expect(model).toMatchObject({
      id: 'local/hf/org/repo/dir/m-q4.gguf',
      name: 'm-q4',
      fileName: 'm-q4.gguf',
      sizeBytes: 123,
      source: { repo: 'org/repo', file: 'dir/m-q4.gguf' },
      local: true,
    });
    expect(getLoadedLocalModel()).toBe(model);
  });

  it('rejects malformed references without touching the engine', async () => {
    const { loader, calls } = fakeHfEngine();
    setEngineLoader(loader);
    await expect(loadLocalModelFromHF({ repo: 'bad', file: 'm.gguf' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(loadLocalModelFromHF({ repo: 'org/repo', file: 'notes.txt' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(loadLocalModelFromHF({ repo: 'org/repo', file: '../m.gguf' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(calls.spec).toBeNull();
  });

  it('reports a missing engine', async () => {
    await expect(loadLocalModelFromHF({ repo: 'org/repo', file: 'm.gguf' })).rejects.toMatchObject({ code: 'ENGINE_MISSING' });
  });

  it('cancels: an aborted download ends as ABORTED and leaves nothing loaded', async () => {
    const controller = new AbortController();
    const { loader, calls } = fakeHfEngine({ onLoad: () => controller.abort() });
    setEngineLoader(loader);
    await expect(loadLocalModelFromHF({ repo: 'org/repo', file: 'm.gguf' }, { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(getLoadedLocalModel()).toBeNull();
    expect(calls.exit).toBeGreaterThan(0);
  });
});
