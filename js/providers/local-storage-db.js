/**
 * Registry of GGUF models downloaded from Hugging Face, kept in IndexedDB.
 *
 * Only metadata lives here (repository, file, size, dates). The model bytes themselves stay in the
 * wllama engine's own browser cache, so a model is never stored twice. Deleting a model therefore
 * means removing its row here and its file from the engine cache (see local-cache.js).
 *
 * Pure module: indexedDB and the change notification are injectable for tests.
 */

export const DB_NAME = 'cwi-local-models';
export const DB_VERSION = 1;
export const STORE = 'models';
/** Fired on document whenever a row is added, changed or removed. */
export const CHANGE_EVENT = 'cwi:local-models-changed';

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Stable identity of a downloaded model: repository plus the file path inside it. */
export function modelKey(repoId, path) {
  return `${repoId}/${path}`;
}

const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

function buildRecord({ repoId, path, sizeBytes = 0 }, now) {
  const okPath = typeof path === 'string' && /\.gguf$/i.test(path) && !path.includes('..') && !path.startsWith('/');
  if (!REPO_RE.test(String(repoId || '')) || !okPath) {
    throw coded('INVALID_REQUEST', 'That model reference is not valid.');
  }
  return {
    key: modelKey(repoId, path),
    repoId,
    path,
    fileName: path.split('/').pop(),
    sizeBytes: Number(sizeBytes) || 0,
    savedAt: now,
    lastUsedAt: now,
  };
}

function defaultEmit() {
  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function createModelStore({ indexedDB = globalThis.indexedDB, emit = defaultEmit, now = () => Date.now() } = {}) {
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!indexedDB || typeof indexedDB.open !== 'function') {
        reject(coded('UNAVAILABLE', 'This browser cannot keep a list of downloaded models.'));
        return;
      }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (err) { reject(coded('UNAVAILABLE', err.message)); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(coded('UNAVAILABLE', (req.error && req.error.message) || 'Could not open the model list.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  /** Run fn(objectStore) in one transaction and resolve with whatever fn's returned request yields. */
  function run(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      const req = fn(tx.objectStore(STORE), (value) => { result = value; });
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Model list transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('Model list transaction aborted.'));
    }));
  }

  return {
    /** Add or refresh a downloaded model. Keeps the original savedAt when it already exists. */
    async register(input) {
      const fresh = buildRecord(input, now());
      const saved = await run('readwrite', (store, setResult) => {
        const read = store.get(fresh.key);
        read.onsuccess = () => {
          const prev = read.result;
          const next = prev ? { ...fresh, savedAt: prev.savedAt } : fresh;
          setResult(next);
          store.put(next);
        };
        return null;
      });
      emit();
      return saved;
    },

    /** Newest first. */
    async list() {
      const rows = await run('readonly', (store) => store.getAll());
      return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => b.savedAt - a.savedAt);
    },

    async get(key) {
      return (await run('readonly', (store) => store.get(key))) || null;
    },

    async touch(key) {
      await run('readwrite', (store) => {
        const read = store.get(key);
        read.onsuccess = () => { if (read.result) store.put({ ...read.result, lastUsedAt: now() }); };
        return null;
      });
      emit();
    },

    async remove(key) {
      await run('readwrite', (store) => store.delete(key));
      emit();
    },
  };
}

let shared = null;
/** The app-wide store (created on first use). */
export function getModelStore() {
  if (!shared) shared = createModelStore();
  return shared;
}
