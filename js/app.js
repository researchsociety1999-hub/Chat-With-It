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

  /**
   * Dynamically build the parameter-size filter <select> below #modelSelect.
   * Uses PARAM_TIERS exported by api.js via API.getParamTiers().
   */
  buildParamFilter() {
    const modelSection = UI.el('modelSelect')?.closest('.s-section');
    if (!modelSection) return;

    // Remove any previous filter element (safe to re-call)
    const existing = document.getElementById('paramFilter');
    if (existing) existing.closest('.s-section')?.remove();

    const section = document.createElement('div');
    section.className = 's-section';
    section.innerHTML = '<div class="s-label">Model Size</div>';

    const sel = document.createElement('select');
    sel.id = 'paramFilter';
    sel.setAttribute('aria-label', 'Filter by parameter size');

    API.getParamTiers().forEach(tier => {
      const opt = document.createElement('option');
      opt.value = tier.value;
      opt.textContent = tier.label;
      if (tier.value === (AppState.paramFilter || 'all')) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.addEventListener('change', async (e) => {
      AppState.paramFilter = e.target.value;
      AppState.persistState();
      await this.refreshModels();
    });

    section.appendChild(sel);
    // Insert right after the model <select> section
    modelSection.insertAdjacentElement('afterend', section);
  },

  // ---------------------------------------------------------------------------
  // Provider
  // ---------------------------------------------------------------------------

  setupProviderListeners() {
    const providerSelect = UI.el('providerSelect');
    // Restore persisted provider
    if (AppState.currentProvider) providerSelect.value = AppState.currentProvider;
    providerSelect.addEventListener('change', (e) => {
      AppState.currentProvider = e.target.value;
      this.updateAuthUI();
      AppState.persistState();
    });
    this.updateAuthUI();
  },

  updateAuthUI() {
    const isOR = AppState.currentProvider === 'openrouter';
    UI.el('or-auth-section').style.display = isOR ? 'flex' : 'none';
    UI.el('hf-auth-section').style.display = isOR ? 'none' : 'flex';
  },

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  setupAuthListeners() {
    UI.el('authBtn').addEventListener('click',    () => this.authenticateOpenRouter());
    UI.el('clearOrKey').addEventListener('click', () => this.clearAuth('openrouter'));
    UI.el('hfAuthBtn').addEventListener('click',  () => this.authenticateHuggingFace());
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

  async authenticateOpenRouter() {
    const key = UI.el('apiKey').value.trim();
    if (!key)                       { UI.setStatus('Please enter your API key', 'error'); return; }
    if (!Utils.isValidApiKey(key))  { UI.setStatus('API key appears invalid', 'error');  return; }
    AppState.apiKey = key;
    UI.setStatus('\u2713 Authenticated with OpenRouter', 'ok');
    UI.toast('\u2705 OpenRouter authenticated', 'success');
    await this.refreshModels();
  },

  async authenticateHuggingFace() {
    const token = UI.el('hfToken').value.trim();
    if (!token)                       { UI.setStatus('Please enter your HF token', 'error', true); return; }
    if (!Utils.isValidApiKey(token))  { UI.setStatus('Token appears invalid', 'error', true);      return; }
    AppState.hfToken = token;
    UI.setStatus('\u2713 Authenticated with Hugging Face', 'ok', true);
    UI.toast('\u2705 Hugging Face authenticated', 'success');
    await this.refreshModels();
  },

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

  // ---------------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------------

  async refreshModels() {
    try {
      const paramFilter = AppState.paramFilter || 'all';
      UI.setStatus('Fetching models\u2026', 'info');
      const models = await API.fetchModels(AppState.currentProvider, paramFilter);
      AppState.allModels = models;
      models.forEach(m => { AppState.modelContextMap[m.id] = m.ctx; });
      this.populateModels(models);
      UI.setStatus(`\u2713 ${models.length} model${models.length !== 1 ? 's' : ''} loaded`, 'ok');
      UI.toast(`\u2705 ${models.length} free model${models.length !== 1 ? 's' : ''} available`, 'success');
    } catch (error) {
      console.error('refreshModels error:', error);
      UI.setStatus('Failed to fetch models', 'error');
      UI.toast('Error loading models', 'error');
    }
  },

  /**
   * Populate #modelSelect with models.
   * Shows 🔓 badge on uncensored models and (ctx) in the label.
   */
  populateModels(models) {
    const sel = UI.el('modelSelect');
    const selB = UI.el('modelSelectB');
    if (!sel) return;

    const buildOptions = (el, includeBlank) => {
      el.innerHTML = '';
      if (includeBlank) {
        const blank = document.createElement('option');
        blank.value = 'none';
        blank.textContent = '\u2014 select a model \u2014';
        el.appendChild(blank);
      }
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        const ctxLabel = m.ctx >= 1000000 ? `${Math.round(m.ctx/1000000)}M` :
                         m.ctx >= 1000    ? `${Math.round(m.ctx/1000)}k`    : `${m.ctx}`;
        const lock = m.uncensored ? ' \uD83D\uDD13' : '';
        opt.textContent = `${m.name || m.id} [${ctxLabel}]${lock}`;
        if (m.id === AppState.selectedModel) opt.selected = true;
        el.appendChild(opt);
      });
    };

    buildOptions(sel, models.length === 0);
    if (selB) buildOptions(selB, true);

    // Restore or auto-select first
    if (!AppState.selectedModel || !models.find(m => m.id === AppState.selectedModel)) {
      AppState.selectedModel = models[0]?.id || 'none';
      sel.value = AppState.selectedModel;
    }
    UI.updateBadge?.();
  },

  setupModelListeners() {
    UI.el('modelSelect').addEventListener('change', (e) => {
      AppState.selectedModel = e.target.value;
      UI.updateBadge?.();
    });
    UI.el('modelSelectB').addEventListener('change', (e) => {
      AppState.selectedModelB = e.target.value;
    });
    UI.el('refreshModels').addEventListener('click', () => this.refreshModels());
  },

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  setupChatListeners() {
    const userInput = UI.el('userInput');
    const sendBtn   = UI.el('sendBtn');

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    userInput.addEventListener('input', (e) => {
      UI.updateCharCount(e.target.value.length);
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    });
    sendBtn.addEventListener('click', () => this.sendMessage());
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
        if (!theme) return; // skip export opts which share the class
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

    // Compare mode
    UI.el('compareBtn')?.addEventListener('click', () => {
      const on = document.body.classList.toggle('compare-mode');
      const sec = UI.el('cmp-model-section');
      if (sec) sec.style.display = on ? 'flex' : 'none';
      UI.el('compareBtn').classList.toggle('active', on);
      UI.toast(on ? '\u2696\uFE0F Compare mode on' : 'Compare mode off', 'info');
    });

    // Escape closes modals/dropdowns
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        UI.el('shortcuts-modal')?.classList.remove('open');
        const exportMenu = UI.el('export-menu');
        if (exportMenu) exportMenu.style.display = 'none';
        UI.el('theme-menu')?.classList.remove('open');
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
    bind('expMD',    'markdown');
    bind('expJSON',  'json');
    bind('expTXT',   'text');
    bind('rp-expMD',   'markdown');
    bind('rp-expJSON', 'json');
    bind('rp-expTXT',  'text');

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.exportAs('markdown'); }
    });
  },

  closeExportMenu() {
    const menu = UI.el('export-menu');
    if (menu) menu.style.display = 'none';
  },

  exportAs(format = 'markdown') {
    if (!AppState.chatHistory.length) { UI.toast('No messages to export', 'warning'); return; }
    let content, filename, mime;
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    switch (format) {
      case 'json':
        content  = JSON.stringify({ exported: new Date().toISOString(), model: AppState.selectedModel, messages: AppState.chatHistory }, null, 2);
        filename = `chat-${ts}.json`; mime = 'application/json'; break;
      case 'text':
        content  = AppState.chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
        filename = `chat-${ts}.txt`; mime = 'text/plain'; break;
      default:
        content  = `# Chat Export\n\n**Model:** ${AppState.selectedModel}  \n**Date:** ${new Date().toLocaleString()}\n\n---\n\n` +
                   AppState.chatHistory.map(m => `**${m.role === 'user' ? '\uD83D\uDC64 You' : '\uD83E\uDD16 Assistant'}**\n\n${m.content}`).join('\n\n---\n\n');
        filename = `chat-${ts}.md`; mime = 'text/markdown';
    }
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast(`\uD83D\uDCBE Exported as ${filename}`, 'success');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
