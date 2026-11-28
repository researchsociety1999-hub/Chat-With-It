import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderModelList, initLocalModels, isActiveRecord, isSessionModel } from '../js/local-models-ui.js';
import { createModelStore } from '../js/providers/local-storage-db.js';
import {
  setEngineLoader,
  loadLocalModelFromHF,
  loadLocalModel,
  getLoadedLocalModel,
  onLocalChange,
  __resetLocalEngineForTests,
} from '../js/providers/wllama.js';
import { createFakeIndexedDB } from './helpers/fake-idb.js';

const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

const record = (over = {}) => ({
  key: 'org/repo/a-Q4.gguf', repoId: 'org/repo', path: 'a-Q4.gguf', fileName: 'a-Q4.gguf',
  sizeBytes: 5 * 1024 ** 2, savedAt: 1700000000000, lastUsedAt: 1700000000000, ...over,
});
const noop = () => {};
const actions = (over = {}) => ({ load: noop, unload: noop, remove: noop, ...over });
const labels = (item) => [...item.querySelectorAll('button')].map((b) => b.textContent);

function fakeEngine() {
  const cache = {
    entries: [{ name: 'hash_a-Q4.gguf' }],
    getNameFromURL: async (url) => `hash_${url.split('/').pop()}`,
    list: async () => cache.entries,
    delete: async (name) => { cache.entries = cache.entries.filter((e) => e.name !== name); },
  };
  class FakeWllama {
    constructor() { this.cacheManager = cache; }
    async loadModel() {}
    async loadModelFromHF(ref, params) { if (params && params.progressCallback) params.progressCallback({ loaded: 5, total: 10 }); }
    async exit() {}
    isMultithread() { return false; }
    getNumThreads() { return 1; }
    isSupportWebGPU() { return false; }
  }
  const loader = async () => ({ Wllama: FakeWllama, config: {} });
  return { cache, loader };
}

