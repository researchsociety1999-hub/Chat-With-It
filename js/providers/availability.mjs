/**
 * OpenRouter model availability gate.
 *
 * Pure module: no DOM, no AppState, no storage. The caller owns UI and persistence.
 * Design rules for a static, offline-capable PWA:
 *  - The live catalog (GET /models, public) is the source of truth when we have it.
 *  - Offline or catalog failure never bricks chat: known curated models stay allowed,
 *    and the real provider error is classified and handled at dispatch time.
 *  - An empty live catalog is treated as a failure, never as "nothing is free".
 *  - Failed models are remembered for a while (negative cache) so we do not retry them.
 *  - Fallback only ever picks another FREE model, only before any output has streamed,
 *    and always reports the switch so the UI can tell the user.
 */

export const BASE = 'https://openrouter.ai/api/v1';

/** Known-dead IDs mapped to a suggested replacement (or null). Extend as models retire. */
export const DEPRECATED_IDS = {};

export const ErrorKind = Object.freeze({
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  UPSTREAM_RATE_LIMIT: 'UPSTREAM_RATE_LIMIT',
  NO_ENDPOINTS: 'NO_ENDPOINTS',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  NOT_FREE: 'NOT_FREE',
  MODEL_MISSING: 'MODEL_MISSING',
  SERVER: 'SERVER',
  NETWORK: 'NETWORK',
  ABORTED: 'ABORTED',
});

const FALLBACK_ELIGIBLE = new Set([
  ErrorKind.NO_ENDPOINTS,
  ErrorKind.NOT_FREE,
  ErrorKind.MODEL_MISSING,
  ErrorKind.UPSTREAM_RATE_LIMIT,
]);

export function isFallbackEligible(kind) {
  return FALLBACK_ELIGIBLE.has(kind);
}

/** Map error codes used elsewhere in the app onto ErrorKind. */
export function kindFromCode(code) {
  switch (code) {
    case 'AUTH': return ErrorKind.AUTH;
    case 'RATE_LIMIT': return ErrorKind.RATE_LIMIT;
    case 'UPSTREAM_RATE_LIMIT': return ErrorKind.UPSTREAM_RATE_LIMIT;
    case 'MODEL_NOT_FREE': return ErrorKind.NOT_FREE;
    case 'MODEL_MISSING': return ErrorKind.MODEL_MISSING;
    case 'MODEL_UNAVAILABLE': return ErrorKind.POLICY_BLOCKED;
    case 'ABORTED': return ErrorKind.ABORTED;
    default: return code && ErrorKind[code] ? ErrorKind[code] : null;
  }
}

/** Classify a failed HTTP response from /chat/completions (or /models). */
export function classifyDispatchError(status, rawText = '') {
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (_) { /* not JSON */ }
  const message = String(parsed?.error?.message || parsed?.message || rawText || `HTTP ${status}`);
  const m = message.toLowerCase();

  let kind;
  if (status === 401 || m.includes('invalid api key') || m.includes('unauthorized')) {
    kind = ErrorKind.AUTH;
  } else if (status === 429) {
    const upstream = ['upstream', 'provider', 'overloaded', 'try another'].some((w) => m.includes(w));
    kind = upstream ? ErrorKind.UPSTREAM_RATE_LIMIT : ErrorKind.RATE_LIMIT;
  } else if (m.includes('data policy') || m.includes('guardrail') || m.includes('settings/privacy')) {
    // Checked before NO_ENDPOINTS: the policy 404 also says "No endpoints available".
    kind = ErrorKind.POLICY_BLOCKED;
  } else if (m.includes('no endpoints') || m.includes('no available provider') || m.includes('no allowed providers')) {
    kind = ErrorKind.NO_ENDPOINTS;
  } else if (status === 402 || m.includes('unavailable for free') || m.includes('paid version')) {
    kind = ErrorKind.NOT_FREE;
  } else if (status === 404 || (m.includes('model') && m.includes('not found'))) {
    kind = ErrorKind.MODEL_MISSING;
  } else {
    kind = ErrorKind.SERVER;
  }
  return { kind, status, message };
}

const toNumber = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Free = `:free` suffix, or BOTH prices present and exactly zero. Missing prices are not free. */
export function isFreeModel(model) {
  if (!model?.id) return false;
  if (String(model.id).endsWith(':free')) return true;
  const prompt = toNumber(model.pricing?.prompt);
  const completion = toNumber(model.pricing?.completion);
  return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
}

