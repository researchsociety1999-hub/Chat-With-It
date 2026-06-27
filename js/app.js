/**
 * Main Application Controller
 * Orchestrates state, UI, and API interactions
 */

const App = {
  /**
   * Initialize application
   */
  async init() {
    try {
      AppState.init();
      UI.loadTheme();

      this.setupProviderListeners();
      this.setupAuthListeners();
      this.setupModelListeners();
      this.setupChatListeners();
      this.setupUIListeners();
      this.setupSearchListeners();
      this.setupExportListeners();

      await this.refreshModels();

      UI.toast('\u2705 ChatWithIt loaded successfully', 'success');
      console.log('Application initialized');
    } catch (error) {
      console.error('Initialization error:', error);
      UI.toast('Failed to initialize application', 'error');
    }
  },

  /**
   * Setup provider selection listeners
   */
  setupProviderListeners() {
    const providerSelect = UI.el('providerSelect');
    providerSelect.addEventListener('change', (e) => {
      AppState.currentProvider = e.target.value;
      this.updateAuthUI();
      AppState.persistState();
    });
    this.updateAuthUI();
  },

  /**
   * Update auth UI based on provider
   */
  updateAuthUI() {
    const isOR = AppState.currentProvider === 'openrouter';
    UI.el('or-auth-section').style.display = isOR ? 'flex' : 'none';
    UI.el('hf-auth-section').style.display = isOR ? 'none' : 'flex';
  },

  /**
   * Setup authentication listeners
   */
  setupAuthListeners() {
    UI.el('authBtn').addEventListener('click', () => this.authenticateOpenRouter());
    UI.el('clearOrKey').addEventListener('click', () => this.clearAuth('openrouter'));
    UI.el('hfAuthBtn').addEventListener('click', () => this.authenticateHuggingFace());
    UI.el('clearHfKey').addEventListener('click', () => this.clearAuth('huggingface'));

    UI.el('apiKey').addEventListener('blur', () => {
      const key = UI.el('apiKey').value.trim();
      if (key && Utils.isValidApiKey(key)) {
        AppState.apiKey = key;
        UI.setStatus('\u2713 OpenRouter authenticated', 'ok');
      }
    });

    UI.el('hfToken').addEventListener('blur', () => {
      const token = UI.el('hfToken').value.trim();
      if (token && Utils.isValidApiKey(token)) {
        AppState.hfToken = token;
        UI.setStatus('\u2713 Hugging Face authenticated', 'ok', true);
      }
    });
  },

  /**
   * Authenticate with OpenRouter
   */
  async authenticateOpenRouter() {
    const key = UI.el('apiKey').value.trim();
    if (!key) { UI.setStatus('Please enter your API key', 'error'); return; }
    if (!Utils.isValidApiKey(key)) { UI.setStatus('API key appears to be invalid', 'error'); return; }
    AppState.apiKey = key;
    UI.setStatus('\u2713 Authenticated with OpenRouter', 'ok');
    UI.toast('\u2705 OpenRouter authenticated', 'success');
    await this.refreshModels();
  },

  /**
   * Authenticate with Hugging Face
   */
  async authenticateHuggingFace() {
    const token = UI.el('hfToken').value.trim();
    if (!token) { UI.setStatus('Please enter your HF token', 'error', true); return; }
    if (!Utils.isValidApiKey(token)) { UI.setStatus('Token appears to be invalid', 'error', true); return; }
    AppState.hfToken = token;
    UI.setStatus('\u2713 Authenticated with Hugging Face', 'ok', true);
    UI.toast('\u2705 Hugging Face authenticated', 'success');
    await this.refreshModels();
  },

  /**
   * Clear authentication
   */
  clearAuth(provider) {
    if (provider === 'openrouter') {
      AppState.apiKey = '';
      UI.el('apiKey').value = '';
      UI.setStatus('OpenRouter key cleared', 'info');
    } else {
      AppState.hfToken = '';
      UI.el('hfToken').value = '';
      UI.setStatus('Hugging Face token cleared', 'info', true);
    }
    UI.toast(`\uD83D\uDDD1\uFE0F ${provider} credentials removed`, 'warning');
  },

  /**
   * Refresh available models
   */
  async refreshModels() {
    try {
      UI.setStatus('Fetching models...', 'info');
      const models = await API.fetchModels();
      AppState.allModels = models;
      models.forEach(m => AppState.modelContextMap[m.id] = m.ctx);
      UI.populateModels(models);
      UI.setStatus(`\u2713 ${models.length} models loaded`, 'ok');
      UI.toast(`\u2705 ${models.length} models available`, 'success');
    } catch (error) {
      console.error('Failed to refresh models:', error);
      UI.setStatus('Failed to fetch models', 'error');
      UI.toast('Error loading models', 'error');
    }
  },

  /**
   * Setup model selection listeners
   */
  setupModelListeners() {
    UI.el('modelSelect').addEventListener('change', (e) => {
      AppState.selectedModel = e.target.value;
      UI.updateBadge();
    });
    UI.el('modelSelectB').addEventListener('change', (e) => {
      AppState.selectedModelB = e.target.value;
    });
    UI.el('refreshModels').addEventListener('click', () => this.refreshModels());
  },

  /**
   * Setup chat listeners
   */
  setupChatListeners() {
    const userInput = UI.el('userInput');
    const sendBtn = UI.el('sendBtn');

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    userInput.addEventListener('input', (e) => {
      UI.updateCharCount(e.target.value.length);
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    });

    sendBtn.addEventListener('click', () => this.sendMessage());
  },

  /**
   * Send message with real-time token streaming.
   * Respects rate limiting — shows a countdown toast instead of silently dropping.
   */
  async sendMessage() {
    const input = UI.el('userInput');
    const message = input.value.trim();

    if (!message) { UI.toast('Message cannot be empty', 'warning'); return; }
    if (AppState.selectedModel === 'none') { UI.toast('Please select a model first', 'warning'); return; }
    if (!AppState.getAuthToken()) { UI.toast('Please authenticate first', 'error'); return; }

    // Rate limit check — show countdown instead of silent drop
    const rateCheck = AppState.canMakeRequest();
    if (!rateCheck.allowed) {
      const secs = Math.ceil(rateCheck.retryAfterMs / 1000);
      UI.toast(`\u23F3 Rate limited \u2014 try again in ${secs}s`, 'warning');
      return;
    }

    try {
      UI.showChat();
      UI.appendMessage('user', message);
      AppState.addMessage('user', message);
      input.value = '';
      UI.updateCharCount(0);
      input.style.height = 'auto';

      UI.setSendButtonState(false);
      UI.showTyping();

      const messages = [
        { role: 'system', content: AppState.currentPersonaPrompt },
        ...AppState.chatHistory.map(m => ({ role: m.role, content: m.content }))
      ];

      API.createAbortController();
      UI.removeTyping();
      const streamBubble = UI.createStreamBubble();

      const response = await API.sendMessageStream(
        messages,
        AppState.selectedModel,
        (delta) => UI.appendStreamToken(streamBubble, delta),
        { temperature: AppState.temperature, maxTokens: AppState.maxTokens }
      );

      const assistantMessage = response.choices?.[0]?.message?.content || 'No response';
      UI.finaliseStreamBubble(streamBubble, assistantMessage);
      AppState.addMessage('assistant', assistantMessage);

      const usage = API.extractTokenUsage(response);
      AppState.updateTokens(usage.promptTokens, usage.completionTokens);
      UI.updateStats(AppState.totalPromptTokens, AppState.totalCompletionTokens);
    } catch (error) {
      UI.removeTyping();
      console.error('Message send error:', error);
      const errorMsg = error.message || 'Failed to get response';
      UI.toast(`Error: ${errorMsg}`, 'error');
      UI.appendMessage('assistant', `\u274C Error: ${errorMsg}`);
    } finally {
      UI.setSendButtonState(true);
    }
  },

  /**
   * Setup UI listeners
   */
  setupUIListeners() {
    // Sidebar
    UI.el('sidebarToggle').addEventListener('click', () => UI.toggleSidebar());
    UI.el('mobileOverlay').addEventListener('click', () => UI.toggleSidebar());

    // Stats panel
    UI.el('statsBtn').addEventListener('click', () => UI.toggleStats());
    UI.el('rp-close').addEventListener('click', () => UI.toggleStats());

    // Clear chat
    UI.el('clearBtn').addEventListener('click', () => {
      if (confirm('Clear all messages? This cannot be undone.')) {
        UI.clearChat();
        UI.toast('Chat cleared', 'info');
      }
    });

    // Theme menu
    UI.el('themeBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      UI.el('theme-menu').classList.toggle('open');
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      const themeMenu = UI.el('theme-menu');
      if (themeMenu && !themeMenu.contains(e.target) && e.target !== UI.el('themeBtn')) {
        themeMenu.classList.remove('open');
      }
      const exportMenu = UI.el('export-menu');
      if (exportMenu && !exportMenu.contains(e.target) && e.target !== UI.el('exportBtn')) {
        exportMenu.classList.remove('open');
      }
    });

    // Theme options
    document.querySelectorAll('.theme-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        const theme = e.target.dataset.theme;
        UI.setTheme(theme);
        UI.el('theme-menu').classList.remove('open');
        UI.toast(`Theme changed to ${e.target.textContent}`, 'info');
      });
    });

    // Settings sliders
    UI.el('tempSlider').addEventListener('input', (e) => {
      AppState.temperature = parseFloat(e.target.value);
      UI.el('tempVal').textContent = e.target.value;
      AppState.persistState();
    });
    UI.el('maxTokensSlider').addEventListener('input', (e) => {
      AppState.maxTokens = parseInt(e.target.value);
      UI.el('maxTokensVal').textContent = e.target.value;
      AppState.persistState();
    });

    // Persona cards
    document.querySelectorAll('.persona-card').forEach(card => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        AppState.currentPersonaPrompt = e.currentTarget.dataset.prompt;
        AppState.persistState();
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });

    // Restore active persona card from persisted state
    const savedPrompt = AppState.currentPersonaPrompt;
    document.querySelectorAll('.persona-card').forEach(card => {
      if (card.dataset.prompt === savedPrompt) card.classList.add('active');
    });

    // Escape key: close shortcuts modal (and any open dropdown)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = UI.el('shortcuts-modal');
        if (modal) modal.classList.remove('open');
        const exportMenu = UI.el('export-menu');
        if (exportMenu) exportMenu.classList.remove('open');
        const themeMenu = UI.el('theme-menu');
        if (themeMenu) themeMenu.classList.remove('open');
      }
    });
  },

  /**
   * Setup search listeners
   */
  setupSearchListeners() {
    UI.el('searchBtn').addEventListener('click', () => UI.showSearchOverlay());
    UI.el('search-close').addEventListener('click', () => UI.hideSearchOverlay());
    UI.el('search-input-box').addEventListener('input', (e) => this.searchMessages(e.target.value));
    UI.el('search-prev').addEventListener('click', () => this.navigateSearch(-1));
    UI.el('search-next').addEventListener('click', () => this.navigateSearch(1));
  },

  /**
   * Search messages
   */
  searchMessages(query) {
    AppState.searchQuery = query.toLowerCase();
    if (!AppState.searchQuery) {
      AppState.searchMatches = [];
      UI.el('search-results-count').textContent = '';
      return;
    }
    const bubbles = UI.el('chat').querySelectorAll('.bubble');
    AppState.searchMatches = [];
    bubbles.forEach(bubble => {
      if (bubble.textContent.toLowerCase().includes(AppState.searchQuery)) {
        AppState.searchMatches.push(bubble);
      }
    });
    AppState.searchCurrent = 0;
    this.highlightSearchResult();
    UI.el('search-results-count').textContent = `${AppState.searchMatches.length} results`;
  },

  /**
   * Navigate search results
   */
  navigateSearch(direction) {
    if (AppState.searchMatches.length === 0) return;
    AppState.searchCurrent += direction;
    if (AppState.searchCurrent < 0) AppState.searchCurrent = AppState.searchMatches.length - 1;
    if (AppState.searchCurrent >= AppState.searchMatches.length) AppState.searchCurrent = 0;
    this.highlightSearchResult();
  },

  /**
   * Highlight current search result
   */
  highlightSearchResult() {
    document.querySelectorAll('.search-highlight.current').forEach(el => el.classList.remove('current'));
    if (AppState.searchMatches.length > 0) {
      const current = AppState.searchMatches[AppState.searchCurrent];
      const highlight = current.querySelector('.search-highlight');
      if (highlight) {
        highlight.classList.add('current');
        highlight.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  },

  /**
   * Setup export listeners
   */
  setupExportListeners() {
    UI.el('exportBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      UI.toggleExportMenu();
    });
    UI.el('expMD').addEventListener('click', () => { this.exportAs('markdown'); UI.toggleExportMenu(); });
    UI.el('expJSON').addEventListener('click', () => { this.exportAs('json'); UI.toggleExportMenu(); });
    UI.el('expTXT').addEventListener('click', () => { this.exportAs('text'); UI.toggleExportMenu(); });
  },

  /**
   * Export conversation
   */
  exportAs(format) {
    if (AppState.chatHistory.length === 0) { UI.toast('No messages to export', 'warning'); return; }
    let content = '';
    const timestamp = new Date().toISOString();
    if (format === 'markdown') {
      content = `# ChatWithIt Conversation\n\n*Exported: ${timestamp}*\n\n`;
      AppState.chatHistory.forEach(msg => {
        const role = msg.role === 'user' ? '\uD83D\uDC64 You' : '\uD83E\uDD16 AI';
        content += `## ${role}\n\n${msg.content}\n\n---\n\n`;
      });
    } else if (format === 'json') {
      content = JSON.stringify({
        exported: timestamp,
        model: AppState.selectedModel,
        messages: AppState.chatHistory,
        stats: {
          totalTokens: AppState.totalPromptTokens + AppState.totalCompletionTokens,
          promptTokens: AppState.totalPromptTokens,
          completionTokens: AppState.totalCompletionTokens
        }
      }, null, 2);
    } else {
      content = `ChatWithIt Conversation\nExported: ${timestamp}\n\n`;
      AppState.chatHistory.forEach(msg => {
        content += `[${msg.role === 'user' ? 'You' : 'AI'}] ${msg.content}\n\n`;
      });
    }
    const ext = format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt';
    const mime = format === 'markdown' ? 'text/markdown' : format === 'json' ? 'application/json' : 'text/plain';
    Utils.downloadAsFile(content, `chat-export-${Date.now()}.${ext}`, mime);
    UI.toast('\u2705 Conversation exported', 'success');
  },
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); UI.el('clearBtn').click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); UI.el('exportBtn').click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); UI.showSearchOverlay(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); UI.toggleSidebar(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); UI.toggleStats(); }
  if (e.key === '?') { e.preventDefault(); UI.el('shortcuts-modal')?.classList.toggle('open'); }
});

// Cancel any in-flight stream before the page unloads
window.addEventListener('beforeunload', (e) => {
  API.cancelRequest();
  if (AppState.chatHistory.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
