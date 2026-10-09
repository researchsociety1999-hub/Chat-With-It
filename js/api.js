/**
 * API Handler
 * Manages all API requests with error handling, retry logic, and request cancellation.
 *
 * DATA FLOW & PRIVACY NOTE (shown in UI privacy panel):
 *  - Your API key is held ONLY in JavaScript memory (AppState) for this session.
 *  - It is NEVER written to localStorage, IndexedDB, cookies, or any server.
 *  - Every chat message travels directly from your browser to the provider
 *    (openrouter.ai or router.huggingface.co) over HTTPS/TLS 1.3.
 *  - This app has NO backend server — there is no middleman that logs, stores,
 *    or forwards your conversations.
 *  - Provider privacy: OpenRouter forwards requests to underlying model providers.
 *    Hugging Face Inference API routes to hosted model endpoints.
 *    Review each provider's privacy policy for their data-retention terms.
 */

import { AppState } from './state.js';
import { getProvider as getRegisteredProvider, bootstrapProviders } from './providers/index.js';
import { CURATED_FREE } from './curated-models.js';

export { CURATED_FREE };

// Ensure adapters are registered (idempotent)
bootstrapProviders();

export const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    authKey: 'cwi_or_key',
    modelEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: 'Authorization',
    extraHeaders: { 'HTTP-Referer': location.href, 'X-Title': 'ChatWithIt' },
    badgeClass: 'or',
    badgeLabel: 'OR',
  },
  huggingface: {
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    authKey: 'cwi_hf_token',
    modelEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: 'Authorization',
    extraHeaders: { 'HTTP-Referer': location.href, 'X-Title': 'ChatWithIt' },
    badgeClass: 'hf',
    badgeLabel: 'HF',
  }
};

export const PARAM_TIERS = [
  { value: 'all',   label: 'All sizes' },
  { value: 'tiny',  label: '≤ 3B params',    test: t => ['1B','2B','3B'].includes(t) },
  { value: 'small', label: '7–8B params',    test: t => ['7B','8B'].includes(t) },
  { value: 'mid',   label: '13–30B params',  test: t => ['13B','14B','20B','22B','24B','30B','32B'].includes(t) },
  { value: 'large', label: '70B params',     test: t => ['70B','72B'].includes(t) },
  { value: 'giant', label: '≥ 105B params',  test: t => ['105B','123B','180B','236B','671B'].includes(t) },
];

function isOpenRouterFreeModel(model) {
  if (!model?.id) return false;
  if (model.id.endsWith(':free')) return true;
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  return Number.isFinite(prompt) &&
         Number.isFinite(completion) &&
         prompt === 0 &&
         completion === 0;
}

function isEmbeddingModel(model) {
  const modality = String(model?.architecture?.modality || '').toLowerCase();
  return model?.type === 'embedding' || modality.includes('embedding') || String(model?.id || '').toLowerCase().includes('embed');
}

