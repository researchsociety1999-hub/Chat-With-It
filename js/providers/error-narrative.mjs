/**
 * Plain-English narratives for failed sends. Pure: no DOM, no AppState.
 *
 * describeSendError(err, { provider }) returns { kind, title, message, actions } for the four
 * failures the app can help with, or null for everything else (user Stop, rate limits, retired
 * models, ...), which keep their existing handling.
 *
 * Action ids are handled by js/trust-ui.js: retry, switch-local, manage-models, open-key-settings.
 */

export const NarrativeKind = {
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  MEMORY: 'memory',
  AUTH: 'auth',
};

// Wording of out-of-memory failures differs between browsers and engine builds; these are the
// common ones (WebAssembly.Memory allocation, emscripten abort, typed-array allocation).
const MEMORY_RE = /out of memory|could not allocate|failed to allocate|allocation failed|array buffer allocation|WebAssembly\.Memory|memory access out of bounds|\bOOM\b/i;

const RETRY = { id: 'retry', label: 'Retry' };
const SWITCH_LOCAL = { id: 'switch-local', label: 'Switch to Local WASM' };
const MANAGE_MODELS = { id: 'manage-models', label: 'Manage Models' };
const OPEN_KEY_SETTINGS = { id: 'open-key-settings', label: 'Open Key Settings' };

function remoteActions(provider) {
  return provider === 'local' ? [RETRY] : [RETRY, SWITCH_LOCAL];
}

export function describeSendError(err, { provider } = {}) {
  if (!err || err.code === 'ABORTED') return null;

  if (err.code === 'AUTH') {
    return {
      kind: NarrativeKind.AUTH,
      title: 'API key needed',
      message: 'No valid API key provided for this provider.',
      actions: [OPEN_KEY_SETTINGS],
    };
  }
  if (err.code === 'TIMEOUT') {
    return {
      kind: NarrativeKind.TIMEOUT,
      title: 'No response',
      message: "The AI provider didn't respond in time.",
      actions: remoteActions(provider),
    };
  }
  if (err.kind === 'NETWORK') {
    return {
      kind: NarrativeKind.NETWORK,
      title: 'Connection problem',
      message: "Couldn't reach the AI provider. Check your connection.",
      actions: remoteActions(provider),
    };
  }
  // Only the on-device engine runs out of browser memory; a provider's own "out of memory" is a server fault.
  if (provider === 'local' && MEMORY_RE.test(`${err.name || ''} ${err.message || ''}`)) {
    return {
      kind: NarrativeKind.MEMORY,
      title: 'Out of memory',
      message: 'Browser memory limit reached. Unload unused GGUF models or pick a smaller quantization.',
      actions: [MANAGE_MODELS],
    };
  }
  return null;
}
