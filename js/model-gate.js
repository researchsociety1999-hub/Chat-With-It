/**
 * Bridge between the availability gate and the app's real API object (js/api.js).
 *
 * app.js calls API.sendMessageStream directly (not the provider adapters), so this
 * wraps that call. It adds no new dependencies and leaves api.js untouched.
 *
 * Only OpenRouter is gated. Hugging Face has no free/paid split, so it passes through.
 */

import { API, CURATED_FREE } from './api.js';
import {
  createAvailabilityGate,
  dispatchWithGate,
  classifyDispatchError,
} from './providers/availability.mjs';

export const ModelGate = createAvailabilityGate({ curated: CURATED_FREE.openrouter });

/**
 * Drop-in replacement for API.sendMessageStream with the availability gate in front.
 * Resolves to the same response object, plus `modelUsed` (the model that answered).
 *
 * @param {object} p
 * @param {string} p.provider current provider id
 * @param {string} p.modelId selected model id
 * @param {Array} p.messages
 * @param {(delta: string) => void} [p.onToken]
 * @param {object} [p.options]
 * @param {(info: {from: string, to: string, reason: string}) => void} [p.onFallback]
 */
export async function gatedStream({ provider, modelId, messages, onToken, options, onFallback }) {
  if (provider !== 'openrouter') {
    return API.sendMessageStream(messages, modelId, onToken, options);
  }

  const out = await dispatchWithGate({
    gate: ModelGate,
    modelId,
    onFallback,
    send: async (id, ctx) => {
      try {
        return await API.sendMessageStream(
          messages,
          id,
          (delta) => { ctx.markOutput(); if (onToken) onToken(delta); },
          options,
        );
      } catch (err) {
        // api.js maps every 404 to MODEL_MISSING. Re-classify from the raw body so a
        // privacy-policy block is not mistaken for a retired model.
        if (err.status && err.raw) err.kind = classifyDispatchError(err.status, err.raw).kind;
        throw err;
      }
    },
  });

  return { ...out.result, modelUsed: out.modelId };
}
