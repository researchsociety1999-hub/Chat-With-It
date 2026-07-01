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
  // Used by App to decide whether the cached list is stale (> 5 min).
  lastModelFetch: 0,

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
  // Token-bucket for rate limiting — stores timestamps of recent requests.
  // FIX: lowered to 20 req/min to match OpenRouter's documented free-tier cap.
  // (Previous value of 30 allowed the client to exceed the provider limit.)
  _requestBucket: [],
  requestLimitPerMinute: 20,
  lastRequestTime: 0,

  // Per-model cooldown map: modelId -> timestamp when cooldown expires.
  // Populated by API when an upstream 429 is detected for a specific model.
  // FIX: lets the UI flag temporarily overloaded models without removing them.
  _modelCooldowns: {},
  _modelCooldownMs: 60000, // 60 s cooldown per upstream-rate-limited model

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
    // Clear in-memory credentials after 30 min inactivity
    this.apiKey  = '';
    this.hfToken = '';
    if (typeof UI !== 'undefined') {
      UI.setAuthState(false, 'Session expired — please re-authenticate');
      UI.toast('⏱ Session timed out. Please re-authenticate.', 'warning', 6000);
    }
  },

  // ── Persistence ──────────────────────────────────────────────────────────

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

  // ── Per-model cooldown (upstream 429 handling) ────────────────────────────

  /**
   * Mark a model as temporarily rate-limited by the upstream provider.
   * The model remains in the list but isModelOnCooldown() returns true for
   * _modelCooldownMs (60 s) so the UI can badge it as ⚠️ overloaded.
   */
  setModelCooldown(modelId) {
    if (!modelId) return;
    this._modelCooldowns[modelId] = Date.now() + this._modelCooldownMs;
  },

  /**
   * Returns true if the model hit an upstream 429 within the last 60 s.
   * Expired entries are lazily pruned on read.
   */
  isModelOnCooldown(modelId) {
    if (!modelId || !this._modelCooldowns[modelId]) return false;
    if (Date.now() > this._modelCooldowns[modelId]) {
      delete this._modelCooldowns[modelId];
      return false;
    }
    return true;
  },

  // ── Chat lifecycle ────────────────────────────────────────────────────────

  clearChat() {
    this.chatHistory = [];
    this.attachedFiles = [];
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.turnTokens = [];
    this.sessionStats.messageCount = 0;
    this.sessionStats.turnCount = 0;
    // FIX: reset startTime so the session timer is accurate after clearing
    this.sessionStats.startTime = Date.now();
    // FIX: reset export guard so beforeunload fires for the new session
    this.chatExported = false;
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
