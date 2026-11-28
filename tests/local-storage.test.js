import { describe, expect, it, vi } from 'vitest';
import { createModelStore, modelKey, CHANGE_EVENT, DB_NAME } from '../js/providers/local-storage-db.js';
import { deleteCachedModel, hfFileUrl, shardFiles } from '../js/providers/local-cache.js';
import { createFakeIndexedDB } from './helpers/fake-idb.js';

function makeStore(extra = {}) {
  let clock = 1000;
  const emit = vi.fn();
  const store = createModelStore({ indexedDB: createFakeIndexedDB(), emit, now: () => (clock += 10), ...extra });
  return { store, emit };
}

describe('model registry (IndexedDB)', () => {
  it('keys a model by repository plus file path', () => {
    expect(modelKey('org/repo', 'sub/model-q4.gguf')).toBe('org/repo/sub/model-q4.gguf');
    expect(DB_NAME).toBe('cwi-local-models');
  });

  it('registers a downloaded model and lists it', async () => {
    const { store, emit } = makeStore();
    const saved = await store.register({ repoId: 'org/repo', path: 'sub/model-Q4_K_M.gguf', sizeBytes: 1234 });
    expect(saved).toMatchObject({
      key: 'org/repo/sub/model-Q4_K_M.gguf',
      repoId: 'org/repo',
      path: 'sub/model-Q4_K_M.gguf',
      fileName: 'model-Q4_K_M.gguf',
      sizeBytes: 1234,
    });
    const rows = await store.list();
    expect(rows.map((r) => r.key)).toEqual(['org/repo/sub/model-Q4_K_M.gguf']);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('lists the newest download first', async () => {
    const { store } = makeStore();
    await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 1 });
    await store.register({ repoId: 'org/b', path: 'b.gguf', sizeBytes: 2 });
    expect((await store.list()).map((r) => r.fileName)).toEqual(['b.gguf', 'a.gguf']);
  });

  it('registering the same file again updates it without duplicating or changing savedAt', async () => {
    const { store } = makeStore();
    const first = await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 1 });
    const second = await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 99 });
    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].sizeBytes).toBe(99);
    expect(second.savedAt).toBe(first.savedAt);
    expect(rows[0].savedAt).toBe(first.savedAt);
  });

  it('gets one model by key and returns null for an unknown key', async () => {
    const { store } = makeStore();
    await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 1 });
    expect(await store.get('org/a/a.gguf')).toMatchObject({ fileName: 'a.gguf' });
    expect(await store.get('org/a/missing.gguf')).toBeNull();
  });

  it('removes a model and announces the change', async () => {
    const { store, emit } = makeStore();
    await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 1 });
    await store.register({ repoId: 'org/b', path: 'b.gguf', sizeBytes: 2 });
    emit.mockClear();
    await store.remove('org/a/a.gguf');
    expect((await store.list()).map((r) => r.key)).toEqual(['org/b/b.gguf']);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('touch updates lastUsedAt only', async () => {
    const { store } = makeStore();
    const saved = await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 1 });
    await store.touch(saved.key);
    const row = await store.get(saved.key);
    expect(row.lastUsedAt).toBeGreaterThan(saved.lastUsedAt);
    expect(row.savedAt).toBe(saved.savedAt);
  });

  it('rejects references that are not a public repo and a .gguf path', async () => {
    const { store, emit } = makeStore();
    await expect(store.register({ repoId: 'not-a-repo', path: 'a.gguf' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(store.register({ repoId: 'org/a', path: '../a.gguf' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(store.register({ repoId: 'org/a', path: '/a.gguf' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(store.register({ repoId: 'org/a', path: 'notes.txt' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('reports UNAVAILABLE when the browser has no IndexedDB', async () => {
    const { store } = makeStore({ indexedDB: undefined });
    await expect(store.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(store.register({ repoId: 'org/a', path: 'a.gguf' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('engine cache cleanup', () => {
  it('builds the Hugging Face file URL', () => {
    expect(hfFileUrl('org/repo', 'sub/model q4.gguf')).toBe('https://huggingface.co/org/repo/resolve/main/sub/model%20q4.gguf');
  });

  it('expands the first shard of a split model into every shard', () => {
    expect(shardFiles('m-Q4-00001-of-00003.gguf')).toEqual([
      'm-Q4-00001-of-00003.gguf',
      'm-Q4-00002-of-00003.gguf',
      'm-Q4-00003-of-00003.gguf',
    ]);
    expect(shardFiles('single.gguf')).toEqual(['single.gguf']);
  });

  function engineWithCache(entries) {
    const cache = {
      entries: [...entries],
      getNameFromURL: vi.fn(async (url) => `hash_${url.split('/').pop()}`),
      list: vi.fn(async () => cache.entries),
      delete: vi.fn(async (name) => { cache.entries = cache.entries.filter((e) => e.name !== name); }),
    };
    class FakeWllama { constructor() { this.cacheManager = cache; } }
    return { cache, loader: async () => ({ Wllama: FakeWllama, config: {} }) };
  }

  it('deletes the cache entries that belong to the model and leaves others', async () => {
    const { cache, loader } = engineWithCache([{ name: 'hash_a.gguf' }, { name: 'hash_other.gguf' }]);
    const result = await deleteCachedModel({ repo: 'org/repo', file: 'a.gguf' }, { loader });
    expect(result).toEqual({ supported: true, deleted: 1 });
    expect(cache.entries.map((e) => e.name)).toEqual(['hash_other.gguf']);
  });

  it('deletes every shard of a split model', async () => {
    const { cache, loader } = engineWithCache([
      { name: 'hash_m-00001-of-00002.gguf' },
      { name: 'hash_m-00002-of-00002.gguf' },
      { name: 'hash_keep.gguf' },
    ]);
    const result = await deleteCachedModel({ repo: 'org/repo', file: 'm-00001-of-00002.gguf' }, { loader });
    expect(result.deleted).toBe(2);
    expect(cache.entries.map((e) => e.name)).toEqual(['hash_keep.gguf']);
  });

  it('reports zero deleted when the entry is not in the cache', async () => {
    const { loader } = engineWithCache([{ name: 'hash_other.gguf' }]);
    expect(await deleteCachedModel({ repo: 'org/repo', file: 'a.gguf' }, { loader })).toEqual({ supported: true, deleted: 0 });
  });

  it('reports unsupported when the engine has no cache manager', async () => {
    class NoCache {}
    const result = await deleteCachedModel({ repo: 'org/repo', file: 'a.gguf' }, { loader: async () => ({ Wllama: NoCache, config: {} }) });
    expect(result).toEqual({ supported: false, deleted: 0 });
  });
});

describe('change event', () => {
  it('fires on document by default so the panel can refresh', async () => {
    const seen = vi.fn();
    document.addEventListener(CHANGE_EVENT, seen);
    const store = createModelStore({ indexedDB: createFakeIndexedDB() });
    await store.register({ repoId: 'org/a', path: 'a.gguf', sizeBytes: 1 });
    await store.remove('org/a/a.gguf');
    document.removeEventListener(CHANGE_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
