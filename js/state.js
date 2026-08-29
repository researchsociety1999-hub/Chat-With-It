/**
 * Central State Management
 * Manages all application state with validation and updates
 */

import { Utils } from './utils.js';

export const AppState = {
  // Provider & Auth
  currentProvider: 'openrouter',
  localBaseUrl: 'http://localhost:11434/v1',
  localApiKey: '',

  // Theme and high contrast state
  theme: 'dark',
  highContrast: false,

  // FIX (Zara): API keys isolated via getter/setter — prevents direct
  // window.AppState.apiKey reads from injected scripts or extensions.
  _apiKey: '',
  _hfToken: '',
  get apiKey()    { return this._apiKey; },
  set apiKey(v)   { this._apiKey = v; },
  get hfToken()   { return this._hfToken; },
  set hfToken(v)  { this._hfToken = v; },

  // Idle-timeout: clears in-memory keys after 30 min of no activity
  _idleTimer: null,
  _idleTimeoutMs: 30 * 60 * 1000,

  // Chat & Messages
  chatHistory: [],
  isTyping: false,
  currentBubble: null,

  // ── Conversations (multi-chat, localStorage) ────────────────────────────
  // Model: a map of named conversations persisted under a single localStorage
  // key (cwiConversations). The active conversation's messages are mirrored into
  // chatHistory so all existing code works seamlessly.
  // Size policy:
  //  - soft cap of MAX_HISTORY (200) messages per conversation,
  //  - MAX_CONVERSATIONS (30) conversations — oldest evicted on overflow,
  //  - 7-day TTL on updatedAt/createdAt for the whole conversation (HISTORY_TTL_MS).
  conversations: {},
  currentConversationId: null,
  CONVERSATIONS_STORAGE_KEY: 'cwiConversations',
  MAX_CONVERSATIONS: 30,

  // File attachments (client-side only, cleared after send)
  attachedFiles: [],
  MAX_ATTACHMENTS: 5,
  MAX_FILE_SIZE: 500 * 1024, // 500 KB per file
  MAX_TOTAL_ATTACHMENT_SIZE: 2 * 1024 * 1024, // 2 MB total

  addAttachment(file) {
    if (this.attachedFiles.length >= this.MAX_ATTACHMENTS) {
      return { ok: false, error: `Maximum ${this.MAX_ATTACHMENTS} files allowed at once.` };
    }
    if (file.size > this.MAX_FILE_SIZE) {
      return { ok: false, error: `File "${file.name}" exceeds the 500 KB limit.` };
    }
    const currentTotal = this.getTotalAttachmentSize();
    if (currentTotal + file.size > this.MAX_TOTAL_ATTACHMENT_SIZE) {
      return { ok: false, error: `Total attachment size exceeds the 2 MB limit.` };
    }
    this.attachedFiles.push(file);
    return { ok: true };
  },

  removeAttachment(index) {
    if (index >= 0 && index < this.attachedFiles.length) {
      const removed = this.attachedFiles.splice(index, 1)[0];
      if (removed?.previewUrl) {
        try { URL.revokeObjectURL(removed.previewUrl); } catch (_) {}
      }
      return true;
    }
    return false;
  },

  clearAttachments() {
    this.attachedFiles.forEach(f => {
      if (f?.previewUrl) {
        try { URL.revokeObjectURL(f.previewUrl); } catch (_) {}
      }
    });
    this.attachedFiles = [];
  },

  getTotalAttachmentSize() {
    return this.attachedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  },

  // Models & Settings
  selectedModel: 'none',
  selectedModelB: 'none',
  allModels: [],
  modelContextMap: {},
  currentPersonaPrompt: 'You are a helpful AI assistant. Be concise, accurate, and developer-friendly. Use Markdown formatting in your responses.',
  defaultPersonaPrompt: 'You are a helpful AI assistant. Be concise, accurate, and developer-friendly. Use Markdown formatting in your responses.',
  temperature: 0.7,
  maxTokens: 1024,
  generationControlsEnabled: true,

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

  _requestBucket: [],
  requestLimitPerMinute: 20,
  lastRequestTime: 0,

  // FIX V: cap in-memory chat history to prevent unbounded growth in long sessions.
  MAX_HISTORY: 200,

  // Chat history persistence
  HISTORY_STORAGE_KEY: 'cwiChatHistory',
  HISTORY_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days

  init() {
    this.loadPersistedState();
    this.loadConversations();
    this._migrateLegacyHistory();
    const list = this.listConversations();
    if (list.length > 0) {
      this.switchConversation(list[0].id);
    } else {
      this.createConversation('New chat');
    }
    this.loadThemeState();
    this.sessionStats.startTime = Date.now();
    this._startIdleTimer();
  },

  // ── Theme State ──────────────────────────────────────────────────────────

  loadThemeState() {
    try {
      const theme = localStorage.getItem('cwi_theme');
      if (theme) this.theme = theme;
      const hc = localStorage.getItem('cwi_high_contrast');
      if (hc === 'true') this.highContrast = true;
    } catch (e) {
      console.error('Failed to load theme state:', e);
    }
  },

  setTheme(theme) {
    this.theme = theme;
    try { localStorage.setItem('cwi_theme', theme); } catch (e) {}
    this.applyTheme();
  },

  setHighContrast(enabled) {
    this.highContrast = enabled;
    try { localStorage.setItem('cwi_high_contrast', String(enabled)); } catch (e) {}
    this.applyHighContrast();
  },

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
  },

  applyHighContrast() {
    if (this.highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
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
    this._apiKey  = '';
    this._hfToken = '';
    this.localApiKey = '';
    if (typeof UI !== 'undefined') {
      UI.setAuthState(false, 'Session expired — please re-authenticate');
      UI.toast('⏱ Session timed out. Please re-authenticate.', 'warning', 6000);
    }
  },

  // ── Model cooldowns ───────────────────────────────────────────────────────

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

  // ── Persistence ───────────────────────────────────────────────────────────

  loadPersistedState() {
    try {
      const stored = localStorage.getItem('cwiState');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.currentProvider)           this.currentProvider      = parsed.currentProvider;
        if (parsed.localBaseUrl)              this.localBaseUrl         = parsed.localBaseUrl;
        if (parsed.temperature !== undefined)  this.temperature          = parsed.temperature;
        if (parsed.maxTokens)                  this.maxTokens            = parsed.maxTokens;
        if (parsed.generationControlsEnabled !== undefined) this.generationControlsEnabled = !!parsed.generationControlsEnabled;
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
        localBaseUrl:         this.localBaseUrl,
        temperature:          this.temperature,
        maxTokens:            this.maxTokens,
        generationControlsEnabled: this.generationControlsEnabled,
        currentPersonaPrompt: this.currentPersonaPrompt,
        paramFilter:          this.paramFilter,
        selectedModel:        this.selectedModel,
        // Intentionally excluding: apiKey, hfToken, localApiKey, chatHistory
      };
      localStorage.setItem('cwiState', JSON.stringify(safe));
    } catch (e) {
      console.error('Failed to persist state:', e);
    }
  },

  // ── Chat history & conversations persistence (7-day TTL) ─────────────────

  loadConversations() {
    this.conversations = {};
    try {
      const raw = localStorage.getItem(this.CONVERSATIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const convs = parsed?.conversations || parsed || {};
      const now   = Date.now();
      Object.values(convs).forEach(c => {
        if (!c || !c.id || !Array.isArray(c.messages)) return;
        // 7-day TTL — drop conversations untouched for longer than 7 days
        const last = c.updatedAt || c.createdAt || 0;
        if (now - last > this.HISTORY_TTL_MS) return;
        this.conversations[c.id] = {
          id:        c.id,
          title:     c.title || 'New chat',
          messages:  c.messages.slice(0, this.MAX_HISTORY),
          createdAt: c.createdAt || now,
          updatedAt: c.updatedAt || now,
        };
      });
    } catch (e) {
      console.error('Failed to load conversations:', e);
      this.conversations = {};
    }
  },

  persistConversations() {
    try {
      localStorage.setItem(this.CONVERSATIONS_STORAGE_KEY, JSON.stringify({
        savedAt:       Date.now(),
        conversations: this.conversations,
      }));
    } catch (e) {
      console.error('Failed to persist conversations:', e);
    }
  },

  // One-time migration from the legacy single-history key (cwiChatHistory)
  _migrateLegacyHistory() {
    try {
      const raw = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      localStorage.removeItem(this.HISTORY_STORAGE_KEY);
      if (!parsed || !Array.isArray(parsed.messages) || !parsed.messages.length) return;
      if (!Object.keys(this.conversations).length) {
        const id = this._genId();
        this.conversations[id] = {
          id,
          title:     this._titleFromMessages(parsed.messages),
          messages:  parsed.messages.slice(0, this.MAX_HISTORY),
          createdAt: parsed.savedAt || Date.now(),
          updatedAt: parsed.savedAt || Date.now(),
        };
        this.currentConversationId = id;
        this.persistConversations();
      }
    } catch (e) {
      console.error('Failed to migrate legacy history:', e);
    }
  },

  _genId() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  _titleFromMessages(messages) {
    const firstUser = (messages || []).find(m => m.role === 'user');
    const text = (firstUser?.content || 'New chat').replace(/\s+/g, ' ').trim();
    return text.length > 40 ? text.slice(0, 40).trimEnd() + '…' : text;
  },

  // ── Conversation API ─────────────────────────────────────────────────────

  createConversation(title) {
    const id = this._genId();
    this.conversations[id] = {
      id,
      title:      (title || '').trim() || 'New chat',
      messages:   [],
      createdAt:  Date.now(),
      updatedAt:  Date.now(),
    };
    this.currentConversationId = id;
    this.chatHistory = this.conversations[id].messages;

    // Evict oldest conversations (by updatedAt) beyond MAX_CONVERSATIONS
    const ids = Object.keys(this.conversations);
    if (ids.length > this.MAX_CONVERSATIONS) {
      ids
        .filter(x => x !== id)
        .sort((a, b) => (this.conversations[a].updatedAt || 0) - (this.conversations[b].updatedAt || 0))
        .slice(0, ids.length - this.MAX_CONVERSATIONS)
        .forEach(x => delete this.conversations[x]);
    }

    this.persistConversations();
    return id;
  },

  switchConversation(id) {
    const conv = this.conversations[id];
    if (!conv) return false;
    this.currentConversationId = id;
    this.chatHistory = conv.messages;
    this.sessionStats.messageCount = conv.messages.length;
    this.sessionStats.turnCount    = conv.messages.filter(m => m.role === 'assistant').length;
    return true;
  },

  renameConversation(id, title) {
    const conv = this.conversations[id];
    if (!conv) return false;
    conv.title = (title || '').trim().slice(0, 60) || 'New chat';
    conv.updatedAt = Date.now();
    this.persistConversations();
    return true;
  },

  deleteConversation(id) {
    const conv = this.conversations[id];
    if (!conv) return false;
    delete this.conversations[id];
    if (this.currentConversationId === id) {
      const next = this.listConversations()[0];
      if (next) this.switchConversation(next.id);
      else this.createConversation('New chat');
    }
    this.persistConversations();
    return true;
  },

  listConversations() {
    return Object.values(this.conversations)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  searchConversations(query) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results = [];
    const convs = this.listConversations();

    for (const conv of convs) {
      const titleMatch = (conv.title || '').toLowerCase().includes(q);
      let matchedSnippet = null;
      let matchedMsgIndex = -1;

      // Scan messages from newest to oldest for best snippet
      if (Array.isArray(conv.messages)) {
        for (let i = conv.messages.length - 1; i >= 0; i--) {
          const msg = conv.messages[i];
          const content = msg?.content || '';
          const idx = content.toLowerCase().indexOf(q);
          if (idx !== -1) {
            const start = Math.max(0, idx - 25);
            const end = Math.min(content.length, idx + q.length + 35);
            let snippet = content.slice(start, end).replace(/\s+/g, ' ');
            if (start > 0) snippet = '…' + snippet;
            if (end < content.length) snippet += '…';
            matchedSnippet = snippet;
            matchedMsgIndex = i;
            break;
          }
        }
      }

      if (titleMatch || matchedSnippet !== null) {
        results.push({
          id: conv.id,
          title: conv.title || 'New chat',
          snippet: matchedSnippet,
          messageIndex: matchedMsgIndex,
          updatedAt: conv.updatedAt || conv.createdAt || Date.now(),
          titleMatch,
        });
      }
    }

    return results;
  },

  loadPersistedHistory() {
    this.loadConversations();
  },

  persistHistory() {
    // When a message is added or cleared in the active conversation, sync into the conversations map
    if (this.currentConversationId && this.conversations[this.currentConversationId]) {
      const conv = this.conversations[this.currentConversationId];
      conv.messages = this.chatHistory;
      conv.updatedAt = Date.now();
      if (conv.title === 'New chat') {
        const autoTitle = this._titleFromMessages(this.chatHistory);
        if (autoTitle && autoTitle !== 'New chat') conv.title = autoTitle;
      }
    }
    this.persistConversations();
  },

  clearPersistedHistory() {
    if (this.currentConversationId && this.conversations[this.currentConversationId]) {
      this.conversations[this.currentConversationId].messages = [];
      this.conversations[this.currentConversationId].updatedAt = Date.now();
      this.persistConversations();
    }
  },

  // ── Messages ──────────────────────────────────────────────────────────────

  addMessage(role, content, model = null) {
    if (!content || typeof content !== 'string') {
      console.warn('Invalid message content');
      return false;
    }
    const msg = { role, content, timestamp: Date.now() };
    if (model) msg.model = model;
    this.chatHistory.push(msg);
    if (role === 'assistant') this.sessionStats.turnCount++;
    this.chatExported = false;
    this._resetIdleTimer();

    // FIX V: cap history at MAX_HISTORY by trimming the oldest messages first.
    if (this.chatHistory.length > this.MAX_HISTORY) {
      const excess = this.chatHistory.length - this.MAX_HISTORY;
      this.chatHistory.splice(0, excess);
    }

    // FIX: sync messageCount to actual array length AFTER any trim,
    // so the stats panel never shows a count higher than reality.
    this.sessionStats.messageCount = this.chatHistory.length;

    this.persistHistory();
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

  // ── Context trimming ──────────────────────────────────────────────────────

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

  getRemainingRequests() {
    const now = Date.now();
    const windowMs = 60000;
    this._requestBucket = this._requestBucket.filter(t => now - t < windowMs);
    return Math.max(0, this.requestLimitPerMinute - this._requestBucket.length);
  },

  // ── Chat lifecycle ────────────────────────────────────────────────────────

  /**
   * FIX P: clearChat() does NOT reset sessionStats.startTime.
   * The session timer is set once in init() and persists across chat clears.
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
    this.clearPersistedHistory();
    // sessionStats.startTime intentionally NOT reset — set once in init()
  },

  reset() {
    this.clearChat();
    this._apiKey  = '';
    this._hfToken = '';
    this.localApiKey = '';
    this.selectedModel = 'none';
    this.selectedModelB = 'none';
    this.attachedFiles = [];
  },

  // ── Context helpers ───────────────────────────────────────────────────────

  getContextUsage() {
    const ctxSize = this.modelContextMap[this.selectedModel] || 8192;
    const used = this.totalPromptTokens + this.totalCompletionTokens;
    return used / ctxSize;
  },

  getContextLimit() {
    return this.modelContextMap[this.selectedModel] || 8192;
  },

  // ── Auth helpers ──────────────────────────────────────────────────────────

  isValidProvider(provider) {
    return provider === 'openrouter' || provider === 'huggingface' || provider === 'local';
  },

  getAuthToken() {
    if (this.currentProvider === 'openrouter') return this._apiKey;
    if (this.currentProvider === 'huggingface') return this._hfToken;
    if (this.currentProvider === 'local') return this.localApiKey || '';
    return '';
  },

  isAuthenticatedFor(provider) {
    if (provider === 'openrouter') return !!this._apiKey;
    if (provider === 'huggingface') return !!this._hfToken;
    if (provider === 'local') return true; // Local endpoint does not require mandatory key
    return false;
  },
};

export default AppState;
