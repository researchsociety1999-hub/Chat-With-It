/**
 * Main Application Controller
 * Orchestrates state, UI, and API interactions.
 */

const App = {
  _sending: false,

  async init() {
    try {
      AppState.init();
      UI.loadTheme();

      if (!window.DOMPurify) {
        UI.toast('⚠️ Security library (DOMPurify) failed to load — chat disabled. Try refreshing.', 'error', 10000);
        const sendBtn = UI.el('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
        console.error('DOMPurify not loaded — chat disabled for security.');
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
      this._restorePersonaCard();

      // Auto-expand privacy panel on first load to reinforce trust messaging
      const privacy = document.querySelector('.privacy-panel');
      if (privacy && !privacy.hasAttribute('open')) {
        privacy.setAttribute('open', '');
      }

      // Initialise auth hint for current provider
      const hint = UI.el('authHint');
      const hintLink = UI.el('authHintLink');
      if (hint) {
        const provider = AppState.currentProvider;
        if (provider === 'huggingface') {
          hint.childNodes[0].textContent = 'Use your Hugging Face token (hf_…) — ';
          if (hintLink) { hintLink.textContent = 'Get token →'; hintLink.href = 'https://huggingface.co/settings/tokens'; }
        } else {
          hint.childNodes[0].textContent = 'Use your OpenRouter key (sk-or-…) — ';
          if (hintLink) { hintLink.textContent = 'Get key →'; hintLink.href = 'https://openrouter.ai/keys'; }
        }
      }

      UI.toast('✅ ChatWithIt loaded', 'success');
    } catch (error) {
      console.error('Init error:', error);
      UI.toast('Failed to initialise application', 'error');
    }
  },

  // ── Param filter ──────────────────────────────────────────────────────────

  buildParamFilter() {
    const sel = UI.el('paramFilter');
    if (!sel) return;
    // Clear any options that buildParamFilter may have added on a previous call
    sel.innerHTML = '';
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

  // ── Provider ──────────────────────────────────────────────────────────────

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

        const hint = UI.el('authHint');
        const hintLink = UI.el('authHintLink');
        if (hint) {
          if (provider === 'huggingface') {
            hint.childNodes[0].textContent = 'Use your Hugging Face token (hf_…) — ';
            if (hintLink) { hintLink.textContent = 'Get token →'; hintLink.href = 'https://huggingface.co/settings/tokens'; }
          } else {
            hint.childNodes[0].textContent = 'Use your OpenRouter key (sk-or-…) — ';
            if (hintLink) { hintLink.textContent = 'Get key →'; hintLink.href = 'https://openrouter.ai/keys'; }
          }
        }

        this.refreshModels();
        UI.toast(`Provider: ${PROVIDERS[provider].name}`, 'info');
      });
    });
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

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
      UI.el('modelSelect').innerHTML = '<option value="none" disabled selected>— authenticate first —</option>';
      UI.updateModelLabel('No model selected');
      UI.toast('Authentication cleared', 'info');
    });
  },

  async authenticate() {
    const input = UI.el('apiKeyInput');
    const key   = input?.value.trim();
    if (!Utils.isValidApiKey(key)) {
      UI.toast('Invalid API key format', 'error');
      if (input) input.focus();
      return;
    }
    if (AppState.currentProvider === 'openrouter') AppState.apiKey  = key;
    else                                            AppState.hfToken = key;
    input.value = '';
    UI.setAuthState(true, `${PROVIDERS[AppState.currentProvider].name} authenticated`);
    UI.toast('✅ Authenticated', 'success');
    await this.refreshModels();
  },

  // ── Models ────────────────────────────────────────────────────────────────

  setupModelListeners() {
    UI.el('modelSelect').addEventListener('change', (e) => {
      AppState.selectedModel = e.target.value;
      AppState.persistState();
      const model = AppState.allModels.find(m => m.id === AppState.selectedModel);
      if (model) {
        const ctxK = model.ctx ? `${(model.ctx / 1000).toFixed(0)}k ctx` : '';
        UI.el('modelMeta').textContent = [model.paramTier, ctxK, model.uncensored ? '🔓 uncensored' : ''].filter(Boolean).join(' · ');
        UI.updateModelLabel(model.name);
        AppState.modelContextMap[model.id] = model.ctx || 8192;
      }
    });
  },

  async refreshModels() {
    const sel = UI.el('modelSelect');
    if (!sel) return;
    if (!AppState.isAuthenticatedFor(AppState.currentProvider)) {
      sel.innerHTML = '<option value="none" disabled selected>— authenticate first —</option>';
      UI.updateModelCount(0, 0);
      return;
    }

    sel.innerHTML = '<option value="none" disabled selected>Loading…</option>';

    try {
      const models = await API.fetchModels(AppState.currentProvider, AppState.paramFilter || 'all');
      AppState.lastModelFetch = Date.now();
      AppState.allModels = models;
      AppState.modelContextMap = {};
      models.forEach(m => { AppState.modelContextMap[m.id] = m.ctx || 8192; });
      this._allModelsCache = models;

      sel.innerHTML = '';
      if (!models.length) {
        sel.innerHTML = '<option value="none" disabled selected>No models for this filter</option>';
        UI.updateModelCount(0, 0);
        return;
      }

      UI.updateModelCount(models.length, models.length);
      this._renderModelOptions(models, sel);

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
          first.uncensored ? '🔓 uncensored' : ''
        ].filter(Boolean).join(' · ');
      } else {
        // Restore the previously selected model's label and meta
        sel.value = AppState.selectedModel;
        const model = models.find(m => m.id === AppState.selectedModel);
        if (model) {
          UI.updateModelLabel(model.name);
          const ctxK = model.ctx ? `${(model.ctx / 1000).toFixed(0)}k ctx` : '';
          UI.el('modelMeta').textContent = [model.paramTier, ctxK, model.uncensored ? '🔓 uncensored' : ''].filter(Boolean).join(' · ');
        }
      }
    } catch (error) {
      console.error('refreshModels error:', error);
      sel.innerHTML = '<option value="none" disabled selected>Failed to load</option>';
      UI.updateModelCount(0, 0);
      UI.toast(`Model load failed: ${error.message}`, 'error');
    }
  },

  _renderModelOptions(models, sel) {
    const providerCfg = API.getProvider();
    const badge = providerCfg?.badgeLabel ? `[${providerCfg.badgeLabel}] ` : '';
    sel.innerHTML = '';
    // Update filter hint if a search is active
    const hint = UI.el('modelFilterHint');
    const searchVal = UI.el('searchInput')?.value?.trim();
    const total = (this._allModelsCache || AppState.allModels).length;
    if (hint) {
      hint.textContent = (searchVal && models.length < total)
        ? `${models.length} of ${total} models shown`
        : '';
    }
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const cooldownSecs = AppState.modelCooldownSecondsLeft(m.id);
      const cooldownTag  = cooldownSecs > 0 ? ` ⏳ ${cooldownSecs}s` : '';
      opt.textContent = badge + m.name + (m.uncensored ? ' 🔓' : '') + cooldownTag;
      if (m.id === AppState.selectedModel) opt.selected = true;
      sel.appendChild(opt);
    });
  },

  // ── Chat ──────────────────────────────────────────────────────────────────

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

    UI.el('stopBtn').addEventListener('click', () => {
      API.cancelRequest();
      UI.setSendButtonState(true);
      UI.removeTyping();
      UI.toast('Generation stopped', 'info');
    });

    // Persona cards
    document.querySelectorAll('.persona-card').forEach(card => {
      const activate = () => {
        const prompt = card.dataset.prompt;
        if (!prompt) return;
        AppState.currentPersonaPrompt = prompt;
        AppState.persistState();
        document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const name = card.querySelector('strong')?.textContent || 'Persona';
        UI.setPersonaLabel(name);
        UI.toast(`Persona: ${name}`, 'info');
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });

    // Welcome chips — persona-aware
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const userInput = UI.el('userInput');
        if (!userInput) return;
        // Switch persona to match chip's data-persona attr if set
        const chipPersona = chip.dataset.persona;
        if (chipPersona) {
          const personaMap = {
            default:  document.querySelector('.persona-card[data-prompt*="helpful AI assistant"]'),
            tutor:    document.querySelector('.persona-card[data-prompt*="Socratic tutor"]'),
            creative: document.querySelector('.persona-card[data-prompt*="creative writing"]'),
            code:     document.querySelector('.persona-card[data-prompt*="code reviewer"]'),
            debate:   document.querySelector('.persona-card[data-prompt*="debate coach"]'),
          };
          const targetCard = personaMap[chipPersona];
          if (targetCard && !targetCard.classList.contains('active')) {
            targetCard.click();
          }
        }
        userInput.value = chip.textContent.trim();
        UI.updateCharCount(userInput.value.length);
        userInput.focus();
        this.sendMessage();
      });
    });
  },

  async sendMessage() {
    if (this._sending) return;

    const userInput = UI.el('userInput');
    const text = userInput?.value.trim();
    if (!text) return;

    if (AppState.selectedModel === 'none') {
      UI.toast('Please select a model first', 'warning');
      return;
    }

    if (!AppState.isAuthenticatedFor(AppState.currentProvider)) {
      UI.toast('Please authenticate first', 'warning');
      return;
    }

    const rateCheck = AppState.canMakeRequest();
    if (!rateCheck.allowed) {
      UI.toast(`Rate limited — try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`, 'warning');
      return;
    }

    // Build message history
    const messages = [
      { role: 'system', content: AppState.currentPersonaPrompt },
      ...AppState.chatHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    // Update state & UI
    AppState.addMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';
    UI.updateCharCount(0);
    UI.showChat();
    UI.appendMessage('user', text);
    UI.setSendButtonState(false);
    UI.showTyping();
    this._sending = true;

    // Create the streaming bubble immediately (typing indicator stays until first token)
    let streamBubble = null;
    let fullContent  = '';
    let firstToken   = true;

    API.createAbortController();

    try {
      const response = await API.sendMessageStream(
        messages,
        AppState.selectedModel,
        (delta) => {
          // First token: swap typing indicator for live streaming bubble
          if (firstToken) {
            UI.removeTyping();
            streamBubble = UI.createStreamBubble();
            firstToken = false;
          }
          fullContent += delta;
          UI.appendStreamToken(streamBubble, delta);
        },
        { temperature: AppState.temperature, maxTokens: AppState.maxTokens }
      );

      // Finalise: render full markdown into the bubble
      if (streamBubble) {
        UI.finaliseStreamBubble(streamBubble, fullContent);
      } else {
        // No tokens streamed (edge case: empty response)
        UI.removeTyping();
        const content = response?.choices?.[0]?.message?.content || '';
        fullContent = content;
        if (fullContent) UI.appendMessage('assistant', fullContent);
      }

      // Save to history & update stats
      const finalContent = fullContent || response?.choices?.[0]?.message?.content || '';
      if (finalContent) {
        AppState.addMessage('assistant', finalContent);
        const { promptTokens, completionTokens } = API.extractTokenUsage(response);
        AppState.updateTokens(promptTokens, completionTokens);
        UI.updateStats(AppState.totalPromptTokens, AppState.totalCompletionTokens);
        UI.updateContextBar();
        if (AppState.getContextUsage() > 0.9) {
          UI.toast('⚠️ Context nearly full (>90%). Consider exporting and starting a new chat.', 'warning', 7000);
        }
        UI.updateRateLimitInfo(AppState.getRemainingRequests());
        UI.updateDiagnostics(AppState.currentProvider, AppState.selectedModel);
      }

    } catch (error) {
      UI.removeTyping();
      if (streamBubble) UI.removeStreamBubble(streamBubble);

      if (error.code === 'ABORTED') {
        // User-initiated stop — already handled by stopBtn listener
      } else if (error.code === 'UPSTREAM_RATE_LIMIT') {
        AppState.setModelCooldown(AppState.selectedModel, 60000);
        this._renderModelOptions(AppState.allModels, UI.el('modelSelect'));
        // Suggest an alternative model from same or adjacent tier
        const curModel = AppState.allModels.find(m => m.id === AppState.selectedModel);
        const alt = AppState.allModels.find(m =>
          m.id !== AppState.selectedModel &&
          !AppState.isModelOnCooldown(m.id) &&
          (!curModel || m.paramTier === curModel.paramTier)
        ) || AppState.allModels.find(m =>
          m.id !== AppState.selectedModel && !AppState.isModelOnCooldown(m.id)
        );
        const altHint = alt ? ` Try: ${alt.name}` : '';
        UI.toast((error.message || 'Model temporarily overloaded — try another') + altHint, 'warning', 8000);
      } else if (error.code === 'RATE_LIMIT') {
        UI.toast(error.message || 'Rate limited — please wait', 'warning', 6000);
      } else if (error.code === 'AUTH') {
        UI.setAuthState(false, 'Authentication failed');
        UI.toast(error.message || 'Authentication error', 'error');
      } else if (error.code === 'MODEL_NOT_FREE' || error.code === 'MODEL_MISSING') {
        UI.toast(error.message || 'Model unavailable', 'error');
        await this.refreshModels();
      } else {
        UI.toast(error.message || 'Request failed — please try again', 'error');
      }
    } finally {
      this._sending = false;
      UI.setSendButtonState(true);
    }
  },

  // ── UI listeners ──────────────────────────────────────────────────────────

  setupUIListeners() {
    // Stats panel
    UI.el('statsBtn').addEventListener('click', () => UI.toggleStats());
    UI.el('rp-close').addEventListener('click', () => {
      UI.el('rightPanel')?.classList.remove('open');
    });

    // Clear chat
    UI.el('clearBtn').addEventListener('click', () => {
      if (AppState.chatHistory.length && !AppState.chatExported) {
        if (!confirm('Clear this conversation?')) return;
      }
      UI.clearChat();
      UI.toast('Chat cleared', 'info');
    });

    // Reset session (auth + model + chat)
    const resetBtn = UI.el('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('Reset session (auth, model, chat)?')) return;
        AppState.reset();
        UI.clearChat();
        const input = UI.el('apiKeyInput');
        if (input) input.value = '';
        UI.setAuthState(false, 'Not authenticated');
        const sel = UI.el('modelSelect');
        if (sel) sel.innerHTML = '<option value="none" disabled selected>— authenticate first —</option>';
        UI.updateModelLabel('No model selected');
        UI.toast('Session reset', 'info');
      });
    }

    // Keyboard shortcuts modal
    const modal = UI.el('shortcuts-modal');
    UI.el('shortcutsBtn').addEventListener('click', () => {
      modal?.classList.toggle('open');
    });
    UI.el('shortcutsClose')?.addEventListener('click', () => {
      modal?.classList.remove('open');
    });
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    // Sidebar toggle (mobile)
    UI.el('sidebarToggle')?.addEventListener('click', () => UI.toggleSidebar());
    UI.el('mobileOverlay')?.addEventListener('click', () => UI.toggleSidebar());

    // Theme menu
    const themeBtn  = UI.el('themeBtn');
    const themeMenu = UI.el('theme-menu');
    themeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      themeMenu?.classList.toggle('open');
    });
    themeMenu?.querySelectorAll('.theme-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        UI.setTheme(opt.dataset.theme);
        themeMenu.classList.remove('open');
        UI.toast(`Theme: ${opt.textContent.trim()}`, 'info');
      });
    });

    // Temperature slider
    const tempSlider = UI.el('tempSlider');
    const tempVal    = UI.el('tempVal');
    if (tempSlider) {
      tempSlider.value = AppState.temperature;
      if (tempVal) tempVal.textContent = AppState.temperature.toFixed(1);
      tempSlider.addEventListener('input', (e) => {
        AppState.temperature = parseFloat(e.target.value);
        if (tempVal) tempVal.textContent = AppState.temperature.toFixed(1);
        AppState.persistState();
      });
    }

    // Max tokens slider
    const maxSlider  = UI.el('maxTokensSlider');
    const maxVal     = UI.el('maxTokensVal');
    if (maxSlider) {
      maxSlider.value = AppState.maxTokens;
      if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();
      maxSlider.addEventListener('input', (e) => {
        AppState.maxTokens = parseInt(e.target.value, 10);
        if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();
        AppState.persistState();
      });
    }

    // Global Escape key: close all overlays
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      themeMenu?.classList.remove('open');
      UI.el('export-menu')?.classList.remove('open');
      modal?.classList.remove('open');
      if (AppState.sidebarOpen) UI.toggleSidebar();
    });

    // Close menus on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-wrap'))  themeMenu?.classList.remove('open');
      if (!e.target.closest('.export-wrap')) UI.el('export-menu')?.classList.remove('open');
    });
  },

  // ── Search / filter ───────────────────────────────────────────────────────

  setupSearchListeners() {
    const searchInput = UI.el('searchInput');
    if (!searchInput) return;

    const doSearch = Utils.debounce((query) => {
      const sel     = UI.el('modelSelect');
      const models  = this._allModelsCache || AppState.allModels;
      if (!models?.length || !sel) return;

      const q = query.trim().toLowerCase();
      const filtered = q
        ? models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
        : models;

      UI.updateModelCount(filtered.length, models.length);
      this._renderModelOptions(filtered, sel);

      // Restore selected value if it survived the filter, otherwise pick first
      if (filtered.find(m => m.id === AppState.selectedModel)) {
        sel.value = AppState.selectedModel;
      } else if (filtered.length) {
        sel.value = filtered[0].id;
        // Do NOT update AppState.selectedModel — just a visual search result
      }
    }, 150);

    searchInput.addEventListener('input', (e) => doSearch(e.target.value));
    searchInput.addEventListener('search', (e) => doSearch(e.target.value)); // clear button
  },

  // ── Export ────────────────────────────────────────────────────────────────

  setupExportListeners() {
    const exportBtn  = UI.el('exportBtn');
    const exportMenu = UI.el('export-menu');

    // Toggle menu on button click
    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu?.classList.toggle('open');
      exportMenu.style.display = exportMenu.classList.contains('open') ? 'flex' : 'none';
    });

    // Markdown export
    UI.el('exportMd')?.addEventListener('click', () => {
      this._exportChat('md');
      exportMenu?.classList.remove('open');
      if (exportMenu) exportMenu.style.display = 'none';
    });

    // JSON export
    UI.el('exportJson')?.addEventListener('click', () => {
      this._exportChat('json');
      exportMenu?.classList.remove('open');
      if (exportMenu) exportMenu.style.display = 'none';
    });

    // Plain text export
    UI.el('exportTxt')?.addEventListener('click', () => {
      this._exportChat('txt');
      exportMenu?.classList.remove('open');
      if (exportMenu) exportMenu.style.display = 'none';
    });

    // Copy-to-clipboard Markdown export
    UI.el('exportCopy')?.addEventListener('click', () => {
      this._exportChat('copy');
      exportMenu?.classList.remove('open');
      if (exportMenu) exportMenu.style.display = 'none';
    });

    // Ctrl+S → Markdown export
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this._exportChat('md');
      }
    });
  },

  _exportChat(format) {
    if (!AppState.chatHistory.length) {
      UI.toast('Nothing to export', 'info');
      return;
    }
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `chatwithit-${ts}`;

    try {
      if (format === 'json') {
        const data = JSON.stringify({
          exportedAt: new Date().toISOString(),
          model:      AppState.selectedModel,
          provider:   AppState.currentProvider,
          messages:   AppState.chatHistory,
        }, null, 2);
        Utils.downloadAsFile(data, `${base}.json`, 'application/json');

      } else if (format === 'md' || format === 'copy') {
        const lines = AppState.chatHistory.map(m => {
          const role = m.role === 'user' ? '**You**' : '**Assistant**';
          return `${role}\n\n${m.content}\n`;
        });
        const md = `# ChatWithIt Export\n\n*Exported: ${new Date().toLocaleString()}*\n*Model: ${AppState.selectedModel}*\n*Provider: ${AppState.currentProvider}*\n\n---\n\n${lines.join('\n---\n\n')}`;

        if (format === 'md') {
          Utils.downloadAsFile(md, `${base}.md`, 'text/markdown');
        } else {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(md).then(
              () => UI.toast('Copied Markdown to clipboard', 'success'),
              () => UI.toast('Clipboard copy failed — try again', 'error')
            );
          } else {
            const ta = document.createElement('textarea');
            ta.value = md;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
              document.execCommand('copy');
              UI.toast('Copied Markdown to clipboard', 'success');
            } catch (err) {
              UI.toast('Clipboard copy failed — try manual copy', 'error');
            }
            document.body.removeChild(ta);
          }
        }

      } else {
        const lines = AppState.chatHistory.map(m => {
          const role = m.role === 'user' ? 'You' : 'Assistant';
          return `[${role}]\n${m.content}`;
        });
        Utils.downloadAsFile(lines.join('\n\n---\n\n'), `${base}.txt`, 'text/plain');
      }

      if (format !== 'copy') {
        AppState.chatExported = true;
      }
      if (format === 'copy') {
        // For copy, success toast is handled in the branch above
      } else {
        UI.toast(`✅ Chat exported as ${format.toUpperCase()}`, 'success');
      }
    } catch (err) {
      console.error('Export failed:', err);
      UI.toast(err?.message ? `Export failed: ${err.message}` : 'Export failed — try again', 'error');
    }
  },

  // ── Before-unload guard ───────────────────────────────────────────────────

  _setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      if (!AppState.chatHistory.length) return;
      if (AppState.chatExported) return;
      e.preventDefault();
      e.returnValue = '';
    });
  },

  // ── Persona restore ───────────────────────────────────────────────────────

  /**
   * Re-activate the persona card whose data-prompt matches the persisted
   * currentPersonaPrompt so the sidebar reflects the saved state on load.
   */
  _restorePersonaCard() {
    const saved = AppState.currentPersonaPrompt;
    if (!saved) return;
    document.querySelectorAll('.persona-card').forEach(card => {
      const isMatch = card.dataset.prompt?.trim() === saved.trim();
      card.classList.toggle('active', isMatch);
      if (isMatch) {
        const name = card.querySelector('strong')?.textContent || 'Persona';
        UI.setPersonaLabel(name);
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
