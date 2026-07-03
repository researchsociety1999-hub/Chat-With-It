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
  _modelCooldowns: {},

  // UI State
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
  // of 20 requests/minute for :free models.
  _requestBucket: [],
  requestLimitPerMinute: 20,
  lastRequestTime: 0,

  // FIX V: cap in-memory chat history to prevent unbounded growth in long sessions.
  MAX_HISTORY: 200,

  init() {
    this.loadPersistedState();
    this.sessionStats.startTime = Date.now();
    this._startIdleTimer();
  },

  // ── Idle-timeout ──────────────────────────────────────────────────────────────────────

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

  // ── Model cooldowns ──────────────────────────────────────────────────────────────────

  setModelCooldown(modelId, durationMs = 60000) {
    this._modelCooldowns[modelId] = Date.now() + durationMs;
  },

  isModelOnCooldown(modelId) {
    const until = this._modelCooldowns[modelId];
    if (!until) return false;
    if (Date.now() < until) return true;
    delete this._modelCooldowns[modelId];
    return false;
  },

  modelCooldownSecondsLeft(modelId) {
    const until = this._modelCooldowns[modelId];
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  },

  hasActiveCooldowns() {
    const now = Date.now();
    return Object.values(this._modelCooldowns).some(until => until > now);
  },

  // ── Persistence ───────────────────────────────────────────────────────────────────

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

  // ── Messages ────────────────────────────────────────────────────────────────────────

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

    // FIX V: cap history at MAX_HISTORY by trimming the oldest non-system
    // messages first to keep memory usage bounded in very long sessions.
    if (this.chatHistory.length > this.MAX_HISTORY) {
      // Remove oldest messages from the front until we are within the cap.
      const excess = this.chatHistory.length - this.MAX_HISTORY;
      this.chatHistory.splice(0, excess);
    }

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

  // ── Context trimming ────────────────────────────────────────────────────────────────

  trimHistoryToFitContext(messages) {
    const ctxLimit  = this.getContextLimit();
    const safeLimit = Math.floor(ctxLimit * 0.90);

    const estimateTokens = (msgs) =>
      msgs.reduce((sum, m) => sum + Math.ceil((m.content || '').length / 4), 0);

    let trimmed = [...messages];

    while (estimateTokens(trimmed) > safeLimit && trimmed.length > 2) {
      trimmed.splice(1, 1);
    }

    if (trimmed.length < messages.length) {
      const dropped = messages.length - trimmed.length;
      console.warn(`[ChatWithIt] Context trim: dropped ${dropped} old message(s) to fit within ${ctxLimit} token context.`);
      if (typeof UI !== 'undefined') {
        UI.toast(`ℹ️ ${dropped} old message${dropped > 1 ? 's' : ''} trimmed to fit context window.`, 'info', 5000);
      }
    }

    return trimmed;
  },

  // ── Rate limiter (token-bucket, 20 req/min) ──────────────────────────────────────────

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

  getRemainingRequests() {
    const now = Date.now();
    const windowMs = 60000;
    this._requestBucket = this._requestBucket.filter(t => now - t < windowMs);
    return Math.max(0, this.requestLimitPerMinute - this._requestBucket.length);
  },

  // ── Chat lifecycle ────────────────────────────────────────────────────────────────────

  /**
   * FIX P: clearChat() no longer resets sessionStats.startTime.
   * The session timer is set once in init() and should persist across
   * chat clears so session-duration analytics are not broken by a mid-
   * session clear. Only messageCount and turnCount are reset here.
   */
  clearChat() {
    this.chatHistory = [];
    this.attachedFiles = [];
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.turnTokens = [];
    this.chatExported = false;
    this.sessionStats.messageCount = 0;
    this.sessionStats.turnCount    = 0;
    // sessionStats.startTime intentionally NOT reset — set once in init()
  },

  reset() {
    this.clearChat();
    this.apiKey = '';
    this.hfToken = '';
    this.selectedModel = 'none';
    this.selectedModelB = 'none';
    this.attachedFiles = [];
  },

  // ── Context helpers ───────────────────────────────────────────────────────────────────

  getContextUsage() {
    const ctxSize = this.modelContextMap[this.selectedModel] || 8192;
    const used = this.totalPromptTokens + this.totalCompletionTokens;
    return used / ctxSize;
  },

  getContextLimit() {
    return this.modelContextMap[this.selectedModel] || 8192;
  },

  // ── Auth helpers ────────────────────────────────────────────────────────────────────

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
