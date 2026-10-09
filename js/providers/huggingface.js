/**
 * Hugging Face (router) provider adapter.
 * Implements the provider contract without depending on AppState.
 */

import { ErrorCode, providerError } from './types.js';
import { normalizeModel, dedupeAndSort } from './normalize.js';

const BASE = 'https://router.huggingface.co/v1';

function parseError(status, rawText = '') {
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (_) {}
  const providerMsg = parsed?.error?.message || parsed?.message || rawText || `HTTP ${status}`;
  const normalized = String(providerMsg).toLowerCase();

  if (status === 401 || normalized.includes('invalid') || normalized.includes('unauthorized')) {
    return providerError(ErrorCode.AUTH, 'Authentication failed — please check your Hugging Face token.', { raw: providerMsg, status });
  }
  if (status === 429) {
    return providerError(ErrorCode.RATE_LIMIT, 'Rate limited by Hugging Face — please wait and retry.', { raw: providerMsg, status });
  }
  if (status === 404 || (normalized.includes('model') && normalized.includes('not found'))) {
    return providerError(ErrorCode.MODEL_MISSING, 'This model is no longer available. Please choose another one.', { raw: providerMsg, status });
  }
  return providerError(ErrorCode.SERVER, `Request failed (${status}) — please try again.`, { raw: providerMsg, status });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  const signals = [timeoutCtrl.signal];
  if (options.signal) signals.push(options.signal);
  const composed =
    typeof AbortSignal.any === 'function'
      ? AbortSignal.any(signals)
      : options.signal || timeoutCtrl.signal;
  try {
    return await fetch(url, { ...options, signal: composed });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const huggingFaceAdapter = {
  id: 'huggingface',
  name: 'Hugging Face',
  badgeClass: 'hf',
  badgeLabel: 'HF',
  baseUrl: BASE,

  /**
   * HF catalog is curated-first; live IDs mark availability when token is present.
   * @param {string|null} token
   * @param {{ curated?: Array, signal?: AbortSignal }} [opts]
   */
  async listModels(token, opts = {}) {
    const curated = (opts.curated || []).filter((m) => m.type !== 'embedding');

    if (!token) {
      return dedupeAndSort(curated.map((m) => normalizeModel({ ...m, live: false }, 'huggingface', m)));
    }

    try {
      const response = await fetchWithTimeout(
        `${BASE}/models`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'HTTP-Referer': typeof location !== 'undefined' ? location.href : 'https://chat-with-it.vercel.app',
            'X-Title': 'ChatWithIt',
          },
          signal: opts.signal,
        },
        12000
      );

      if (!response.ok) {
        const raw = await response.text();
        throw parseError(response.status, raw);
      }

      const data = await response.json();
      const liveIds = new Set((data.data || []).map((m) => m.id));
      const models = curated
        .filter((m) => liveIds.has(m.id))
        .map((m) => normalizeModel({ ...m, live: true }, 'huggingface', m));

      // Include any extra live chat models not in curated
      for (const lm of data.data || []) {
        if (!liveIds.has(lm.id)) continue;
        if (curated.some((c) => c.id === lm.id)) continue;
        if (String(lm.id || '').toLowerCase().includes('embed')) continue;
        models.push(normalizeModel(lm, 'huggingface'));
      }

      return dedupeAndSort(models.length ? models : curated.map((m) => normalizeModel(m, 'huggingface', m)));
    } catch (err) {
      if (err.code) throw err;
      if (err.name === 'AbortError') {
        throw providerError(ErrorCode.ABORTED, 'Request cancelled');
      }
      console.warn('[HuggingFace] listModels failed, using curated:', err.message);
      return dedupeAndSort(curated.map((m) => normalizeModel(m, 'huggingface', m)));
    }
  },

  async streamChat({ token, modelId, messages, options = {}, signal, onToken }) {
    if (!token) {
      throw providerError(ErrorCode.AUTH, 'Not authenticated. Please provide API credentials.');
    }

    const payload = {
      model: modelId,
      messages,
      top_p: options.topP ?? 0.95,
      stream: true,
    };
    if (options.temperature !== undefined) payload.temperature = options.temperature;
    if (options.maxTokens !== undefined) payload.max_tokens = options.maxTokens;

    const response = await fetchWithTimeout(
      `${BASE}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'HTTP-Referer': typeof location !== 'undefined' ? location.href : 'https://chat-with-it.vercel.app',
          'X-Title': 'ChatWithIt',
        },
        body: JSON.stringify(payload),
        signal,
      },
      60000
    );

    if (!response.ok) {
      const raw = await response.text();
      throw parseError(response.status, raw);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let content = '';
    let buffer = '';
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) {
        console.warn('[HuggingFace] SSE buffer overflow — truncating');
        buffer = '';
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          if (chunk.usage) usage = chunk.usage;
          const delta = chunk.choices?.[0]?.delta?.content || '';
          content += delta;
          if (delta && onToken) onToken(delta);
        } catch (_) { /* skip */ }
      }
    }

    const estimatedCompletion = Math.max(1, Math.ceil(content.length / 4));
    return {
      content,
      usage: {
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || estimatedCompletion,
      },
    };
  },

  async healthCheck(token) {
    if (!token) return { ok: false, detail: 'No token' };
    try {
      const models = await this.listModels(token, { curated: [] });
      return { ok: true, detail: `${models.length} models` };
    } catch (e) {
      return { ok: false, detail: e.message };
    }
  },
};

export default huggingFaceAdapter;
