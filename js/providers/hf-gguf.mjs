/**
 * Hugging Face GGUF discovery. Pure module: no DOM, no AppState; fetch is injectable for tests.
 *
 * Only public, ungated repositories are returned, because those are the models anyone can download
 * without accepting a license or sending a token. Gated and private repositories are left out.
 */

export const HF_API = 'https://huggingface.co/api';
export const BIG_MODEL_BYTES = 4 * 1024 ** 3;
/** Upper bound on tree pages followed for one repository (1000 entries per page). */
export const MAX_TREE_PAGES = 10;

const HF_ORIGIN = new URL(HF_API).origin;
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

function linkHeader(res) {
  try { return res.headers && res.headers.get ? res.headers.get('Link') : null; } catch (_) { return null; }
}

/** Pull the cursor out of a Link header such as: <https://...?cursor=abc>; rel="next". */
export function parseNextCursor(header) {
  if (!header) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(header);
  if (!m) return null;
  try { return new URL(m[1]).searchParams.get('cursor'); } catch (_) { return null; }
}

/**
 * Next-page URL from a Link header, or null. Only huggingface.co URLs are followed, so a header can
 * never send the browser to another host. Relative URLs are resolved against the API base.
 */
export function parseNextUrl(header) {
  if (!header) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(header);
  if (!m) return null;
  try {
    const url = new URL(m[1], `${HF_API}/`);
    return url.origin === HF_ORIGIN ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

/** Public = not private, not gated (gated may be false, 'auto' or 'manual'), not disabled. */
export function isPublicRepo(model) {
  return Boolean(model) && !model.private && !model.disabled && (model.gated === undefined || model.gated === false);
}

/** "7.6B params", "70B params", "360M params"; empty string when the count is unknown. */
export function formatParams(total) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return `${(n >= 1e10 ? Math.round(n / 1e9) : Math.round(n / 1e8) / 10)}B params`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}M params`;
  return '';
}

/**
 * Search public GGUF repositories, most downloaded first. Asks for the GGUF metadata block
 * (expand[]=gguf) so rows can show a parameter count; if the Hub rejects that field the search is
 * repeated without it, so a changed API never breaks the picker.
 * @returns {Promise<{ repos: Array<{id:string, downloads:number, likes:number, params:number}>, next: string|null }>}
 */
export async function searchGgufRepos(query, { limit = 20, cursor, fetchImpl = globalThis.fetch, signal } = {}) {
  const build = (withGguf) => {
    const url = new URL(`${HF_API}/models`);
    url.searchParams.set('filter', 'gguf');
    const q = String(query || '').trim();
    if (q) url.searchParams.set('search', q);
    url.searchParams.set('sort', 'downloads');
    url.searchParams.set('direction', '-1');
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);
    const fields = ['gated', 'downloads', 'likes', 'private'];
    if (withGguf) fields.push('gguf');
    for (const field of fields) url.searchParams.append('expand[]', field);
    return url.toString();
  };

  let res;
  try {
    res = await getJson(build(true), { fetchImpl, signal });
  } catch (err) {
    if (err.code !== 'HTTP_400' && err.code !== 'HTTP_422') throw err;
    res = await getJson(build(false), { fetchImpl, signal });
  }
  const body = await res.json();
  const repos = (Array.isArray(body) ? body : [])
    .filter(isPublicRepo)
    .map((m) => ({
      id: String(m.id || m.modelId || ''),
      downloads: Number(m.downloads) || 0,
      likes: Number(m.likes) || 0,
      params: Number(m.gguf && m.gguf.total) || 0,
    }))
    .filter((r) => REPO_RE.test(r.id));

  return { repos, next: parseNextCursor(linkHeader(res)) };
}

const SHARD_RE = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;
const QUANT_RE = /(?:^|[-_.])((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16|F32)(?=$|[-_.])/i;

/**
 * List the .gguf files of a public repository, smallest first. Split models (-00001-of-00003)
 * are collapsed into one entry that points at the first shard and carries the total size.
 * The tree is paginated (1000 entries per page); every page is read, up to MAX_TREE_PAGES, so shards
 * on a later page are not mistaken for an incomplete model.
 * @returns {Promise<Array<{path:string, name:string, sizeBytes:number, shards:number, quant:string|null, projector:boolean}>>}
 */
export async function listRepoGgufFiles(repoId, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!REPO_RE.test(String(repoId || ''))) throw coded('INVALID_REQUEST', 'That Hugging Face repository name is not valid.');

  const entries = [];
  const visited = new Set();
  let url = `${HF_API}/models/${repoId}/tree/main?recursive=true&limit=1000`;
  for (let page = 0; url && page < MAX_TREE_PAGES && !visited.has(url); page += 1) {
    visited.add(url);
    const res = await getJson(url, { fetchImpl, signal });
    const body = await res.json();
    if (Array.isArray(body)) entries.push(...body);
    url = parseNextUrl(linkHeader(res));
  }

  const groups = new Map();
  for (const e of entries) {
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

/**
 * The one byte formatter for the app. Binary units (1 GiB = 1024^3 bytes), labelled as such so
 * they are not mistaken for the decimal GB shown on huggingface.co.
 */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MiB`;
  return `${Math.max(1, Math.round(n / 1024))} KiB`;
}

/** True on touch-first devices, where focusing a text field raises the on-screen keyboard. */
export function isCoarsePointer(win = globalThis) {
  try { return Boolean(win && typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches); } catch (_) { return false; }
}

/** Closing the dialog aborts a running download, so ask first. */
export function shouldConfirmClose({ downloading } = {}) {
  return Boolean(downloading);
}
