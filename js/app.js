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
      UI.toast('\u2705 ChatWithIt loaded', 'success');
    } catch (error) {
      console.error('Init error:', error);
      UI.toast('Failed to initialise application', 'error');
    }
  },

  // ── Param filter ──────────────────────────────────────────────────────────

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
        if (input) input.placeholder = provider === 'huggingface' ? 'hf_\u2026' : 'sk-or-\u2026';

        const isAuth = AppState.isAuthenticatedFor(provider);
        UI.setAuthState(isAuth, isAuth ? `${PROVIDERS[provider].name} authenticated` : 'Not authenticated');

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

  // ── Models ────────────────────────────────────────────────────────────────

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
      this._allModelsCache = models;

      sel.innerHTML = '';
      if (!models.length) {
        sel.innerHTML = '<option value="none" disabled selected>No models for this filter</option>';
        return;
      }

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
          first.uncensored ? '\uD83D\uDD13 uncensored' : ''
        ].filter(Boolean).join(' \u00B7 ');
      }
    } catch (error) {
      console.error('refreshModels error:', error);
      sel.innerHTML = '<option value="none" disabled selected>Failed to load</option>';
      UI.toast(`Model load failed: ${error.message}`, 'error');
    }
  },

  _renderModelOptions(models, sel) {
    const providerCfg = API.getProvider();
    const badge = providerCfg?.badgeLabel ? `[${providerCfg.badgeLabel}] ` : '';
    sel.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      // FIX: append ⏳ cooldown indicator when model is temporarily rate-limited
      // by its upstream provider. This keeps the model selectable but signals
      // to the user that it may not respond immediately.
      const cooldownSecs = AppState.modelCooldownSecondsLeft(m.id);
      const cooldownTag  = cooldownSecs > 0 ? ` \u23F3 ${cooldownSecs}s` : '';
      opt.textContent = badge + m.name + (m.uncensored ? ' \uD83D\uDD13' : '') + cooldownTag;
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

    document.querySelectorAll('.chi