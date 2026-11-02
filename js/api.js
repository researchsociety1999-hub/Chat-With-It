/**
 * API Handler
 * Manages all API requests with error handling, retry logic, and request cancellation.
 *
 * DATA FLOW & PRIVACY NOTE (shown in UI privacy panel):
 *  - Your API key is held ONLY in JavaScript memory (AppState) for this session.
 *  - By default it is held in memory only. The optional Profiles feature (js/profiles.js) can store it
 *    unencrypted in localStorage if the user opts in. It is never sent to any server except the provider.
 *  - Every chat message travels directly from your browser to the provider
 *    (openrouter.ai or router.huggingface.co) over HTTPS/TLS 1.3.
 *  - This app has NO backend server — there is no middleman that logs, stores,
 *    or forwards your conversations.
 *  - Provider privacy: OpenRouter forwards requests to underlying model providers.
 *    Hugging Face Inference API routes to hosted model endpoints.
 *    Review each provider's privacy policy for their data-retention terms.
 */

import { AppState } from './state.js';
import { isFreeModel, classifyDispatchError, ErrorKind } from './providers/availability.mjs';

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

/**
 * Parameter-size tier buckets.
 */
export const PARAM_TIERS = [
  { value: 'all',   label: 'All sizes' },
  { value: 'tiny',  label: '≤ 3B params',    test: t => ['1B','2B','3B'].includes(t) },
  { value: 'small', label: '7–8B params',    test: t => ['7B','8B'].includes(t) },
  { value: 'mid',   label: '13–30B params',  test: t => ['13B','14B','20B','22B','24B','30B','32B'].includes(t) },
  { value: 'large', label: '70B params',     test: t => ['70B','72B'].includes(t) },
  { value: 'giant', label: '≥ 105B params',  test: t => ['105B','123B','180B','236B','671B'].includes(t) },
];

/**
 * Detect free OpenRouter models by :free suffix or zero pricing.
 */
function isOpenRouterFreeModel(model) {
  return isFreeModel(model); // single shared predicate (js/providers/availability.mjs)
}

function isEmbeddingModel(model) {
  const modality = String(model?.architecture?.modality || '').toLowerCase();
  return model?.type === 'embedding' || modality.includes('embedding') || String(model?.id || '').toLowerCase().includes('embed');
}

/**
 * Comprehensive curated list of permanently-free models.
 * FIX Q: models with type:'embedding' are filtered out of the chat UI.
 */
