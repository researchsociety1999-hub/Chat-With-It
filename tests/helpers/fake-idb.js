/**
 * Minimal in-memory IndexedDB for tests (open, one object store with a keyPath, get / getAll / put /
 * delete, transaction complete). jsdom has no IndexedDB and the CI lockfile cannot take a new
 * dependency such as fake-indexeddb.
 */
export function createFakeIndexedDB() {
  const databases = new Map();

  function makeDb(record) {
    return {
      objectStoreNames: { contains: (name) => record.stores.has(name) },
      createObjectStore(name, { keyPath }) { record.stores.set(name, { keyPath, rows: new Map() }); },
      transaction(name) {
        const table = record.stores.get(name);
        let pending = 0;
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        const op = (apply) => {
          const req = { result: undefined, onsuccess: null, onerror: null };
          pending += 1;
          queueMicrotask(() => {
            req.result = apply();
            if (req.onsuccess) req.onsuccess({ target: req });
            pending -= 1;
            if (pending === 0) queueMicrotask(() => { if (pending === 0 && tx.oncomplete) tx.oncomplete(); });
          });
          return req;
        };
        tx.objectStore = () => ({
          get: (key) => op(() => (table.rows.has(key) ? structuredClone(table.rows.get(key)) : undefined)),
          getAll: () => op(() => [...table.rows.values()].map((row) => structuredClone(row))),
          put: (value) => op(() => { table.rows.set(value[table.keyPath], structuredClone(value)); return value[table.keyPath]; }),
          delete: (key) => op(() => { table.rows.delete(key); }),
        });
        return tx;
      },
    };
  }

  return {
    open(name, version) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        let record = databases.get(name);
        const created = !record;
        if (created) { record = { version, stores: new Map() }; databases.set(name, record); }
        req.result = makeDb(record);
        if ((created || version > record.version) && req.onupgradeneeded) req.onupgradeneeded({ target: req });
        record.version = Math.max(record.version, version);
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
  };
}
