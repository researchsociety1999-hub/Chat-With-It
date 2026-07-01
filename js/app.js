/**
 * Main Application Controller
 * Orchestrates state, UI, and API interactions.
 */

const App = {
  // Guard flag: prevents double-submit if sendBtn is clicked rapidly
  _sending: false,

  async init() {
    try {
      AppState.init();
      UI.loadTheme();

      // FIX: hard-fail early if DOMPurify didn't load from CDN.
      // Without it the regex fallback in finaliseStreamBubble is incomplete
      // and assistant HTML could contain unsanitized injection vectors.
      if (!window.DOMPurify) {
        UI.toast('\u26A0\uFE0F Security library (DOMPurify) failed to load \u2014 chat disabled. Try refreshing.', 'error', 10000);
        const sendBtn = UI.el('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
        console.error('DOMPurify not loaded \u2014 chat disabled for security.');
        return;
      }

      this.setupProviderListeners();
      this.setupAuthListeners();
      this.buildParamFilter();
      this.setupModelListeners();
      this.setupChatListeners();
      this.setupUIListeners();
      this.setupSearchListeners();
      this.setupExportListeners();
      this._setupBeforeUnload();

      // Refresh models when the tab regains focus, but only if the cached list
      // is stale (> 5 minutes old) to avoid hammering the API on every focus.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (!AppState.isAuthenticatedFor(AppState.currentProvider)) return;
        const stale = Date.now() - (AppState.lastModelFetch || 0) > 5 * 60 * 1000;
        if (stale) {
          AppState.lastModelFetch = Date.now();
          this.refreshModels();
        }
      });

      await this.refreshModels();

      // Re-activate the persisted persona card on load
      this._restorePersonaCard();

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
        if (input) input.placeholder = provider === 'huggingface' ? 'hf_\u2026' : 'sk-or-\u2026';

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
        UI.el('modelMeta').textContent = [model.paramTier, ctxK, model.uncensored ? '\uD83D\uDD13 uncensored' : ''].filter(Boolean).join(' \u00B7 ');
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
      const models = await API.fetchModels(AppState.currentProvider, AppState.paramFilter || 'all');
      AppState.lastModelFetch = Date.now();

      AppState.allModels = models;
      AppState.modelContextMap = {};
      models.forEach(m => { AppState.modelContextMap[m.id] = m.ctx || 8192; });

      // Store full model list for search filtering (unfiltered copy)
      this._allModelsCache = models;

      sel.innerHTML = '';
      if (!models.length) {
        sel.innerHTML = '<option value="none" disabled selected>No models for this filter</option>';
        return;
      }

      this._renderModelOptions(models, sel);

      // If the previously saved model is no longer in the list, silently switch to first
      if (AppState.selectedModel === 'none' || !models.find(m => m.id === AppState.selectedModel)) {
        const first = models[0];
        sel.value = first.id;
        AppState.selectedModel = first.id;
        AppState.persistState();
        UI.updateModelLabel(first.name);
        AppState.modelContextMap[first.id] = first.ctx || 8192;
        UI.el('modelMeta').textContent = [
          first.paramTier,
          first.ctx ? `${(first.ctx / 1000).toFixed(0)}k ctx` : '',
          first.uncensored ? '\uD83D\uDD13 uncensored' : ''
        ].filter(Boolean).join(' \u00B7 ');
      }

    } catch (error) {
      console.error('refreshModels error:', error);
      sel.innerHTML = '<option value="none" disabled selected>Failed to load</option>';
      UI.toast(`Model load failed: ${error.message}`, 'error');
    }
  },

  /**
   * Render model <option> elements into a <select>.
   * Appends provider badge (OR/HF) so users can tell which provider each model
   * belongs to when switching providers mid-session.
   */
  _renderModelOptions(models, sel) {
    const providerCfg = API.getProvider();
    const badge = providerCfg?.badgeLabel ? `[${providerCfg.badgeLabel}] ` : '';
    sel.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = badge + m.name + (m.uncensored ? ' \uD83D\uDD13' : '');
      if (m.id === AppState.selectedModel) opt.selected = true;
      sel.appendChild(opt);
    });
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
    // Guard: ignore rapid double-clicks / Enter key bounces
    if (this._sending) return;
    this._sending = true;

    const input   = UI.el('userInput');
    const message = input.value.trim();

    if (!message)                          { UI.toast('Message cannot be empty', 'warning'); this._sending = false; return; }
    if (AppState.selectedModel === 'none') { UI.toast('Please select a model first', 'warning'); this._sending = false; return; }
    if (!AppState.getAuthToken())          { UI.toast('Please authenticate first', 'error'); this._sending = false; return; }

    // Validate that the selected model is still in the current list
    if (!AppState.allModels.some(m => m.id === AppState.selectedModel)) {
      UI.toast('Selected model is no longer available \u2014 refreshing list\u2026', 'warning');
      await this.refreshModels();
      if (!AppState.allModels.some(m => m.id === AppState.selectedModel)) {
        UI.toast('Please choose another model.', 'error');
        this._sending = false;
        return;
      }
    }

    const rateCheck = AppState.canMakeRequest();
    if (!rateCheck.allowed) {
      UI.toast(`\u23F3 Rate limited \u2014 try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`, 'warning');
      this._sending = false;
      return;
    }

    let streamBubble = null;
    let receivedAnyToken = false;

    try {
      UI.showChat();
      UI.appendMessage('user', message);
      AppState.addMessage('user', message);
      input.value = '';
      UI.updateCharCount(0);
      input.style.height = 'auto';
      UI.setSendButtonState(false);
      UI.showTyping();

      // FIX: system message is injected once at the head of the array.
      // Previously it was prepended on every turn, causing the system prompt
      // to be re-sent with the full history each time, bloating context usage.
      // The chat history already contains all prior turns; we only need to
      // prepend the system role message once here.
      const messages = [
        { role: 'system', content: AppState.currentPersonaPrompt },
        ...AppState.chatHistory.map(m => ({ role: m.role, content: m.content }))
      ];

      API.createAbortController();

      const response = await API.sendMessageStream(
        messages,
        AppState.selectedModel,
        (delta) => {
          if (!receivedAnyToken) {
            receivedAnyToken = true;
            UI.removeTyping();
            streamBubble = UI.createStreamBubble();
          }
          UI.appendStreamToken(streamBubble, delta);
        },
        { temperature: AppState.temperature, maxTokens: AppState.maxTokens }
      );

      AppState._resetIdleTimer();

      UI.removeTyping();

      const assistantMessage = response.choices?.[0]?.message?.content || 'No response';

      // If stream produced no tokens (e.g. empty response), create the bubble now
      if (!receivedAnyToken) {
        streamBubble = UI.createStreamBubble();
      }

      UI.finaliseStreamBubble(streamBubble, assistantMessage);
      AppState.addMessage('assistant', assistantMessage);

      const usage = API.extractTokenUsage(response);
      AppState.updateTokens(usage.promptTokens, usage.completionTokens);
      UI.updateStats(AppState.totalPromptTokens, AppState.totalCompletionTokens);
      UI.updateContextBar();
    } catch (error) {
      UI.removeTyping();

      // Remove the empty stream bubble so no blank assistant message is left behind
      if (streamBubble && !receivedAnyToken) {
        UI.removeStreamBubble(streamBubble);
      }

      console.error('sendMessage error:', error);

      // Auto-refresh if the model was deleted or made paid
      if (error.code === 'MODEL_NOT_FREE' || error.code === 'MODEL_MISSING') {
        await this.refreshModels();
      }

      const msg = error.message || 'Failed to get response';
      UI.toast(msg, 'error');
      if (error.code !== 'ABORTED') {
        UI.appendMessage('assistant', `\u274C ${msg}`);
      }
    } finally {
      this._sending = false;
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
        UI.clearChat(); // also calls AppState.clearChat() which resets attachedFiles
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
        AppState.persistState();
        UI.toast(`Persona: ${card.querySelector('strong')?.textContent || 'Custom'}`, 'info');
      });
    });

    // FIX: Stop button now resets _sending so the next user submit is not
    // silently swallowed by the guard at the top of sendMessage().
    UI.el('stopBtn').addEventListener('click', () => {
      API.cancelRequest();
      this._sending = false;
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

  // Restore the active persona card on page load based on persisted prompt
  _restorePersonaCard() {
    const current = AppState.currentPersonaPrompt;
    document.querySelectorAll('.persona-card').forEach(card => {
      const match = (card.dataset.prompt || AppState.defaultPersonaPrompt) === current;
      card.classList.toggle('active', match);
    });
  },

  // FIX: threshold raised to 2+ assistant turns so a single unanswered user
  // message (e.g. accidentally typed then navigated away) doesn't block exit.
  _setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      const turns = AppState.sessionStats?.turnCount || 0;
      if (turns >= 2 && !AppState.chatExported) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },

  // ---------------------------------------------------------------------------
  // Model search filter
  // ---------------------------------------------------------------------------

  setupSearchListeners() {
    const searchInput = UI.el('searchInput');
    if (!searchInput) return;
    searchInput.addEventListener('input', Utils.debounce((e) => {
      const query = e.target.value.trim().toLowerCase();
      const cache = this._allModelsCache || AppState.allModels;
      const sel   = UI.el('modelSelect');
      if (!sel || !cache.length) return;

      // Re-render filtered options instead of toggling display:none on <option>
      // (display:none on <option> is not supported in Firefox on Windows)
      const filtered = query
        ? cache.filter(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
        : cache;

      if (!filtered.length) {
        sel.innerHTML = '<option value="none" disabled selected>No matches</option>';
        return;
      }

      const prev = sel.value;
      this._renderModelOptions(filtered, sel);
      // Restore selection if still in filtered list
      if (filtered.find(m => m.id === prev)) sel.value = prev;
    }, 300));
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
      // FIX: strip common markdown syntax markers so the plain-text export
      // is clean and readable without raw asterisks, hashes, and backticks.
      const stripMd = (str) => str
        .replace(/^#{1,6}\s+/gm, '')           // headings
        .replace(/\*\*(.+?)\*\*/g, '$1')        // bold
        .replace(/\*(.+?)\*/g, '$1')            // italic
        .replace(/`{3}[\s\S]*?`{3}/g, (m) =>    // fenced code blocks — keep content
          m.replace(/^```[^\n]*\n?/,'').replace(/\n?```$/,''))
        .replace(/`(.+?)`/g, '$1')              // inline code
        .replace(/^[-*]\s+/gm, '\u2022 ')       // unordered list bullets
        .replace(/^\d+\.\s+/gm, (m) => m)       // ordered list — keep numbering
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links — keep label
        .replace(/^>+\s?/gm, '')                // blockquotes
        .replace(/_{1,2}(.+?)_{1,2}/g, '$1')    // underscore bold/italic
        .trim();

      content  = AppState.chatHistory.map(m => `[${m.role.toUpperCase()}]\n${stripMd(m.content)}`).join('\n\n---\n\n');
      filename = `chat-${ts}.txt`;
      mime     = 'text/plain';
    } else {
      content  = `# Chat Export\n\n*Exported: ${new Date().toLocaleString()}*\n*Model: ${AppState.selectedModel}*\n\n---\n\n`
               + AppState.chatHistory.map(m => `**${m.role === 'user' ? 'You' : 'Assistant'}:**\n\n${m.content}`).join('\n\n---\n\n');
      filename = `chat-${ts}.md`;
      mime     = 'text/markdown';
    }

    Utils.downloadAsFile(content, filename, mime);
    AppState.chatExported = true;
    UI.toast(`Exported as ${filename}`, 'success');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