export const CURATED_FREE = {
  openrouter: [
    // Live free models from OpenRouter catalog (synced via scripts/validate-models.mjs).
    // Keep this list in sync with the live free catalog; retire models here into
    // DEPRECATED_IDS when they leave the free tier.
    { id:'recursive/flint-v1.0:free',           name:'Recursive Flint',                    ctx:262144, paramTier:'?' },
    { id:'xingchen-agi/xing4.0-29b-a4b:free',   name:'Xing4.0 29B A4B',                     ctx:262144, paramTier:'?' },
    { id:'nvidia/nemotron-3.5-super-vl:free',   name:'Nemotron 3.5 Super VL',               ctx:1000000, paramTier:'?' },
    { id:'dots-studio/dots-3-note-preview:free', name:'Dots3-Note Preview',                ctx:512000,  paramTier:'?' },
    { id:'liquid/lfm-2.5-2.6b:free',            name:'Liquid LFM2.5 2.6B',                  ctx:65536,  paramTier:'?' },
    { id:'nvidia/nemotron-3.5-lightning:free',  name:'Nemotron 3.5 Lightning',             ctx:1000000, paramTier:'?' },
    { id:'thinkingmachines/inkling-small:free', name:'Inkling Small',                      ctx:1048576, paramTier:'?' },
    { id:'thinkingmachines/inkling:free',       name:'Inkling',                            ctx:1048576, paramTier:'?' },
    { id:'cohere/north-mini-code:free',         name:'Cohere North Mini Code',             ctx:256000,  paramTier:'?' },
    { id:'nvidia/nemotron-3.5-content-safety:free', name:'Nemotron 3.5 Content Safety',     ctx:128000, paramTier:'?' },
    { id:'nvidia/nemotron-3-ultra-550b-a55b:free', name:'Nemotron 3 Ultra 550B',            ctx:1000000, paramTier:'?' },
    { id:'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name:'Nemotron 3 Nano Omni 30B A3B', ctx:256000, paramTier:'?' },
    { id:'google/gemma-4-26b-a4b-it:free',      name:'Gemma 4 26B A4B IT',                  ctx:262144, paramTier:'?' },
    { id:'google/gemma-4-31b-it:free',          name:'Gemma 4 31B IT',                     ctx:262144, paramTier:'?' },
    { id:'google/lyria-3-pro-preview',          name:'Lyria 3 Pro Preview',                ctx:1048576, paramTier:'?' },
    { id:'google/lyria-3-clip-preview',         name:'Lyria 3 Clip Preview',               ctx:1048576, paramTier:'?' },
    { id:'openrouter/free',                     name:'Free Models Router',                 ctx:200000, paramTier:'?' },
  ],

  huggingface: [
    // Live models in Hugging Face Router catalog (synced via scripts/validate-models.mjs).
    // HF has no free/paid split; the adapter enriches with any extra live chat models
    // not listed here from https://router.huggingface.co/v1/models.
    { id:'meta-llama/Llama-3.1-8B-Instruct',         name:'Llama 3.1 8B Instruct',        ctx:131072, paramTier:'8B' },
    { id:'meta-llama/Llama-3.1-70B-Instruct',         name:'Llama 3.1 70B Instruct',       ctx:131072, paramTier:'70B' },
    { id:'meta-llama/Llama-3.1-8B-Instruct',          name:'Llama 3.1 8B Instruct',        ctx:131072, paramTier:'8B' },
    { id:'meta-llama/Llama-3.2-3B-Instruct',          name:'Llama 3.2 3B Instruct',        ctx:131072, paramTier:'3B' },
    { id:'meta-llama/Llama-3.2-1B-Instruct',          name:'Llama 3.2 1B Instruct',        ctx:131072, paramTier:'1B', uncensored:true },
    { id:'meta-llama/Llama-3.2-11B-Vision-Instruct',  name:'Llama 3.2 11B Vision',         ctx:131072, paramTier:'13B' },
    { id:'meta-llama/Llama-3.2-90B-Vision-Instruct',  name:'Llama 3.2 90B Vision',         ctx:131072, paramTier:'?' },
    { id:'meta-llama/Meta-Llama-3-8B-Instruct',       name:'Llama 3 8B Instruct',          ctx:8192,   paramTier:'8B' },
    { id:'meta-llama/Meta-Llama-3-70B-Instruct',      name:'Llama 3 70B Instruct',         ctx:8192,   paramTier:'70B' },
    // ── Mistral ──────────────────────────────────────────────────────────────────
    { id:'mistralai/Mistral-7B-Instruct-v0.3',        name:'Mistral 7B Instruct v0.3',     ctx:32768,  paramTier:'7B' },
    { id:'mistralai/Mistral-Nemo-Instruct-2407',      name:'Mistral NeMo 12B Instruct',    ctx:131072, paramTier:'13B' },
    { id:'mistralai/Mixtral-8x7B-Instruct-v0.1',      name:'Mixtral 8x7B Instruct',        ctx:32768,  paramTier:'?' },
    { id:'mistralai/Mixtral-8x22B-Instruct-v0.1',     name:'Mixtral 8x22B Instruct',       ctx:65536,  paramTier:'?' },
    { id:'mistralai/Mistral-Small-3.1-24B-Instruct-2503', name:'Mistral Small 3.1 24B',    ctx:131072, paramTier:'24B' },
    // ── Qwen ─────────────────────────────────────────────────────────────────────
    { id:'Qwen/Qwen2.5-72B-Instruct',                 name:'Qwen 2.5 72B Instruct',        ctx:131072, paramTier:'70B' },
    { id:'Qwen/Qwen2.5-7B-Instruct',                  name:'Qwen 2.5 7B Instruct',         ctx:131072, paramTier:'7B' },
    { id:'Qwen/Qwen2.5-3B-Instruct',                  name:'Qwen 2.5 3B Instruct',         ctx:131072, paramTier:'3B' },
    { id:'Qwen/Qwen2.5-1.5B-Instruct',                name:'Qwen 2.5 1.5B Instruct',       ctx:131072, paramTier:'1B', uncensored:true },
    { id:'Qwen/Qwen2.5-Coder-32B-Instruct',           name:'Qwen 2.5 Coder 32B',           ctx:131072, paramTier:'32B' },
    { id:'Qwen/Qwen2.5-VL-7B-Instruct',               name:'Qwen 2.5 VL 7B (Vision)',      ctx:32768,  paramTier:'7B' },
    { id:'Qwen/Qwen2.5-VL-72B-Instruct',              name:'Qwen 2.5 VL 72B (Vision)',     ctx:32768,  paramTier:'70B' },
    { id:'Qwen/QwQ-32B',                              name:'QwQ 32B (Reasoning)',           ctx:131072, paramTier:'32B' },
    { id:'Qwen/Qwen3-30B-A3B',                        name:'Qwen3 30B A3B (MoE)',           ctx:131072, paramTier:'30B' },
    // ── DeepSeek ─────────────────────────────────────────────────────────────────
    { id:'deepseek-ai/DeepSeek-V3',                   name:'DeepSeek V3 (671B)',            ctx:131072, paramTier:'671B' },
    { id:'deepseek-ai/DeepSeek-R1',                   name:'DeepSeek R1 (671B · Reasoning)',ctx:131072, paramTier:'671B' },
    { id:'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name:'DeepSeek R1 Distill Llama 70B',ctx:65536,  paramTier:'70B' },
    { id:'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',  name:'DeepSeek R1 Distill Qwen 32B', ctx:65536,  paramTier:'32B' },
    // ── Microsoft Phi ─────────────────────────────────────────────────────────────
    { id:'microsoft/Phi-3.5-mini-instruct',           name:'Phi-3.5 Mini 3.8B Instruct',   ctx:131072, paramTier:'3B' },
    { id:'microsoft/Phi-3-mini-4k-instruct',          name:'Phi-3 Mini 3.8B (4k)',          ctx:4096,   paramTier:'3B' },
    { id:'microsoft/Phi-3-medium-4k-instruct',        name:'Phi-3 Medium 14B (4k)',         ctx:4096,   paramTier:'14B' },
    // ── Google Gemma ──────────────────────────────────────────────────────────────
    { id:'google/gemma-2-2b-it',                      name:'Gemma 2 2B IT',                 ctx:8192,   paramTier:'1B' },
    { id:'google/gemma-2-9b-it',                      name:'Gemma 2 9B IT',                 ctx:8192,   paramTier:'8B' },
    { id:'google/gemma-2-27b-it',                     name:'Gemma 2 27B IT',                ctx:8192,   paramTier:'30B' },
    { id:'google/gemma-7b-it',                        name:'Gemma 7B IT',                   ctx:8192,   paramTier:'7B' },
    // ── Nous Research ────────────────────────────────────────────────────────────
    { id:'NousResearch/Hermes-3-Llama-3.1-8B',        name:'Hermes 3 Llama 3.1 8B',        ctx:131072, paramTier:'8B',  uncensored:true },
    { id:'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',name:'Hermes 2 Mixtral 8x7B DPO',   ctx:32768,  paramTier:'?',   uncensored:true },
    // ── Dolphin ───────────────────────────────────────────────────────────────────
    { id:'cognitivecomputations/dolphin-2.9.2-qwen2-72b', name:'Dolphin 2.9.2 Qwen2 72B',  ctx:32768,  paramTier:'70B', uncensored:true },
    // ── HuggingFaceH4 ─────────────────────────────────────────────────────────────
    { id:'HuggingFaceH4/zephyr-7b-beta',              name:'Zephyr 7B Beta',               ctx:32768,  paramTier:'7B' },
    { id:'HuggingFaceH4/zephyr-7b-alpha',             name:'Zephyr 7B Alpha',              ctx:32768,  paramTier:'7B' },
    // ── OpenChat ──────────────────────────────────────────────────────────────────
    { id:'openchat/openchat-3.6-8b-20240522',         name:'OpenChat 3.6 8B',              ctx:8192,   paramTier:'8B',  uncensored:true },
    // ── Falcon ────────────────────────────────────────────────────────────────────
    { id:'tiiuae/Falcon3-10B-Instruct',               name:'Falcon 3 10B Instruct',        ctx:32768,  paramTier:'13B' },
    { id:'tiiuae/Falcon3-7B-Instruct',                name:'Falcon 3 7B Instruct',         ctx:32768,  paramTier:'7B' },
    { id:'tiiuae/Falcon3-3B-Instruct',                name:'Falcon 3 3B Instruct',         ctx:32768,  paramTier:'3B' },
    { id:'tiiuae/Falcon3-1B-Instruct',                name:'Falcon 3 1B Instruct',         ctx:32768,  paramTier:'1B', uncensored:true },
    // ── EXAONE ────────────────────────────────────────────────────────────────────
    { id:'LGAI-MEDIA/EXAONE-3.5-7.8B-Instruct',       name:'EXAONE 3.5 7.8B Instruct',    ctx:32768,  paramTier:'7B' },
    // ── Cohere ────────────────────────────────────────────────────────────────────
    { id:'CohereForAI/c4ai-command-r-plus-08-2024',   name:'Command R+ 08-2024 (104B)',    ctx:131072, paramTier:'105B' },
    { id:'CohereForAI/c4ai-command-r7b-12-2024',      name:'Command R7B 12-2024',          ctx:131072, paramTier:'7B' },
    // ── AllenAI ───────────────────────────────────────────────────────────────────
    { id:'allenai/OLMo-2-1124-13B-Instruct',          name:'OLMo 2 13B Instruct',          ctx:4096,   paramTier:'13B' },
    { id:'allenai/OLMo-2-1124-7B-Instruct',           name:'OLMo 2 7B Instruct',           ctx:4096,   paramTier:'7B' },
    // ── SmolLM ───────────────────────────────────────────────────────────────────
    { id:'HuggingFaceTB/SmolLM2-1.7B-Instruct',       name:'SmolLM2 1.7B Instruct',        ctx:8192,   paramTier:'1B', uncensored:true },
    { id:'HuggingFaceTB/SmolLM2-360M-Instruct',       name:'SmolLM2 360M Instruct',        ctx:8192,   paramTier:'1B', uncensored:true },
  ]
};

export const API = {
  getProvider(providerName = AppState.currentProvider) {
    return PROVIDERS[providerName] || PROVIDERS.openrouter;
  },

  /**
   * Parse a raw provider error response into a user-friendly object.
   */
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
        userMessage: 'OpenRouter free-tier rate limit hit (about 20 req/min and 50 req/day without credits). Wait a minute, switch to another free model, or add credits on OpenRouter — this app only lists free models.',
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
    if (classifyDispatchError(status, rawText).kind === ErrorKind.POLICY_BLOCKED) {
      return {
        code: 'MODEL_UNAVAILABLE',
        userMessage: 'OpenRouter blocked this free model because of your OpenRouter privacy settings. In OpenRouter, open Settings → Privacy and allow free models, or choose a paid model.',
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
    const provider = this.getProvider(providerName);
    const token = providerName === 'openrouter' ? AppState.apiKey : AppState.hfToken;

    let models;

    if (!token) {
      // FIX Q: filter out embedding-only models from the curated fallback
      models = (CURATED_FREE[providerName] || []).filter(m => m.type !== 'embedding');
    } else {
      try {
        const headers = {
          [provider.authHeader]: `Bearer ${token}`,
          ...provider.extraHeaders
        };

        const response = await this.fetchWithTimeout(
          `${provider.baseUrl}${provider.modelEndpoint}`,
          { headers },
          12000
        );

        if (!response.ok) {
          const raw = await response.text();
          const err = this.parseProviderError(response.status, raw);
          throw Object.assign(new Error(err.userMessage), err);
        }

        const data = await response.json();
        models = this.processModels(data, providerName);
      } catch (err) {
        console.warn('Model fetch failed:', err.message);
        throw err;
      }
    }

    if (paramFilter && paramFilter !== 'all') {
      const tier = PARAM_TIERS.find(t => t.value === paramFilter);
      if (tier) models = models.filter(m => tier.test(m.paramTier || '?'));
    }

    return models;
  },

  processModels(data, providerName) {
    const curatedMap = {};
    (CURATED_FREE[providerName] || []).forEach(m => { curatedMap[m.id] = m; });
    let models = [];

    if (providerName === 'openrouter') {
      models = (data.data || [])
        .filter(model => isOpenRouterFreeModel(model) && !isEmbeddingModel(model))
        .map(m => {
          const curated = curatedMap[m.id];
          return {
            id:         m.id,
            name:       curated?.name || `${m.name || m.id} (${Math.round((m.context_length || 8192) / 1000)}k)`,
            ctx:        m.context_length || curated?.ctx || 8192,
            paramTier:  curated?.paramTier || '?',
            uncensored: curated?.uncensored || false,
            type:       curated?.type || 'chat',
          };
        })
        // FIX Q: exclude embedding models from live-fetched list too
        .filter(m => m.type !== 'embedding');
    } else {
      const liveIds = new Set((data.data || []).map(m => m.id));
      models = CURATED_FREE.huggingface
        .filter(m => m.type !== 'embedding')
        .filter(m => liveIds.has(m.id))
        .map(m => ({ ...m, live: true }));
    }

    const seen = new Set();
    models = models.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    models.sort((a, b) => a.name.localeCompare(b.name));
    return models;
  },

  /** @deprecated — kept for backward compat; calls sendMessageStream */
  async sendMessage(messages, modelId, options = {}) {
    return this.sendMessageStream(messages, modelId, null, options);
  },

  /**
   * FIX M: Removed duplicate canMakeRequest() + recordRequest() that previously
   * lived here alongside the identical check in app.js:sendMessage(). Rate-limit
   * enforcement now lives exclusively in app.js so every send costs exactly one
   * bucket slot.
   */
  async sendMessageStream(messages, modelId, onToken, options = {}) {
    const provider = this.getProvider();
    const token = AppState.getAuthToken();

    if (!token) {
      throw Object.assign(
        new Error('Not authenticated. Please provide API credentials.'),
        { code: 'AUTH' }
      );
    }

    const payload = {
      model:       modelId,
      messages:    messages,
      top_p:       options.topP ?? 0.95,
      stream:      true,
      stream_options: { include_usage: true },
    };
    if (options.temperature !== undefined || AppState.generationControlsEnabled) {
      payload.temperature = options.temperature ?? AppState.temperature;
    }
    if (options.maxTokens !== undefined || AppState.generationControlsEnabled) {
      payload.max_tokens = options.maxTokens ?? AppState.maxTokens;
    }

    const headers = {
      'Content-Type':        'application/json',
      [provider.authHeader]: `Bearer ${token}`,
      ...provider.extraHeaders
    };

    try {
      const appSignal = AppState.abortController?.signal;
      const response = await this.fetchWithTimeout(
        `${provider.baseUrl}${provider.chatEndpoint}`,
        { method: 'POST', headers, body: JSON.stringify(payload), signal: appSignal },
        60000
      );

      if (!response.ok) {
        const raw = await response.text();
        const parsed = this.parseProviderError(response.status, raw);
        const err = new Error(parsed.userMessage);
        err.code = parsed.code;
        err.raw  = parsed.raw;
        err.status = response.status;
        throw err;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let content = '', buffer = '', usage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // FIX W: safety valve — if buffer grows unbounded (no newlines from server)
        // discard excess to prevent memory exhaustion.
        if (buffer.length > 1_000_000) {
          console.warn('[ChatWithIt] SSE buffer overflow — truncating.');
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
          } catch (_) { /* skip malformed */ }
        }
      }

      const estimatedCompletion = Math.max(1, Math.ceil(content.length / 4));
      // FIX N: prompt tokens are unknown without server-sent usage metadata;
      // use 0 rather than fabricating a value from content length (which would
      // double-count and fill the context bar at 2× speed).
      const promptTokens     = usage?.prompt_tokens     || 0;
      const completionTokens = usage?.completion_tokens || estimatedCompletion;

      return {
        choices: [{ message: { content } }],
        usage:   { prompt_tokens: promptTokens, completion_tokens: completionTokens },
        usageEstimated: !usage?.completion_tokens,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        const err = new Error('Request cancelled by user');
        err.code = 'ABORTED';
        throw err;
      }
      throw error;
    }
  },

  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const timeoutCtrl = new AbortController();
    const timeoutId   = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
    const signals = [timeoutCtrl.signal];
    if (options.signal) signals.push(options.signal);
    const composedSignal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any(signals)
      : options.signal || timeoutCtrl.signal;
    try {
      return await fetch(url, { ...options, signal: composedSignal });
    } finally {
      clearTimeout(timeoutId);
    }
  },

  cancelRequest() {
    if (AppState.abortController) { AppState.abortController.abort(); AppState.abortController = null; }
  },

  createAbortController() {
    AppState.abortController = new AbortController();
    return AppState.abortController;
  },

  extractTokenUsage(response) {
    const usage = response?.usage;
    if (usage) return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      estimated: Boolean(response?.usageEstimated),
    };
    // FIX N: when server usage metadata is absent only estimate completion;
    // prompt token count is unknown so default to 0 to avoid double-counting.
    const content = response?.choices?.[0]?.message?.content || '';
    return {
      promptTokens:     0,
      completionTokens: Math.max(1, Math.ceil(content.length / 4)),
      estimated:        true,
    };
  },

  getParamTiers() { return PARAM_TIERS; },

  /**
   * Free-model cost reporting. Never invents prices.
   * @returns {{ available: false, label: string } | { available: true, prompt: number, completion: number }}
   */
  estimateCost(model) {
    const p = model?.pricing?.prompt;
    const c = model?.pricing?.completion;
    if (Number.isFinite(p) && Number.isFinite(c) && (p > 0 || c > 0)) {
      return { available: true, prompt: p, completion: c };
    }
    // Free / unknown pricing — be honest
    if (model?.id && (String(model.id).endsWith(':free') || (p === 0 && c === 0))) {
      return { available: false, label: 'Free (provider may still rate-limit)' };
    }
    return { available: false, label: 'Cost unavailable' };
  },
};

export default API;
