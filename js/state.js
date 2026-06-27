/**
 * Central State Management
 * Manages all application state with validation and updates
 */

const AppState = {
  // Provider & Auth
  currentProvider: 'openrouter',
  apiKey: '',
  hfToken: '',

  // Chat & Messages
  chatHistory: [],
  isTyping: false,
  currentBubble: null,

  // Models & Settings
  selectedModel: 'none',
  // selectedModelB retained: compare-mode is a planned feature with partial UI wiring
  selectedModelB: 'none',
  allModels: [],
  modelContextMap: {},
  currentPersonaPrompt: 'You are a helpful AI assistant. Be concise, accurate, and developer-friendly. Use Markdown formatting in your responses.',
  temperature: 0.7,
  maxTokens: 1024,

  // UI State
  // compareMode retained: planned feature
  compareMode: false,
  searchActive: false,
  sidebarOpen: false,
  statsOpen: false,

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
  // requestQueue: kept as a stub for future queuing implementation
  requestQueue: [],
  requestLimitPerMinute: 30,
  lastRequestTime: 0,

  /**
   * Initialize state with stored values
   */
  init() {
    this.loadPersistedState();
    this.sessionStats.startTime = Date.now();
  },

  /**
   * Load persisted state from localStorage (securely)
   */
  loadPersistedState() {
    try {
      const stored = localStorage.getItem('cwiState');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.currentProvider) this.currentProvider = parsed.currentProvider;
        if (parsed.temperature !== undefined) this.temperature = parsed.temperature;
        if (parsed.maxTokens) this.maxTokens = parsed.maxTokens;
        if (parsed.currentPersonaPrompt) this.currentPersonaPrompt = parsed.currentPersonaPrompt;
        // NOTE: API keys are intentionally NOT loaded from storage
      }
    } catch (e) {
      console.error('Failed to load persisted state:', e);
    }
  },

  /**
   * Save state to localStorage (excludes sensitive data)
   */
  persistState() {
    try {
      const safe = {
        currentProvider: this.currentProvider,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        currentPersonaPrompt: this.currentPersonaPrompt,
        // Intentionally excluding: apiKey, hfToken, chatHistory
      };
      localStorage.setItem('cwiState', JSON.stringify(safe));
    } catch (e) {
      console.error('Failed to persist state:', e);
    }
  },

  /**
   * Add message to chat history
   */
  addMessage(role, content) {
    if (!content || typeof content !== 'string') {
      console.warn('Invalid message content');
      return false;
    }
    this.chatHistory.push({ role, content, timestamp: Date.now() });
    this.sessionStats.messageCount++;
    if (role === 'assistant') {
      this.sessionStats.turnCount++;
    }
    return true;
  },

  /**
   * Update token statistics
   */
  updateTokens(promptTokens, completionTokens) {
    if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') {
      console.warn('Invalid token values');
      return false;
    }
    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;
    this.turnTokens.push({ p: promptTokens, c: completionTokens });
    return true;
  },

  /**
   * Check rate limit.
   * Returns { allowed: true } when the request can proceed immediately.
   * Returns { allowed: false, retryAfterMs: number } when the caller should
   * wait and show the user a countdown (retryAfterMs milliseconds remaining).
   */
  canMakeRequest() {
    const now = Date.now();
    const minDelayMs = Math.ceil(60000 / this.requestLimitPerMinute);
    const elapsed = now - this.lastRequestTime;
    if (elapsed >= minDelayMs) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: minDelayMs - elapsed };
  },

  /**
   * Record request time for rate limiting
   */
  recordRequest() {
    this.lastRequestTime = Date.now();
  },

  /**
   * Clear all chat data
   */
  clearChat() {
    this.chatHistory = [];
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.turnTokens = [];
    this.sessionStats.messageCount = 0;
    this.sessionStats.turnCount = 0;
  },

  /**
   * Reset to initial state
   */
  reset() {
    this.clearChat();
    this.apiKey = '';
    this.hfToken = '';
    this.selectedModel = 'none';
    this.selectedModelB = 'none';
  },

  /**
   * Get context usage percentage
   */
  getContextUsage() {
    const ctxSize = this.modelContextMap[this.selectedModel] || 8192;
    const used = this.totalPromptTokens + this.totalCompletionTokens;
    return Math.min(used / ctxSize, 1);
  },

  /**
   * Get current context limit
   */
  getContextLimit() {
    return this.modelContextMap[this.selectedModel] || 8192;
  },

  /**
   * Validate provider selection
   */
  isValidProvider(provider) {
    return provider === 'openrouter' || provider === 'huggingface';
  },

  /**
   * Get current auth token.
   * This is the canonical authentication check — prefer this over any
   * boolean isAuthenticated flag, which can go stale.
   */
  getAuthToken() {
    return this.currentProvider === 'openrouter' ? this.apiKey : this.hfToken;
  },

  /**
   * Check authentication status for a specific provider
   */
  isAuthenticatedFor(provider) {
    if (provider === 'openrouter') return !!this.apiKey;
    if (provider === 'huggingface') return !!this.hfToken;
    return false;
  },
};
// NOTE: Object.seal() removed — it silently swallowed new property assignments
// in sloppy mode and would throw in strict mode, breaking future feature additions.