describe('renderModelList', () => {
  it('shows Load and Delete for a saved model and marks the active one with Unload', () => {
    const list = document.createElement('ul');
    const active = { local: true, name: 'a-Q4', fileName: 'a-Q4.gguf', source: { repo: 'org/repo', file: 'a-Q4.gguf' } };
    renderModelList(list, { records: [record(), record({ key: 'org/repo/b.gguf', path: 'b.gguf', fileName: 'b.gguf' })], active, busy: false }, actions());
    const items = [...list.querySelectorAll('li')];
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('active')).toBe(true);
    expect(items[0].textContent).toContain('Active');
    expect(labels(items[0])).toEqual(['Unload', 'Delete']);
    expect(labels(items[1])).toEqual(['Load', 'Delete']);
    expect(items[1].textContent).toContain('org/repo');
    expect(items[1].textContent).toContain('5 MiB');
  });

  it('shows a session-only model with Unload only', () => {
    const list = document.createElement('ul');
    const active = { local: true, name: 'picked', fileName: 'picked.gguf', sizeBytes: 2048 };
    expect(isSessionModel(active, [])).toBe(true);
    renderModelList(list, { records: [], active, busy: false }, actions());
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(list.textContent).toContain('not saved');
    expect(labels(list.querySelector('li'))).toEqual(['Unload']);
  });

  it('disables the buttons while a model is loading and wires clicks to the actions', () => {
    const list = document.createElement('ul');
    const load = vi.fn();
    const remove = vi.fn();
    renderModelList(list, { records: [record()], active: null, busy: true }, actions({ load, remove }));
    expect([...list.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);

    renderModelList(list, { records: [record()], active: null, busy: false }, actions({ load, remove }));
    const [loadBtn, deleteBtn] = list.querySelectorAll('button');
    loadBtn.click();
    deleteBtn.click();
    expect(load).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('matches an active model to its saved row by repository and file', () => {
    const model = { source: { repo: 'org/repo', file: 'a-Q4.gguf' } };
    expect(isActiveRecord(record(), model)).toBe(true);
    expect(isActiveRecord(record({ path: 'other.gguf' }), model)).toBe(false);
    expect(isActiveRecord(record(), null)).toBe(false);
  });
});

describe('downloaded models panel', () => {
  beforeEach(() => {
    __resetLocalEngineForTests();
    document.body.innerHTML = '<div id="localPanel"><button id="localUnloadBtn"></button><div id="localStatus"></div></div>';
  });
  afterEach(() => __resetLocalEngineForTests());

  function setup(extra = {}) {
    const engine = fakeEngine();
    setEngineLoader(engine.loader);
    const store = createModelStore({ indexedDB: createFakeIndexedDB() });
    const toast = vi.fn();
    const confirm = (message, onYes) => onYes();
    const ui = initLocalModels({ store, confirm, toast, cacheLoader: engine.loader, ...extra });
    return { engine, store, toast, ui };
  }

  it('inserts itself after the unload button and starts empty', async () => {
    const { ui } = setup();
    await flush();
    expect(document.getElementById('localUnloadBtn').nextElementSibling).toBe(ui.panel);
    expect(ui.panel.querySelectorAll('li')).toHaveLength(0);
    expect(ui.panel.querySelector('.lm-empty').classList.contains('hidden')).toBe(false);
  });

  it('does not build a second panel', () => {
    setup();
    expect(initLocalModels({ store: createModelStore({ indexedDB: createFakeIndexedDB() }) })).toBeNull();
  });

  it('lists a model as soon as it is registered, and drops it when it is removed', async () => {
    const { store, ui } = setup();
    await flush();
    await store.register({ repoId: 'org/repo', path: 'a-Q4.gguf', sizeBytes: 100 });
    await flush();
    expect(ui.panel.querySelectorAll('li')).toHaveLength(1);
    expect(ui.panel.querySelector('.lm-empty').classList.contains('hidden')).toBe(true);
    await store.remove('org/repo/a-Q4.gguf');
    await flush();
    expect(ui.panel.querySelectorAll('li')).toHaveLength(0);
  });

  it('Load activates a saved model in the engine', async () => {
    const { store, ui } = setup();
    await store.register({ repoId: 'org/repo', path: 'a-Q4.gguf', sizeBytes: 100 });
    await flush();
    [...ui.panel.querySelectorAll('button')].find((b) => b.textContent === 'Load').click();
    await flush();
    expect(getLoadedLocalModel()).toMatchObject({ source: { repo: 'org/repo', file: 'a-Q4.gguf' } });
    expect(ui.panel.querySelector('li').classList.contains('active')).toBe(true);
    expect(labels(ui.panel.querySelector('li'))).toEqual(['Unload', 'Delete']);
  });

  it('Unload keeps the saved row but empties the engine', async () => {
    const { store, ui } = setup();
    await store.register({ repoId: 'org/repo', path: 'a-Q4.gguf', sizeBytes: 100 });
    await loadLocalModelFromHF({ repo: 'org/repo', file: 'a-Q4.gguf', sizeBytes: 100 });
    await flush();
    [...ui.panel.querySelectorAll('button')].find((b) => b.textContent === 'Unload').click();
    await flush();
    expect(getLoadedLocalModel()).toBeNull();
    expect(ui.panel.querySelectorAll('li')).toHaveLength(1);
    expect(labels(ui.panel.querySelector('li'))).toEqual(['Load', 'Delete']);
  });

  it('Delete on the active model unloads it (so the model dropdown refreshes), clears the cache and removes the row', async () => {
    const { store, engine, toast, ui } = setup();
    await store.register({ repoId: 'org/repo', path: 'a-Q4.gguf', sizeBytes: 100 });
    await loadLocalModelFromHF({ repo: 'org/repo', file: 'a-Q4.gguf', sizeBytes: 100 });
    const kinds = [];
    onLocalChange((evt) => kinds.push(evt.kind));
    await flush();
    [...ui.panel.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click();
    await flush();
    expect(kinds).toContain('unloaded');
    expect(getLoadedLocalModel()).toBeNull();
    expect(await store.list()).toHaveLength(0);
    expect(engine.cache.entries).toHaveLength(0);
    expect(ui.panel.querySelectorAll('li')).toHaveLength(0);
    expect(toast).toHaveBeenCalled();
  });

  it('still removes the row and says so when the engine cache has no matching file', async () => {
    const { store, engine, toast, ui } = setup();
    engine.cache.entries = [];
    await store.register({ repoId: 'org/repo', path: 'a-Q4.gguf', sizeBytes: 100 });
    await flush();
    [...ui.panel.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click();
    await flush();
    expect(await store.list()).toHaveLength(0);
    expect(String(toast.mock.calls[0][0])).toContain('could not be found');
  });

  it('shows a file picked from disk as a session-only model', async () => {
    const { ui } = setup();
    await loadLocalModel(new File(['GGUF'], 'picked.gguf'));
    await flush();
    expect(ui.panel.querySelectorAll('li')).toHaveLength(1);
    expect(ui.panel.textContent).toContain('not saved');
  });
});