export function isEmbeddingModel(model) {
  const modality = String(model?.architecture?.modality || '').toLowerCase();
  const id = String(model?.id || '').toLowerCase();
  return model?.type === 'embedding' || modality.includes('embedding') || id.includes('embed');
}

/** Deprecated = in the local map, or the catalog reports an expiration date that has passed. */
export function isDeprecatedModel(model, nowMs = Date.now()) {
  if (!model?.id) return false;
  if (Object.prototype.hasOwnProperty.call(DEPRECATED_IDS, model.id)) return true;
  const exp = model.expiration_date ? Date.parse(model.expiration_date) : NaN;
  return Number.isFinite(exp) && exp <= nowMs;
}

/** Turn the raw /models array into lookup structures. */
export function buildIndex(rawModels, nowMs = Date.now()) {
  const free = new Map();
  const deprecated = new Map();
  for (const model of Array.isArray(rawModels) ? rawModels : []) {
    if (!model?.id) continue;
    if (isDeprecatedModel(model, nowMs)) {
      deprecated.set(model.id, DEPRECATED_IDS[model.id] ?? null);
      continue;
    }
    if (isFreeModel(model) && !isEmbeddingModel(model)) free.set(model.id, model);
  }
  for (const [id, replacement] of Object.entries(DEPRECATED_IDS)) {
    if (!deprecated.has(id)) deprecated.set(id, replacement);
    free.delete(id);
  }
  return { free, deprecated, total: Array.isArray(rawModels) ? rawModels.length : 0 };
}

function fetchError(kind, message, extra = {}) {
  const err = new Error(message);
  err.kind = kind;
  Object.assign(err, extra);
  return err;
}

