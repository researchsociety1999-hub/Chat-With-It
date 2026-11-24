/**
 * Hugging Face GGUF discovery. Pure module: no DOM, no AppState; fetch is injectable for tests.
 *
 * Only public, ungated repositories are returned, because those are the models anyone can download
 * without accepting a license or sending a token. Gated and private repositories are left out.
 */

export const HF_API = 'https://huggingface.co/api';
export const BIG_MODEL_BYTES = 4 * 1024 ** 3;

const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function getJson(url, { fetchImpl, signal }) {
  let res;
  try {
    res = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err && err.name === 'AbortError') throw coded('ABORTED', 'Cancelled.');
    throw coded('NETWORK', 'Could not reach Hugging Face from this browser (network problem or the request was blocked).');
  }
  if (res.status === 429) throw coded('RATE_LIMIT', 'Hugging Face is rate limiting requests. Wait a moment and try again.');
  if (!res.ok) throw coded(`HTTP_${res.status}`, `Hugging Face returned HTTP ${res.status}.`);
  return res;
}

/** Pull the cursor out of a Link header such as: <https://...?cursor=abc>; rel="next". */
export function parseNextCursor(linkHeader) {
  if (!linkHeader) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  if (!m) return null;
  try { return new URL(m[1]).searchParams.get('cursor'); } catch (_) { return null; }
}

/** Public = not private, not gated (gated may be false, 'auto' or 'manual'), not disabled. */
export function isPublicRepo(model) {
  return Boolean(model) && !model.private && !model.disabled && (model.gated === undefined || model.gated === false);
}

/**
 * Search public GGUF repositories, most downloaded first.
 * @returns {Promise<{ repos: Array<{id:string, downloads:number, likes:number}>, next: string|null }>}
 */
export async function searchGgufRepos(query, { limit = 20, cursor, fetchImpl = globalThis.fetch, signal } = {}) {
  const url = new URL(`${HF_API}/models`);
  url.searchParams.set('filter', 'gguf');
  const q = String(query || '').trim();
  if (q) url.searchParams.set('search', q);
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  for (const field of ['gated', 'downloads', 'likes', 'private']) url.searchParams.append('expand[]', field);

  const res = await getJson(url.toString(), { fetchImpl, signal });
  const body = await res.json();
  const repos = (Array.isArray(body) ? body : [])
    .filter(isPublicRepo)
    .map((m) => ({ id: String(m.id || m.modelId || ''), downloads: Number(m.downloads) || 0, likes: Number(m.likes) || 0 }))
    .filter((r) => REPO_RE.test(r.id));

  let next = null;
  try { next = parseNextCursor(res.headers && res.headers.get ? res.headers.get('Link') : null); } catch (_) { /* header not exposed */ }
  return { repos, next };
}

const SHARD_RE = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;
const QUANT_RE = /(?:^|[-_.])((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16|F32)(?=$|[-_.])/i;

/**
 * List the .gguf files of a public repository, smallest first. Split models (-00001-of-00003)
 * are collapsed into one entry that points at the first shard and carries the total size.
 * @returns {Promise<Array<{path:string, name:string, sizeBytes:number, shards:number, quant:string|null, projector:boolean}>>}
 */
export async function listRepoGgufFiles(repoId, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!REPO_RE.test(String(repoId || ''))) throw coded('INVALID_REQUEST', 'That Hugging Face repository name is not valid.');
  const url = `${HF_API}/models/${repoId}/tree/main?recursive=true&limit=1000`;
  const res = await getJson(url, { fetchImpl, signal });
  const entries = await res.json();

  const groups = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || e.type !== 'file' || !/\.gguf$/i.test(e.path || '')) continue;
    const size = Number(e.lfs && e.lfs.size != null ? e.lfs.size : e.size) || 0;
    const shard = SHARD_RE.exec(e.path);
    const key = shard ? `${shard[1]}|${shard[3]}` : e.path;
    const group = groups.get(key) || { path: e.path, sizeBytes: 0, shards: shard ? Number(shard[3]) : 1, seen: 0, hasFirst: !shard };
    group.sizeBytes += size;
    group.seen += 1;
    if (shard && Number(shard[2]) === 1) { group.path = e.path; group.hasFirst = true; }
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((g) => g.hasFirst && g.seen >= g.shards)
    .map((g) => {
      const base = g.path.split('/').pop();
      const stem = base.replace(/\.gguf$/i, '').replace(/-\d{5}-of-\d{5}$/i, '');
      const quant = QUANT_RE.exec(stem);
      return {
        path: g.path,
        name: base,
        sizeBytes: g.sizeBytes,
        shards: g.shards,
        quant: quant ? quant[1].toUpperCase() : null,
        projector: /mmproj/i.test(base),
      };
    })
    .sort((a, b) => a.sizeBytes - b.sizeBytes);
}

/** Informational only (never hides a model): 'ok' | 'tight' | 'large' | 'unknown'. */
export function fitLabel(sizeBytes, { deviceMemoryGb } = {}) {
  if (!sizeBytes) return 'unknown';
  if (sizeBytes > BIG_MODEL_BYTES) return 'large';
  if (deviceMemoryGb && sizeBytes * 1.25 > deviceMemoryGb * 1024 ** 3) return 'tight';
  return 'ok';
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
