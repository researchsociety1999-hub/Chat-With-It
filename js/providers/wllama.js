/**
 * Local (on-device) provider backed by wllama (llama.cpp compiled to WebAssembly).
 *
 * Pure module: no DOM, no AppState, no storage. A model file is read in this browser and is never
 * uploaded. The wllama library itself is supplied through setEngineLoader(), so this file builds
 * and tests without the dependency (see wllama-engine.js for the real loader).
 *
 * Loader contract: async () => ({ Wllama, config }) where config is the Wllama asset-path config.
 */

import { inferParamTier } from './model-list.mjs';

export const LOCAL_PROVIDER_ID = 'local';
export const DEFAULT_N_CTX = 4096;

const HF_REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

const state = {
  loader: null,
  lib: null,
  wllama: null,
  model: null,
  lastRun: null,
  loading: false,
  listeners: new Set(),
};

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function emit(kind, detail = {}) {
  for (const fn of state.listeners) {
    try { fn({ kind, model: state.model, lastRun: state.lastRun, ...detail }); } catch (_) { /* listener errors never break the engine */ }
  }
}

export function setEngineLoader(loader) {
  state.loader = typeof loader === 'function' ? loader : null;
  state.lib = null;
}

export function isEngineConfigured() { return Boolean(state.loader); }
export function isLoadingLocalModel() { return state.loading; }
export function getLoadedLocalModel() { return state.model; }
export function getLastRun() { return state.lastRun; }

/** Subscribe to loading / loaded / unloaded / generating / run / error events. Returns an unsubscribe function. */
export function onLocalChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function isGgufFile(file) {
  return Boolean(file) && /\.gguf$/i.test(String(file.name || '')) && file.size > 0;
}

function describeModel({ id, fileName, sizeBytes, source }, nCtx) {
  const base = String(fileName).split('/').pop();
  return {
    id,
    provider: LOCAL_PROVIDER_ID,
    name: base.replace(/\.gguf$/i, ''),
    ctx: nCtx,
    paramTier: inferParamTier(base),
    uncensored: false,
    type: 'chat',
    live: true,
    curated: false,
    local: true,
    fileName: base,
    sizeBytes: sizeBytes || 0,
    ...(source ? { source } : {}),
  };
}

export function describeLocalModel(file, nCtx = DEFAULT_N_CTX) {
  return describeModel({ id: `local/${file.name}`, fileName: file.name, sizeBytes: file.size }, nCtx);
}

export async function unloadLocalModel({ silent = false } = {}) {
  const w = state.wllama;
  state.wllama = null;
  state.model = null;
  state.lastRun = null;
  if (w) {
    try { await w.exit(); } catch (_) { /* already gone */ }
  }
  if (!silent) emit('unloaded');
}

/** Shared load path for a picked file and for a Hugging Face download. */
async function loadWith(meta, nCtx, doLoad, signal) {
  if (!state.loader) throw coded('ENGINE_MISSING', 'The local engine is not part of this build yet.');
  if (state.loading) throw coded('BUSY', 'A model is already loading.');

  state.loading = true;
  emit('loading', { file: { name: String(meta.fileName).split('/').pop(), size: meta.sizeBytes || 0 } });
  const started = performance.now();
  let w = null;
  const onAbort = () => {
    if (!w) return;
    try { Promise.resolve(w.exit()).catch(() => {}); } catch (_) { /* ignore */ }
  };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    await unloadLocalModel({ silent: true });
    if (!state.lib) state.lib = await state.loader();
    if (signal && signal.aborted) throw coded('ABORTED', 'Cancelled.');
    w = new state.lib.Wllama(state.lib.config);
    await doLoad(w);
    if (signal && signal.aborted) throw coded('ABORTED', 'Cancelled.');

    const model = { ...describeModel(meta, nCtx), loadMs: Math.round(performance.now() - started) };
    try {
      model.runtime = { threads: w.getNumThreads(), multithread: w.isMultithread(), webgpu: w.isSupportWebGPU() };
    } catch (_) { /* runtime details are optional */ }
    state.wllama = w;
    state.model = model;
    state.lastRun = null;
    emit('loaded');
    return model;
  } catch (err) {
    if (w) { try { await w.exit(); } catch (_) { /* ignore */ } }
    state.wllama = null;
    state.model = null;
    const out = signal && signal.aborted && !(err && err.code === 'ABORTED') ? coded('ABORTED', 'Cancelled.') : err;
    emit('error', { error: out });
    throw out;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    state.loading = false;
  }
}