/** GET /models (public endpoint, no key needed). Throws an error with `.kind`. */
export async function fetchCatalog({
  fetchImpl = globalThis.fetch,
  baseUrl = BASE,
  timeoutMs = 12000,
  signal,
} = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetchImpl(`${baseUrl}/models`, { signal: ctrl.signal });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      const c = classifyDispatchError(res.status, raw);
      throw fetchError(c.kind, c.message, { status: res.status });
    }
    const body = await res.json();
    if (!Array.isArray(body?.data)) throw fetchError(ErrorKind.SERVER, 'Malformed /models response');
    return body.data;
  } catch (err) {
    if (err.kind) throw err;
    if (err.name === 'AbortError') throw fetchError(ErrorKind.ABORTED, 'Catalog request timed out or was cancelled');
    throw fetchError(ErrorKind.NETWORK, err.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export class GateError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'GateError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/**
 * @param {object} [opts]
 * @param {Array<{id:string}>} [opts.curated] built-in list, used offline and for fallback ordering
 * @param {number} [opts.ttlMs] how long a live catalog is considered fresh
 */
export function createAvailabilityGate({
  curated = [],
  fetchImpl,
  baseUrl = BASE,
  timeoutMs = 12000,
  ttlMs = 10 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const curatedIds = curated.filter((m) => m && m.type !== 'embedding').map((m) => m.id);
  let index = null;
  let fetchedAt = 0;
  let inflight = null;
  const blocked = new Map();

  const isBlocked = (id) => {
    const until = blocked.get(id);
    if (until === undefined) return false;
    if (until <= now()) { blocked.delete(id); return false; }
    return true;
  };

  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const raw = await fetchCatalog({ fetchImpl, baseUrl, timeoutMs });
        const next = buildIndex(raw, now());
        if (next.free.size === 0) {
          return { ok: false, error: fetchError(ErrorKind.SERVER, 'Live catalog contained no free models; ignoring it') };
        }
        index = next;
        fetchedAt = now();
        return { ok: true, free: next.free.size };
      } catch (error) {
        return { ok: false, error };
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /** Block on the first load; afterwards refresh in the background (stale-while-revalidate). */
  async function ensureFresh() {
    if (!index) return refresh();
    if (now() - fetchedAt > ttlMs) { refresh(); }
    return { ok: true, stale: now() - fetchedAt > ttlMs };
  }

  function pickFallback(excludeId, { exclude = [] } = {}) {
    const skip = new Set([excludeId, ...exclude]);
    const usable = (id) => !skip.has(id) && !isBlocked(id);
    if (index) {
      const live = curatedIds.filter((id) => index.free.has(id) && usable(id));
      if (live.length) return live[0];
      const rest = [...index.free.values()]
        .filter((m) => usable(m.id))
        .sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
      return rest.length ? rest[0].id : null;
    }
    return curatedIds.find(usable) || null;
  }

  /** Synchronous verdict from what we currently know. */
  function check(modelId) {
    if (!modelId) return { ok: false, reason: 'NO_MODEL', source: index ? 'live' : 'curated' };
    if (isBlocked(modelId)) {
      return { ok: false, reason: 'RECENTLY_FAILED', replacement: pickFallback(modelId), source: index ? 'live' : 'curated' };
    }
    if (index) {
      if (index.deprecated.has(modelId)) {
        return { ok: false, reason: 'DEPRECATED', replacement: index.deprecated.get(modelId) || pickFallback(modelId), source: 'live' };
      }
      if (index.free.has(modelId)) return { ok: true, source: 'live' };
      return { ok: false, reason: 'NOT_IN_FREE_LIST', replacement: pickFallback(modelId), source: 'live' };
    }
    if (curatedIds.includes(modelId)) return { ok: true, source: 'curated', unverified: true };
    return { ok: false, reason: 'UNVERIFIED', source: 'curated' };
  }

  function markUnavailable(modelId, ms = 15 * 60 * 1000) {
    blocked.set(modelId, now() + ms);
  }

  return {
    refresh,
    ensureFresh,
    check,
    pickFallback,
    markUnavailable,
    get hasLiveCatalog() { return Boolean(index); },
    get lastRefreshed() { return fetchedAt; },
    listFree() { return index ? [...index.free.values()] : []; },
  };
}

/**
 * Gate + dispatch. `send(modelId, ctx)` performs the real request and must call
 * `ctx.markOutput()` when the first token arrives. It should throw errors that carry
 * `.kind` (ErrorKind), `.code` (app error code) or `.status` + `.raw`.
 */
export async function dispatchWithGate({
  gate,
  modelId,
  send,
  autoFallback = false, // ask-first: switching models silently is an owner decision
  maxFallbacks = 2,
  onFallback,
  awaitFresh = false,   // never delay a send on a catalog fetch
  // strictPreflight=false: only DEPRECATED / NO_MODEL block before sending (an explicit user Retry is never refused).
  // An unverified or unlisted model is sent and the server decides, because the caller's own
  // model list is the authority for "free and listed".
  strictPreflight = true,
}) {
  let current = modelId;
  const tried = [];
  let fallbacks = 0;

  try {
    if (awaitFresh) await gate.ensureFresh();
    else gate.ensureFresh().catch(() => {});
  } catch (_) { /* gate must never throw here */ }

  for (;;) {
    const verdict = gate.check(current);
    const HARD = ['DEPRECATED', 'NO_MODEL'];
    if (!verdict.ok && (strictPreflight || HARD.includes(verdict.reason))) {
      const next = autoFallback && verdict.replacement && fallbacks < maxFallbacks ? verdict.replacement : null;
      if (!next) {
        throw new GateError(
          verdict.reason === 'DEPRECATED' ? ErrorKind.MODEL_MISSING : ErrorKind.NOT_FREE,
          `Model "${current}" is not available (${verdict.reason}).`,
          { reason: verdict.reason, replacement: verdict.replacement || null, tried },
        );
      }
      onFallback?.({ from: current, to: next, reason: verdict.reason });
      tried.push(current);
      current = next;
      fallbacks += 1;
      continue;
    }

    let produced = false;
    try {
      const result = await send(current, { markOutput: () => { produced = true; } });
      return { modelId: current, result, fellBackFrom: tried };
    } catch (err) {
      const kind = err.kind
        || kindFromCode(err.code)
        || (err.status ? classifyDispatchError(err.status, err.raw || err.message).kind : null);
      if (kind === ErrorKind.ABORTED) throw err;
      if (kind === ErrorKind.NO_ENDPOINTS || kind === ErrorKind.NOT_FREE || kind === ErrorKind.MODEL_MISSING) {
        gate.markUnavailable(current);
      }
      const next = autoFallback && !produced && isFallbackEligible(kind) && fallbacks < maxFallbacks
        ? gate.pickFallback(current, { exclude: tried })
        : null;
      if (!next) {
        err.kind = kind || err.kind;
        err.replacement = gate.pickFallback(current, { exclude: tried });
        err.tried = [...tried, current];
        throw err;
      }
      onFallback?.({ from: current, to: next, reason: kind });
      tried.push(current);
      current = next;
      fallbacks += 1;
    }
  }
}
