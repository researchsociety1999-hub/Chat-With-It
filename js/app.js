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
      card.addEventListener('click', () => {
        document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        AppState.currentPersonaPrompt = card.dataset.prompt || AppState.defaultPersonaPrompt;
        UI.toast(`Persona: ${card.querySelector('strong')?.textContent || 'Custom'}`, 'info');
      });
    });

    // Stop button
    UI.el('stopBtn').addEventListener('click', () => {
      API.cancelRequest();
      UI.setSendButtonState(true);
      UI.removeTyping();
      UI.toast('\u23F9 Response stopped', 'warning');
    });

    // Keyboard shortcuts modal toggle
    const shortcutsBtn = UI.el('shortcutsBtn');
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener('click', () => {
        const modal = UI.el('shortcuts-modal');
        if (modal) modal.classList.toggle('open');
      });
    }
    const shortcutsModal = UI.el('shortcuts-modal');
    if (shortcutsModal) {
      shortcutsModal.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) shortcutsModal.classList.remove('open');
      });
    }

    // Compare mode toggle
    const compareBtn = UI.el('compareBtn');
    if (compareBtn) {
      compareBtn.addEventListener('click', () => {
        const isCompare = document.body.classList.toggle('compare-mode');
        const cmpSection = UI.el('cmp-model-section');
        if (cmpSection) cmpSection.style.display = isCompare ? 'flex' : 'none';
        compareBtn.classList.toggle('active', isCompare);
        UI.toast(isCompare ? '\u2696\uFE0F Compare mode on' : 'Compare mode off', 'info');
      });
    }

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
    const searchInput = UI.el('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        const query = e.target.value.trim().toLowerCase();
        this.filterModels(query);
      }, 300));
    }
  },

  /**
   * Filter models by query
   */
  filterModels(query) {
    const options = UI.el('modelSelect')?.options;
    if (!options) return;
    Array.from(options).forEach(opt => {
      opt.style.display = !query || opt.text.toLowerCase().includes(query) ? '' : 'none';
    });
  },

  /**
   * Setup export listeners
   */
  setupExportListeners() {
    // Header export button — toggle dropdown
    const exportBtn = UI.el('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = UI.el('export-menu');
        if (menu) menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
      });
    }

    // Header export menu items
    const expMD = UI.el('expMD');
    if (expMD) expMD.addEventListener('click', () => { this.exportAs('markdown'); this.closeExportMenu(); });
    const expJSON = UI.el('expJSON');
    if (expJSON) expJSON.addEventListener('click', () => { this.exportAs('json'); this.closeExportMenu(); });
    const expTXT = UI.el('expTXT');
    if (expTXT) expTXT.addEventListener('click', () => { this.exportAs('text'); this.closeExportMenu(); });

    // Right-panel export buttons (ids prefixed rp-)
    const rpMD = UI.el('rp-expMD');
    if (rpMD) rpMD.addEventListener('click', () => this.exportAs('markdown'));
    const rpJSON = UI.el('rp-expJSON');
    if (rpJSON) rpJSON.addEventListener('click', () => this.exportAs('json'));
    const rpTXT = UI.el('rp-expTXT');
    if (rpTXT) rpTXT.addEventListener('click', () => this.exportAs('text'));

    // Keyboard shortcut Ctrl+S
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.exportAs('markdown');
      }
    });
  },

  closeExportMenu() {
    const menu = UI.el('export-menu');
    if (menu) menu.style.display = 'none';
  },

  /**
   * Export conversation
   */
  exportAs(format = 'markdown') {
    if (!AppState.chatHistory.length) {
      UI.toast('No messages to export', 'warning');
      return;
    }

    let content, filename, mime;
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    switch (format) {
      case 'json':
        content = JSON.stringify({
          exported: new Date().toISOString(),
          model: AppState.selectedModel,
          messages: AppState.chatHistory
        }, null, 2);
        filename = `chat-${ts}.json`;
        mime = 'application/json';
        break;
      case 'text':
        content = AppState.chatHistory
          .map(m => `[${m.role.toUpperCase()}]\n${m.content}`)
          .join('\n\n---\n\n');
        filename = `chat-${ts}.txt`;
        mime = 'text/plain';
        break;
      default: // markdown
        content = `# Chat Export\n\n**Model:** ${AppState.selectedModel}  \n**Date:** ${new Date().toLocaleString()}\n\n---\n\n` +
          AppState.chatHistory
            .map(m => `**${m.role === 'user' ? '\uD83D\uDC64 You' : '\uD83E\uDD16 Assistant'}**\n\n${m.content}`)
            .join('\n\n---\n\n');
        filename = `chat-${ts}.md`;
        mime = 'text/markdown';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast(`\uD83D\uDCBE Exported as ${filename}`, 'success');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
