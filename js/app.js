/**
 * Main Application Controller
 * Orchestrates state, UI, and API interactions.
 */

const App = {
  async init() {
    try {
      AppState.init();
      UI.loadTheme();

      this.setupProviderListeners();
      this.setupAuthListeners();
      this.buildParamFilter();
      this.setupModelListeners();
      this.setupChatListeners();
      this.setupUIListeners();
      this.setupSearchListeners();
      this.setupExportListeners();

      await this.refreshModels();

      UI.toast('\u2705 ChatWithIt loaded', 'success');
    } catch (error) {
      console.error('Init error:', error);
      UI.toast('Failed to initialise application', 'error');
    }
  },

  // ---------------------------------------------------------------------------
  // Param-size filter
  // ---------------------------------------------------------------------------

  buildParamFilter() {
    const sel = UI.el('paramFilter');
    if (!sel) return;
    PARAM_TIERS.forEach(tier => {
      const opt = document.createElement('option');
      opt.value = tier.value;
      opt.textContent = tier.label;
      if (tier.value === AppState.paramFilter) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', (e) => {
      AppState.paramFilter = e.target.value;
      AppState.persistState();
      this.refreshModels();
    });
  },

  // ---------------------------------------------------------------------------
  // Provider
  // ---------------------------------------------------------------------------

  setupProviderListeners() {
    document.querySelectorAll('.ptab').forEach(btn => {
      btn.addEventListener('click', () => {
        const provider = btn.dataset.provider;
        if (!AppState.isValidProvider(provider)) return;
        AppState.currentProvider = provider;
        AppState.persistState();

        document.querySelectorAll('.ptab').forEach(b => {
          b.classList.toggle('active', b.dataset.provider === provider);
          b.setAttribute('aria-selected', String(b.dataset.provider === provider));
        });

        const input = UI.el('apiKeyInput');
        if (input) input.placeholder = provider === 'huggingface' ? 'hf_…' : 'sk-or-…';

        const isAuth = AppState.isAuthenticatedFor(provider);
        UI.setAuthState(isAuth, isAuth ? `${PROVIDERS[provider].name} authenticated` : 'Not authenticated');

        this.refreshModels();
        UI.toast(`Provider: ${PROVIDERS[provider].name}`, 'info');
      });
    });
  },

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  setupAuthListeners() {
    UI.el('authBtn').addEventListener('click', () => this.authenticate());
    UI.el('apiKeyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.authenticate();
    });
    UI.el('clearAuthBtn').addEventListener('click', () => {
      AppState.apiKey  = '';
      AppState.hfToken = '';
      UI.el('apiKeyInput').value = '';
      UI.setAuthState(false, 'Not authenticated');
      UI.el('modelSelect').innerHTML = '<option value="none" disabled selected>\u2014 authenticate first \u2014</option>';
      UI.toast('Authentication cleared', 'info');
    });
  },

  async authenticate() {
    const input = UI.el('apiKeyInput');
    const key   = input?.value.trim();
    if (!Utils.isValidApiKey(key)) {
      UI.toast('Invalid API key format', 'error');
      return;
    }
    if (AppState.currentProvider === 'openrouter') AppState.apiKey  = key;
    else                                            AppState.hfToken = key;
    input.value = '';
    UI.setAuthState(true, `${PROVIDERS[AppState.currentProvider].name} authenticated`);
    UI.toast('\u2705 Authenticated', 'success');
    await this.refreshModels();
  },

  // ---------------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------------

  setupModelListeners() {
    UI.el('modelSelect').addEventListener('change', (e) => {
      AppState.selectedModel = e.target.value;
      AppState.persistState();
      const model = AppState.allModels.find(m => m.id === AppState.selectedModel);
      if (model) {
        const ctxK = model.ctx ? `${(model.ctx / 1000).toFixed(0)}k ctx` : '';
        UI.el('modelMeta').textContent = [model.paramTier, ctxK, model.uncensored ? '\uD83D\uDD13 uncensored' : ''].filter(Boolean).join(' · ');
        UI.updateModelLabel(model.name);
        AppState.modelContextMap[model.id] = model.ctx || 8192;
      }
    });
  },

  async refreshModels() {
    const sel = UI.el('modelSelect');
    if (!sel) return;
    if (!AppState.isAuthenticatedFor(AppState.currentProvider)) {
      sel.innerHTML = '<option value="none" disabled selected>\u2014 authenticate first \u2014</option>';
      return;
    }

    sel.innerHTML = '<option value="none" disabled selected>Loading\u2026</option>';

    try {
      const provider   = AppState.currentProvider;
      const rawModels  = CURATED_FREE[provider] || [];
      const tierFilter = AppState.paramFilter;
      const tierDef    = PARAM_TIERS.find(t => t.value === tierFilter);

      const models = (tierFilter === 'all' || !tierDef?.test)
        ? rawModels
        : rawModels.filter(m => tierDef.test(m.paramTier));

      AppState.allModels = models;
      models.forEach(m => { AppState.modelContextMap[m.id] = m.ctx || 8192; });

      sel.innerHTML = '';
      if (!models.length) {
        sel.innerHTML = '<option value="none" disabled selected>No models for this filter</option>';
        return;
      }

      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name + (m.uncensored ? ' \uD83D\uDD13' : '');
        if (m.id === AppState.selectedModel) opt.selected = true;
        sel.appendChild(opt);
      });

      if (AppState.selectedModel === 'none' || !models.find(m => m.id === AppState.selectedModel)) {
        sel.value = models[0].id;
        AppState.selectedModel = models[0].id;
        AppState.persistState();
        UI.updateModelLabel(models[0].name);
        AppState.modelContextMap[models[0].id] = models[0].ctx || 8192;
        UI.el('modelMeta').textContent = [
          models[0].paramTier,
          models[0].ctx ? `${(models[0].ctx / 1000).toFixed(0)}k ctx` : '',
          models[0].uncensored ? '\uD83D\uDD13 uncensored' : ''
        ].filter(Boolean).join(' · ');
      }

    } catch (error) {
      console.error('refreshModels error:', error);
      sel.innerHTML = '<option value="none" disabled selected>Failed to load</option>';
      UI.toast(`Model load failed: ${error.message}`, 'error');
    }
  },

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  setupChatListeners() {
    const userInput = UI.el('userInput');
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    userInput.addEventListener('input', (e) => {
      UI.updateCharCount(e.target.value.length);
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    });
    UI.el('sendBtn').addEventListener('click', () => this.sendMessage());

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const input = UI.el('userInput');
        if (input) {
          input.value = chip.textContent;
          UI.updateCharCount(chip.textContent.length);
          input.focus();
        }
      });
    });
  },

  async sendMessage() {
    const input   = UI.el('userInput');
    const message = input.value.trim();

    if (!message)                     { UI.toast('Message cannot be empty', 'warning'); return; }
    if (AppState.selectedModel === 'none') { UI.toast('Please select a model first', 'warning'); return; }
    if (!AppState.getAuthToken())     { UI.toast('Please authenticate first', 'error'); return; }

    const rateCheck = AppState.canMakeRequest();
    if (!rateCheck.allowed) {
      UI.toast(`\u23F3 Rate limited \u2014 try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`, 'warning');
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
      const streamBubble = UI.createStreamBubble();
      UI.removeTyping();

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
      UI.updateContextBar();
    } catch (error) {
      UI.removeTyping();
      console.error('sendMessage error:', error);
      const msg = error.message || 'Failed to get response';
      UI.toast(`Error: ${msg}`, 'error');
      UI.appendMessage('assistant', `\u274C Error: ${msg}`);
    } finally {
      UI.setSendButtonState(true);
    }
  },

  // ---------------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------------

  setupUIListeners() {
    UI.el('sidebarToggle').addEventListener('click',   () => UI.toggleSidebar());
    UI.el('mobileOverlay').addEventListener('click',   () => UI.toggleSidebar());
    UI.el('statsBtn').addEventListener('click',        () => UI.toggleStats());
    UI.el('rp-close').addEventListener('click',        () => UI.toggleStats());

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
    document.addEventListener('click', (e) => {
      const themeMenu  = UI.el('theme-menu');
      const exportMenu = UI.el('export-menu');
      if (themeMenu  && !themeMenu.contains(e.target)  && e.target !== UI.el('themeBtn'))  themeMenu.classList.remove('open');
      if (exportMenu && !exportMenu.contains(e.target) && e.target !== UI.el('exportBtn')) exportMenu.style.display = 'none';
    });
    document.querySelectorAll('.theme-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        const theme = e.target.dataset.theme;
        if (!theme) return;
        UI.setTheme(theme);
        UI.el('theme-menu').classList.remove('open');
        UI.toast(`Theme: ${e.target.textContent.trim()}`, 'info');
      });
    });

    // Sliders
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

    // Personas
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

    // Shortcuts modal
    const shortcutsBtn = UI.el('shortcutsBtn');
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', () => {
      UI.el('shortcuts-modal')?.classList.toggle('open');
    });
    UI.el('shortcuts-modal')?.addEventListener('click', (e) => {
      if (e.target === UI.el('shortcuts-modal')) UI.el('shortcuts-modal').classList.remove('open');
    });

    // Compare mode (roadmap)
    UI.el('compareBtn')?.addEventListener('click', () => {
      UI.toast('Compare mode coming soon', 'info');
    });

    // Escape closes modals/dropdowns; '?' toggles shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        UI.el('shortcuts-modal')?.classList.remove('open');
        const exportMenu = UI.el('export-menu');
        if (exportMenu) exportMenu.style.display = 'none';
        UI.el('theme-menu')?.classList.remove('open');
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        UI.el('shortcuts-modal')?.classList.toggle('open');
      }
    });
  },

  // ---------------------------------------------------------------------------
  // Model search filter
  // ---------------------------------------------------------------------------

  setupSearchListeners() {
    const searchInput = UI.el('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        const query = e.target.value.trim().toLowerCase();
        Array.from(UI.el('modelSelect')?.options || []).forEach(opt => {
          opt.style.display = !query || opt.text.toLowerCase().includes(query) ? '' : 'none';
        });
      }, 300));
    }
  },

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  setupExportListeners() {
    const exportBtn = UI.el('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = UI.el('export-menu');
        if (menu) menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
      });
    }

    const bind = (id, fmt) => UI.el(id)?.addEventListener('click', () => { this.exportAs(fmt); this.closeExportMenu(); });
    bind('exportMd',   'markdown');
    bind('exportJson', 'json');
    bind('exportTxt',  'text');

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.exportAs('markdown'); }
    });
  },

  closeExportMenu() {
    const menu = UI.el('export-menu');
    if (menu) menu.style.display = 'none';
  },

  exportAs(format = 'markdown') {
    if (!AppState.chatHistory.length) { UI.toast('Nothing to export', 'warning'); return; }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let content, filename, mime;

    if (format === 'json') {
      content  = JSON.stringify({ exported: new Date().toISOString(), model: AppState.selectedModel, messages: AppState.chatHistory }, null, 2);
      filename = `chat-${ts}.json`;
      mime     = 'application/json';
    } else if (format === 'text') {
      content  = AppState.chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
      filename = `chat-${ts}.txt`;
      mime     = 'text/plain';
    } else {
      content  = `# Chat Export\n\n*Exported: ${new Date().toLocaleString()}*\n*Model: ${AppState.selectedModel}*\n\n---\n\n`
               + AppState.chatHistory.map(m => `**${m.role === 'user' ? 'You' : 'Assistant'}:**\n\n${m.content}`).join('\n\n---\n\n');
      filename = `chat-${ts}.md`;
      mime     = 'text/markdown';
    }

    Utils.downloadAsFile(content, filename, mime);
    UI.toast(`Exported as ${filename}`, 'success');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
