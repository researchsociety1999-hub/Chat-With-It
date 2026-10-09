/**
 * Normalized types for provider-agnostic ChatWithIt.
 * UI and app logic should depend on these shapes, not provider-specific payloads.
 */

/**
 * @typedef {Object} NormalizedModel
 * @property {string} id              - Provider-native model id
 * @property {string} provider        - e.g. 'openrouter' | 'huggingface' | 'openai-compatible'
 * @property {string} name            - Human display name
 * @property {number} ctx             - Context window (tokens)
 * @property {string} [paramTier]     - e.g. '7B', '70B', '?'
 * @property {boolean} [uncensored]
 * @property {'chat'|'embedding'|'other'} [type]
 * @property {boolean} [live]         - Present in live catalog when known
 * @property {Object} [pricing]       - { prompt?: number, completion?: number } per token if known
 * @property {string[]} [capabilities] - e.g. ['tools','vision','reasoning']
 */

/**
 * Canonical error codes used across providers.
 * Map provider-specific failures into these before surfacing to UI.
 */
export const ErrorCode = Object.freeze({
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  UPSTREAM_RATE_LIMIT: 'UPSTREAM_RATE_LIMIT',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  MODEL_NOT_FREE: 'MODEL_NOT_FREE',
  MODEL_MISSING: 'MODEL_MISSING',
  CONTEXT_TOO_LARGE: 'CONTEXT_TOO_LARGE',
  CONTENT_FILTER: 'CONTENT_FILTER',
  INVALID_REQUEST: 'INVALID_REQUEST',
  SERVER: 'SERVER',
  ABORTED: 'ABORTED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * @param {string} code
 * @param {string} userMessage
 * @param {object} [extra]
 * @returns {Error}
 */
export function providerError(code, userMessage, extra = {}) {
  const err = new Error(userMessage);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Minimal provider interface contract (documented for implementers).
 *
 * listModels(token, options) -> Promise<NormalizedModel[]>
 * streamChat({ token, modelId, messages, options, signal, onToken }) -> Promise<{ content, usage }>
 * healthCheck(token) -> Promise<{ ok: boolean, detail?: string }>
 */
export const ProviderContract = {
  requiredMethods: ['listModels', 'streamChat'],
  optionalMethods: ['healthCheck', 'getModelMetadata'],
};

export default { ErrorCode, providerError, ProviderContract };
