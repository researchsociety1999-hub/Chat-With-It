/**
 * Removing a downloaded model's bytes from the wllama engine cache.
 *
 * wllama stores files it downloads (loadModelFromHF) in its own browser cache and exposes a cache
 * manager with list() and delete(). This module works out which cache entries belong to a model and
 * deletes them. Everything is feature-detected: if the loaded engine has no cache manager, or the
 * entry cannot be found, the result says so and nothing throws.
 */

const SHARD_RE = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;

/** The URL wllama downloads a Hugging Face file from. */
export function hfFileUrl(repo, file) {
  return `https://huggingface.co/${repo}/resolve/main/${String(file).split('/').map(encodeURIComponent).join('/')}`;
}

/** All files of a model: the file itself, or every shard when the path is the first of a split model. */
export function shardFiles(file) {
  const m = SHARD_RE.exec(String(file));
  if (!m) return [file];
  const total = Number(m[3]);
  const out = [];
  for (let i = 1; i <= total; i += 1) out.push(`${m[1]}-${String(i).padStart(5, '0')}-of-${m[3]}.gguf`);
  return out;
}

/**
 * @param {{repo: string, file: string}} model
 * @param {{ loader: () => Promise<{ Wllama: Function, config: object }> }} deps
 * @returns {Promise<{ supported: boolean, deleted: number }>}
 */
export async function deleteCachedModel({ repo, file }, { loader }) {
  const lib = await loader();
  const engine = new lib.Wllama(lib.config);
  const cache = engine && engine.cacheManager;
  if (!cache || typeof cache.list !== 'function' || typeof cache.delete !== 'function' || typeof cache.getNameFromURL !== 'function') {
    return { supported: false, deleted: 0 };
  }
  const wanted = new Set();
  for (const f of shardFiles(file)) wanted.add(await cache.getNameFromURL(hfFileUrl(repo, f)));
  const entries = await cache.list();
  let deleted = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry && wanted.has(entry.name)) {
      await cache.delete(entry.name);
      deleted += 1;
    }
  }
  return { supported: true, deleted };
}
