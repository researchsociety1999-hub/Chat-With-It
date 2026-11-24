/**
 * Local (on-device) provider backed by wllama (llama.cpp compiled to WebAssembly).
 *
 * Pure module: no DOM, no AppState, no storage. The model file is read in this browser and is
 * never uploaded. The wllama library itself is supplied through setEngineLoader(), so this file
 * builds and tests without the dependency; the app wires the real loader in a later commit.
 *
 * Loader contract: async () => ({ Wllama, config }) where config is the Wllama asset-path config.
 */

import { inferParamTier } from './model-list.mjs';

export const LOCAL_PROVIDER_ID = 'local';
export const DEFAULT_N_CTX = 4096;

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

/** Subscribe to loading / loaded / unloaded / run / error events. Returns an unsubscribe function. */
export function onLocalChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function isGgufFile(file) {
  return Boolean(file) && /\.gguf$/i.test(String(file.name || '')) && file.size > 0;
}

export function describeLocalModel(file, nCtx = DEFAULT_N_CTX) {
  return {
    id: `local/${file.name}`,
    provider: LOCAL_PROVIDER_ID,
    name: String(file.name).replace(/\.gguf$/i, ''),
    ctx: nCtx,
    paramTier: inferParamTier(file.name),
    uncensored: false,
    type: 'chat',
    live: true,
    curated: false,
    local: true,
    fileName: file.name,
    sizeBytes: file.size,
  };
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

/**
 * Load a .gguf File chosen by the user.
 * Throws errors carrying .code: INVALID_REQUEST, ENGINE_MISSING, BUSY, or the engine's own error.
 */
export async function loadLocalModel(file, { nCtx = DEFAULT_N_CTX } = {}) {
  if (!isGgufFile(file)) throw coded('INVALID_REQUEST', 'Choose a non-empty .gguf model file.');
  if (!state.loader) throw coded('ENGINE_MISSING', 'The local engine is not part of this build yet.');
  if (state.loading) throw coded('BUSY', 'A model is already loading.');

  state.loading = true;
  emit('loading', { file: { name: file.name, size: file.size } });
  const started = performance.now();
  let w = null;
  try {
    await unloadLocalModel({ silent: true });
    if (!state.lib) state.lib = await state.loader();
    w = new state.lib.Wllama(state.lib.config);
    await w.loadModel([file], { n_ctx: nCtx });

    const model = { ...describeLocalModel(file, nCtx), loadMs: Math.round(performance.now() - started) };
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
    emit('error', { error: err });
    throw err;
  } finally {
    state.loading = false;
  }
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
  const started = performance.now();
  try {
    const stream = await w.createChatCompletion(request);
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || '';
      if (!delta) continue;
      if (!firstTokenAt) firstTokenAt = performance.now();
      content += delta;
      chunks += 1;
      if (onToken) onToken(delta);
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
