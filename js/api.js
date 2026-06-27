/**
 * API Handler
 * Manages all API requests with error handling, retry logic, and request cancellation
 */

const PROVIDERS = {
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

const CURATED_FREE = {
  openrouter: [
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Reasoning · 64k)', ctx: 65536 },
    { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek Chat v3 (64k)', ctx: 65536 },
    { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (1M ctx)', ctx: 1048576 },
    { id: 'meta-llama/llama-4-scout:free', name: 'Llama 4 Scout (512k ctx)', ctx: 524288 },
    { id: 'qwen/qwen3-30b-a3b:free', name: 'Qwen3 30B A3B (128k)', ctx: 131072 },
    { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B IT (128k)', ctx: 131072 },
    { id: 'mistralai/devstral-small:free', name: 'Devstral Small (32k)', ctx: 32768 },
    { id: 'openchat/openchat-7b:free', name: 'OpenChat 7B (8k)', ctx: 8192 }
  ],
  huggingface: [
    { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', ctx: 8192, provider: 'Providers' },
    { id: 'meta-llama/Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B Instruct', ctx: 8192, provider: 'Providers' },
    { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct v0.3', ctx: 32768, provider: 'Providers' },
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B Instruct', ctx: 32768, provider: 'Providers' },
    { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', ctx: 131072, provider: 'Providers' },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', ctx: 131072, provider: 'Providers' }
  ]
};

const API = {
  /**
   * Get provider config
   */
  getProvider(providerName = AppState.currentProvider) {
    return PROVIDERS[providerName] || PROVIDERS.openrouter;
  },

  /**
   * Fetch available models
   */
  async fetchModels(providerName = AppState.currentProvider) {
    const provider = this.getProvider(providerName);
    const token = providerName === 'openrouter' ? AppState.apiKey : AppState.hfToken;

    if (!token) {
      console.warn('No authentication token available');
      return CURATED_FREE[providerName] || [];
    }

    try {
      const headers = {
        [provider.authHeader]: `Bearer ${token}`,
        ...provider.extraHeaders
      };

      const response = await this.fetchWithTimeout(
        `${provider.baseUrl}${provider.modelEndpoint}`,
        { headers },
        10000
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.processModels(data, providerName);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return CURATED_FREE[providerName] || [];
    }
  },

  /**
   * Process and normalize models from API response
   */
  processModels(data, providerName) {
    let models = [];

    if (providerName === 'openrouter') {
      models = (data.data || [])
        .filter(m => m.id && m.id.endsWith(':free'))
        .map(m => ({
          id: m.id,
          name: `${m.name || m.id} (${Math.round((m.context_length || 8192) / 1000)}k)`,
          ctx: m.context_length || 8192
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const freeIds = new Set(CURATED_FREE.huggingface.map(m => m.id));
      models = (data.data || [])
        .filter(m => freeIds.has(m.id))
        .map(m => {
          const curated = CURATED_FREE.huggingface.find(c => c.id === m.id);
          return {
            id: m.id,
            name: curated?.name || m.id,
            ctx: curated?.ctx || 8192,
            provider: curated?.provider || 'Providers'
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return models.length > 0 ? models : CURATED_FREE[providerName];
  },

  /**
   * @deprecated Use sendMessageStream() instead.
   * Kept for backward compatibility; delegates to sendMessageStream.
   */
  async sendMessage(messages, modelId, options = {}) {
    return this.sendMessageStream(messages, modelId, null, options);
  },

  /**
   * Send message with real-time streaming.
   * Calls onToken(delta) for every text chunk as it arrives.
   * Returns { choices, usage } — usage has prompt/completion token counts
   * (from the provider's final SSE chunk when available, otherwise estimated).
   */
  async sendMessageStream(messages, modelId, onToken, options = {}) {
    const rateCheck = AppState.canMakeRequest();
    if (!rateCheck.allowed) {
      throw Object.assign(
        new Error(`Rate limited. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.`),
        { retryAfterMs: rateCheck.retryAfterMs }
      );
    }

    AppState.recordRequest();
    const provider = this.getProvider();
    const token = AppState.getAuthToken();

    if (!token) {
      throw new Error('Not authenticated. Please provide API credentials.');
    }

    const payload = {
      model: modelId,
      messages: messages,
      temperature: options.temperature ?? AppState.temperature,
      max_tokens: options.maxTokens ?? AppState.maxTokens,
      top_p: options.topP ?? 0.95,
      stream: true,
    };

    const headers = {
      'Content-Type': 'application/json',
      [provider.authHeader]: `Bearer ${token}`,
      ...provider.extraHeaders
    };

    try {
      const response = await this.fetchWithTimeout(
        `${provider.baseUrl}${provider.chatEndpoint}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AppState.abortController?.signal
        },
        60000
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error ${response.status}: ${error}`);
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
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const chunk = JSON.parse(data);
              if (chunk.usage) usage = chunk.usage;
              const delta = chunk.choices?.[0]?.delta?.content || '';
              content += delta;
              if (delta && onToken) onToken(delta);
            } catch (e) { /* skip malformed JSON */ }
          }
        }
      }

      const promptTokens = usage?.prompt_tokens ?? Math.ceil(
        messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4
      );
      const completionTokens = usage?.completion_tokens ?? Math.ceil(content.length / 4);

      return {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request cancelled by user');
      }
      throw error;
    }
  },

  /**
   * Fetch with timeout
   */
  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Cancel current request
   */
  cancelRequest() {
    if (AppState.abortController) {
      AppState.abortController.abort();
      AppState.abortController = null;
    }
  },

  /**
   * Create new abort controller for next request
   */
  createAbortController() {
    AppState.abortController = new AbortController();
    return AppState.abortController;
  },

  /**
   * Extract token usage from a sendMessageStream response object.
   * Always returns valid numbers — uses provider counts when present,
   * otherwise falls back to the char-based estimates baked into the response.
   */
  extractTokenUsage(response) {
    const usage = response?.usage;
    if (usage) {
      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0
      };
    }
    // Streaming responses often lack usage — estimate from content (~4 chars/token)
    const content = response?.choices?.[0]?.message?.content || '';
    return { promptTokens: 0, completionTokens: Math.ceil(content.length / 4) };
  },
};
