/**
 * Central State Management
 * Manages all application state with validation and updates
 */

const AppState = {
  // Provider & Auth
  currentProvider: 'openrouter',
  apiKey: '',
  hfToken: '',

  // Idle-timeout: clears in-memory keys after 30 min of no activity
  _idleTimer: null,
  _idleTimeoutMs: 30 * 60 * 1000,

  // Chat & Messages
  chatHistory: [],
  isTyping: false,
  currentBubble: null,

  // File attachments (reserved for future file-upload feature)
  attachedFiles: [],

  // Models & Settings
  selectedModel: 'none',
  selectedModelB: 'none', // TODO: roadmap — A/B model comparison (compareMode below)
  allModels: [],
  modelContextMap: {},
  currentPersonaPrompt: 'You are a helpful AI assistant. Be concise, accurate, and developer-friendly. Use Markdown formatting in your responses.',
  defaultPersonaPrompt: 'You are a helpful AI assistant. Be concise, accurate, and developer-friendly. Use Markdown formatting in your responses.',
  temperature: 0.7,
  maxTokens: 1024,

  // Model size filter
  paramFilter: 'all',

  // Timestamp of the last successful model list fetch (ms since epoch).
  lastModelFetch: 0,

  // Per-model cooldown map: modelId → timestamp until which the model should be
  // treated as temporarily unavailable due to an upstream 429.
  // FIX: added so upstream-rate-limited models are flagged for 60 s rather than
  // purged from the list or silently retried.
  _modelCooldowns: {},

  // UI State
  // TODO: roadmap — compareMode / selectedModelB: side-by-side A/B model view.
  compareMode: false,
  searchActive: false,
  sidebarOpen: false,
  statsOpen: false,

  // Export guard: true after a successful export so beforeunload skips the warning
  chatExported: false,

  // Analytics
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  turnTokens: [],
  sessionStats: {
    startTime: null,
    messageCount: 0,
    turnCount: 0,
  },

  // Search & Filter
  searchMatches: [],
  searchCurrent: 0,
  searchQuery: '',

  // API Requests
  abortController: null,

  // FIX: lowered from 30 to 20 to match OpenRouter's documented free-tier cap
  // of 20 requests/minute for :free models. Previously the local guard allowed
  // up to 30 req/min, meaning OpenRouter's own 429 fired before the client
  // could defend the user with a friendly message.
  // Ref: https://openrouter.ai/docs/api-reference/limits
  _requestBucket: [],
  requestLimitPerMinute: 20,
  lastRequestTime: 0,

  init() {
    this.loadPersistedState();
    this.sessionStats.startTime = Date.now();
    this._startIdleTimer();
  },

  // ── Idle-timeout ──────────────────────────────────────────────────────────

  _startIdleTimer() {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => this._onIdle(), this._idleTimeoutMs);
  },

  _clearIdleTimer() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
  },

  _resetIdleTimer() {
    this._startIdleTimer();
  },

  _onIdle() {
    this.apiKey  = '';
    this.hfToken = '';
    if (typeof UI !== 'undefined') {
      UI.setAuthState(false, 'Session expired — please re-authenticate');
      UI.toast('⏱ Session timed out. Please re-authenticate.', 'warning', 6000);
    }
  },

  // ── Model cooldowns ───────────────────────────────────────────────────────

  /**
   * Mark a model as temporarily rate-limited for `durationMs` milliseconds.
   * While in cooldown the model stays in the list but App shows it as unavailable.
   */
  setModelCooldown(modelId, durationMs = 60000) {
    this._modelCooldowns[modelId] = Date.now() + durationMs;
  },

  /**
   * Returns true if the model is currently in its upstream cooldown window.
   */
  isModelOnCooldown(modelId) {
    const until = this._modelCooldowns[modelId];
    if (!until) return false;
    if (Date.now() < until) return true;
    delete this._modelCooldowns[modelId]; // auto-expire
    return false;
  },

  /**
   * Remaining cooldown seconds for display, or 0 if not on cooldown.
   */
  modelCooldownSecondsLeft(modelId) {
    const until = this._modelCooldowns[modelId];
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  },

  // ── Persistence ───────────────────────────────────────────────────────────

  loadPersistedState() {
    try {
      const stored = localStorage.getItem('cwiState');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.currentProvider)           this.currentProvider      = parsed.currentProvider;
        if (parsed.temperature !== undefined)  this.temperature          = parsed.temperature;
        if (parsed.maxTokens)                  this.maxTokens            = parsed.maxTokens;
        if (parsed.currentPersonaPrompt)       this.currentPersonaPrompt = parsed.currentPersonaPrompt;
        if (parsed.paramFilter)                this.paramFilter          = parsed.paramFilter;
        if (parsed.selectedModel && parsed.selectedModel !== 'none') {
          this.selectedModel = parsed.selectedModel;
        }
        // NOTE: API keys are intentionally NOT loaded from storage
      }
    } catch (e) {
      console.error('Failed to load persisted state:', e);
    }
  },

  persistState() {
    try {
      const safe = {
        currentProvider:      this.currentProvider,
        temperature:          this.temperature,
        maxTokens:            this.maxTokens,
        currentPersonaPrompt: this.currentPersonaPrompt,
        paramFilter:          this.paramFilter,
        selectedModel:        this.selectedModel,
        // Intentionally excluding: apiKey, hfToken, chatHistory
      };
      localStorage.setItem('cwiState', JSON.stringify(safe));
    } catch (e) {
      console.error('Failed to persist state:', e);
    }
  },

  // ── Messages ──────────────────────────────────────────────────────────────

  addMessage(role, content) {
    if (!content || typeof content !== 'string') {
      console.warn('Invalid message content');
      return false;
    }
    this.chatHistory.push({ role, content, timestamp: Date.now() });
    this.sessionStats.messageCount++;
    if (role === 'assistant') this.sessionStats.turnCount++;
    this.chatExported = false;
    this._resetIdleTimer();
    return true;
  },

  updateTokens(promptTokens, completionTokens) {
    if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') {
      console.warn('Invalid token values');
      return false;
    }
    this.totalPromptTokens    += promptTokens;
    this.totalCompletionTokens += completionTokens;
    this.turnTokens.push({ p: promptTokens, c: completionTokens });
    return true;
  },

  // ── Rate limiter (token-bucket, 20 req/min) ───────────────────────────────

  canMakeRequest() {
    const now = Date.now();
    const windowMs = 60000;
    this._requestBucket = this._requestBucket.filter(t => now - t < windowMs);
    if (this._requestBucket.length < this.requestLimitPerMinute) {
      return { allowed: true, retryAfterMs: 0 };
    }
    const oldest = this._requestBucket[0];
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  },

  recordRequest() {
    this.lastRequestTime = Date.now();
    this._requestBucket.push(this.lastRequestTime);
    this._resetIdleTimer();
  },

  /**
   * Helper for stats panel: number of requests remaining in the current
   * 60-second window according to the local token-bucket.
   */
  getRemainingRequests() {
    const now = Date.now();
    const windowMs = 60000;
    this._requestBucket = this._requestBucket.filter(t => now - t < windowMs);
    return Math.max(0, this.requestLimitPerMinute - this._requestBucket.length);
  },

  // ── Chat lifecycle ────────────────────────────────────────────────────────

  clearChat() {
    this.chatHistory = [];
    this.attachedFiles = [];
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.turnTokens = [];
    this.chatExported = false;
    // FIX: reset session timer so the stats panel shows time-in-session for
    // the new conversation, not elapsed time since page load.
    this.sessionStats = {
      startTime:    Date.now(),
      messageCount: 0,
      turnCount:    0,
    };
  },

  reset() {
    this.clearChat();
    this.apiKey = '';
    this.hfToken = '';
    this.selectedModel = 'none';
    this.selectedModelB = 'none';
    this.attachedFiles = [];
  },

  // ── Context helpers ───────────────────────────────────────────────────────

  getContextUsage() {
    const ctxSize = this.modelContextMap[this.selectedModel] || 8192;
    const used = this.totalPromptTokens + this.totalCompletionTokens;
    return Math.min(used / ctxSize, 1);
  },

  getContextLimit() {
    return this.modelContextMap[this.selectedModel] || 8192;
  },

  // ── Auth helpers ──────────────────────────────────────────────────────────

  isValidProvider(provider) {
    return provider === 'openrouter' || provider === 'huggingface';
  },

  getAuthToken() {
    return this.currentProvider === 'openrouter' ? this.apiKey : this.hfToken;
  },

  isAuthenticatedFor(provider) {
    if (provider === 'openrouter') return !!this.apiKey;
    if (provider === 'huggingface') return !!this.hfToken;
    return false;
  },
};