export const API = {
  getProvider(providerName = AppState.currentProvider) {
    return PROVIDERS[providerName] || PROVIDERS.openrouter;
  },

  parseProviderError(status, rawText = '') {
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch (_) {}
    const providerMsg =
      parsed?.error?.message ||
      parsed?.message ||
      rawText ||
      `HTTP ${status}`;
    const normalized = String(providerMsg).toLowerCase();
    if (status === 401 || normalized.includes('invalid api key') || normalized.includes('unauthorized')) {
      return { code: 'AUTH', userMessage: 'Authentication failed — please check your API key.', raw: providerMsg };
    }
    if (status === 429) {
      const isUpstream =
        normalized.includes('upstream') ||
        normalized.includes('provider') ||
        normalized.includes('overloaded') ||
        normalized.includes('try another') ||
        normalized.includes('too many requests to');
      if (isUpstream) {
        return {
          code: 'UPSTREAM_RATE_LIMIT',
          userMessage: 'This model is temporarily overloaded — try another model or wait 60 s.',
          raw: providerMsg,
        };
      }
      return {
        code: 'RATE_LIMIT',
        userMessage: 'Rate limited — OpenRouter free-tier allows 20 req/min and 50 req/day. Please wait or add credits.',
        raw: providerMsg,
      };
    }
    if (
      status === 404 &&
      (normalized.includes('unavailable for free') ||
       normalized.includes('paid version is available now') ||
       normalized.includes('use this slug instead'))
    ) {
      return {
        code: 'MODEL_NOT_FREE',
        userMessage: 'This model is no longer free. Refreshing models — please choose another one.',
        raw: providerMsg,
      };
    }
    if (status === 404 || (normalized.includes('model') && normalized.includes('not found'))) {
      return {
        code: 'MODEL_MISSING',
        userMessage: 'This model is no longer available. Refreshing models — please choose another one.',
        raw: providerMsg,
      };
    }
    return { code: 'API_ERROR', userMessage: `Request failed (${status}) — please try again.`, raw: providerMsg };
  },

  async fetchModels(providerName = AppState.currentProvider, paramFilter = 'all') {
    const token = providerName === 'openrouter' ? AppState.apiKey : AppState.hfToken;
    const adapter = getRegisteredProvider(providerName);
    const curated = CURATED_FREE[providerName] || [];

    let models;
    try {
      models = await adapter.listModels(token || null, { curated });
    } catch (err) {
      if (!token) {
        models = curated
          .filter((m) => m.type !== 'embedding')
          .map((m) => ({
            id: m.id,
            name: m.name,
            ctx: m.ctx,
            paramTier: m.paramTier || '?',
            uncensored: !!m.uncensored,
            type: m.type || 'chat',
            provider: providerName,
          }));
      } else {
        console.warn('Model fetch failed:', err.message);
        throw err;
      }
    }

    models = models.map((m) => ({
      id: m.id,
      name: m.name,
      ctx: m.ctx,
      paramTier: m.paramTier || '?',
      uncensored: !!m.uncensored,
      type: m.type || 'chat',
      live: m.live,
      provider: m.provider || providerName,
    }));

    if (paramFilter && paramFilter !== 'all') {
      const tier = PARAM_TIERS.find((t) => t.value === paramFilter);
      if (tier) models = models.filter((m) => tier.test(m.paramTier || '?'));
    }

    return models;
  },

  processModels(data, providerName) {
    const curatedMap = {};
    (CURATED_FREE[providerName] || []).forEach((m) => {
      curatedMap[m.id] = m;
    });
    let models = [];
    if (providerName === 'openrouter') {
      models = (data.data || [])
        .filter((model) => isOpenRouterFreeModel(model) && !isEmbeddingModel(model))
        .map((m) => {
          const curated = curatedMap[m.id];
          return {
            id: m.id,
            name: curated?.name || `${m.name || m.id} (${Math.round((m.context_length || 8192) / 1000)}k)`,
            ctx: m.context_length || curated?.ctx || 8192,
            paramTier: curated?.paramTier || '?',
            uncensored: curated?.uncensored || false,
            type: curated?.type || 'chat',
          };
        })
        .filter((m) => m.type !== 'embedding');
    } else {
      const liveIds = new Set((data.data || []).map((m) => m.id));
      models = (CURATED_FREE.huggingface || [])
        .filter((m) => m.type !== 'embedding')
        .filter((m) => liveIds.has(m.id))
        .map((m) => ({ ...m, live: true }));
    }
    const seen = new Set();
    models = models.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    models.sort((a, b) => a.name.localeCompare(b.name));
    return models;
  },

  async sendMessage(messages, modelId, options = {}) {
    return this.sendMessageStream(messages, modelId, null, options);
  },

  async sendMessageStream(messages, modelId, onToken, options = {}) {
    const providerName = AppState.currentProvider;
    const token = AppState.getAuthToken();
    if (!token) {
      throw Object.assign(new Error('Not authenticated. Please provide API credentials.'), { code: 'AUTH' });
    }

    const adapter = getRegisteredProvider(providerName);
    const streamOpts = {
      topP: options.topP ?? 0.95,
    };
    if (options.temperature !== undefined || AppState.generationControlsEnabled) {
      streamOpts.temperature = options.temperature ?? AppState.temperature;
    }
    if (options.maxTokens !== undefined || AppState.generationControlsEnabled) {
      streamOpts.maxTokens = options.maxTokens ?? AppState.maxTokens;
    }

    try {
      const appSignal = AppState.abortController?.signal;
      const result = await adapter.streamChat({
        token,
        modelId,
        messages,
        options: streamOpts,
        signal: appSignal,
        onToken,
      });

      const promptTokens = result.usage?.prompt_tokens || 0;
      const completionTokens =
        result.usage?.completion_tokens || Math.max(1, Math.ceil((result.content || '').length / 4));
      const usageEstimated = !result.usage?.completion_tokens;

      return {
        choices: [{ message: { content: result.content || '' } }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
        usageEstimated,
      };
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ABORTED') {
        const err = new Error('Request cancelled by user');
        err.code = 'ABORTED';
        throw err;
      }
      throw error;
    }
  },

  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
    const signals = [timeoutCtrl.signal];
    if (options.signal) signals.push(options.signal);
    const composedSignal =
      typeof AbortSignal.any === 'function'
        ? AbortSignal.any(signals)
        : options.signal || timeoutCtrl.signal;
    try {
      return await fetch(url, { ...options, signal: composedSignal });
    } finally {
      clearTimeout(timeoutId);
    }
  },

  cancelRequest() {
    if (AppState.abortController) {
      AppState.abortController.abort();
      AppState.abortController = null;
    }
  },

  createAbortController() {
    AppState.abortController = new AbortController();
    return AppState.abortController;
  },

  extractTokenUsage(response) {
    const usage = response?.usage;
    if (usage)
      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        estimated: Boolean(response?.usageEstimated),
      };
    const content = response?.choices?.[0]?.message?.content || '';
    return {
      promptTokens: 0,
      completionTokens: Math.max(1, Math.ceil(content.length / 4)),
      estimated: true,
    };
  },

  getParamTiers() {
    return PARAM_TIERS;
  },
};

export default API;