/**
 * Load a .gguf File chosen by the user.
 * Throws errors carrying .code: INVALID_REQUEST, ENGINE_MISSING, BUSY, or the engine's own error.
 */
export async function loadLocalModel(file, { nCtx = DEFAULT_N_CTX } = {}) {
  if (!isGgufFile(file)) throw coded('INVALID_REQUEST', 'Choose a non-empty .gguf model file.');
  return loadWith(
    { id: `local/${file.name}`, fileName: file.name, sizeBytes: file.size },
    nCtx,
    (w) => w.loadModel([file], { n_ctx: nCtx })
  );
}

/**
 * Download a .gguf from a public Hugging Face repository and load it. The engine does the download
 * (and its own caching); onProgress receives { loaded, total } in bytes.
 * Throws: INVALID_REQUEST, ENGINE_MISSING, BUSY, ABORTED (cancelled), or the engine's own error.
 */
export async function loadLocalModelFromHF({ repo, file, sizeBytes = 0 }, { nCtx = DEFAULT_N_CTX, onProgress, signal } = {}) {
  const okFile = typeof file === 'string' && /\.gguf$/i.test(file) && !file.includes('..') && !file.startsWith('/');
  if (!HF_REPO_RE.test(String(repo || '')) || !okFile) {
    throw coded('INVALID_REQUEST', 'That Hugging Face model reference is not valid.');
  }
  return loadWith(
    { id: `local/hf/${repo}/${file}`, fileName: file, sizeBytes, source: { repo, file } },
    nCtx,
    (w) => w.loadModelFromHF({ repo, file }, {
      n_ctx: nCtx,
      progressCallback: (p) => { if (onProgress) onProgress({ loaded: p.loaded, total: p.total }); },
    }),
    signal
  );
}

async function streamChat({ modelId, messages, options = {}, signal, onToken }) {
  const w = state.wllama;
  if (!w || !state.model) throw coded('MODEL_MISSING', 'No local model is loaded. Load a .gguf file first.');
  if (modelId && modelId !== state.model.id) throw coded('MODEL_MISSING', 'That local model is no longer loaded.');

  const request = { messages, stream: true, top_p: options.topP ?? 0.95 };
  if (options.temperature !== undefined) request.temperature = options.temperature;
  if (options.maxTokens !== undefined) request.max_tokens = options.maxTokens;
  if (signal) request.abortSignal = signal;

  let content = '';
  let chunks = 0;
  let firstTokenAt = 0;
  let lastEmitAt = 0;
  const started = performance.now();
  try {
    const stream = await w.createChatCompletion(request);
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || '';
      if (!delta) continue;
      const now = performance.now();
      if (!firstTokenAt) firstTokenAt = now;
      content += delta;
      chunks += 1;
      if (onToken) onToken(delta);
      if (chunks > 1 && now - lastEmitAt >= 500) {
        lastEmitAt = now;
        const ms = now - firstTokenAt;
        emit('generating', { live: { tokens: chunks, tokensPerSecond: ms > 0 ? Number(((chunks - 1) / (ms / 1000)).toFixed(1)) : null } });
      }
    }
  } catch (err) {
    if ((signal && signal.aborted) || err?.name === 'AbortError') throw coded('ABORTED', 'Request cancelled by user');
    throw err;
  }

  const ended = performance.now();
  const generatingMs = firstTokenAt ? ended - firstTokenAt : 0;
  state.lastRun = {
    tokens: chunks,
    totalMs: Math.round(ended - started),
    firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - started) : null,
    tokensPerSecond: generatingMs > 0 && chunks > 1 ? Number(((chunks - 1) / (generatingMs / 1000)).toFixed(1)) : null,
  };
  emit('run');

  return {
    content,
    usage: { prompt_tokens: 0, completion_tokens: Math.max(1, Math.ceil(content.length / 4)) },
  };
}

export const wllamaAdapter = {
  id: LOCAL_PROVIDER_ID,
  name: 'Local',
  badgeClass: 'local',
  badgeLabel: 'LOCAL',
  baseUrl: '',

  async listModels() {
    return state.model ? [state.model] : [];
  },

  streamChat(params) {
    return streamChat(params);
  },

  async healthCheck() {
    return state.model ? { ok: true, detail: state.model.name } : { ok: false, detail: 'No model loaded' };
  },
};

/** Test helper: forget the engine, the loaded model and all listeners. */
export function __resetLocalEngineForTests() {
  state.loader = null;
  state.lib = null;
  state.wllama = null;
  state.model = null;
  state.lastRun = null;
  state.loading = false;
  state.listeners.clear();
}

export default wllamaAdapter;
