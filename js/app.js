/**
 * Main Application Controller
 * Orchestrates state, UI, and API interactions.
 */

import { AppState } from './state.js';
import { UI } from './ui.js';
import { API, PROVIDERS, PARAM_TIERS } from './api.js';
import { Utils } from './utils.js';
import { Profiles } from './profiles.js';
import DOMPurify from 'dompurify';

export const App = {
  _sending: false,
  _cooldownInterval: null,
  _scrollScheduled: false, // FIX Marcus: rAF scroll throttle flag

  async init() {
    try {
      AppState.init();
      AppState.applyTheme();
      AppState.applyHighContrast();
      UI.loadTheme();

      // DOMPurify is bundled via npm — if the import failed the app cannot
      // safely render markdown, so disable chat and surface a banner.
      if (typeof DOMPurify === 'undefined' || !DOMPurify.sanitize) {
        UI.showSecurityBanner('⚠️ Security library (DOMPurify) failed to load — chat disabled. Please refresh the page.');
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
      this.setupAttachmentListeners();
      this.setupConversationListeners();
      this.setupUIListeners();
      this.setupSearchListeners();
      this.setupExportListeners();
      this._setupBeforeUnload();
      this._setupKeyboardShortcuts();
      this._setupHighContrastToggle();

      // Load active conversation messages and render conversation list
      UI.renderChatHistory(AppState.chatHistory);
      this.renderConversationList();

      // Phase 4: profiles panel is a module — init it directly
      if (typeof Profiles !== 'undefined' && typeof Profiles.init === 'function') {
        Profiles.init();
      }

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
      UI.initScrollBtn();

      const privacy = document.querySelector('.privacy-panel');
      if (privacy && !privacy.hasAttribute('open')) {
        privacy.setAttribute('open', '');
      }

      const hint = UI.el('authHint');
      const hintLink = UI.el('authHintLink');
      const localRow = UI.el('localConfigRow');
      const localUrlInput = UI.el('localBaseUrlInput');
      if (localUrlInput) {
        localUrlInput.value = AppState.localBaseUrl || 'http://localhost:11434/v1';
      }

      if (localRow) {
        localRow.style.display = AppState.currentProvider === 'local' ? 'block' : 'none';
      }

      if (hint) {
        const provider = AppState.currentProvider;
        if (provider === 'huggingface') {
          hint.childNodes[0].textContent = 'Use your Hugging Face token (hf_…) — ';
          if (hintLink) { hintLink.style.display = ''; hintLink.textContent = 'Get token →'; hintLink.href = 'https://huggingface.co/settings/tokens'; }
        } else if (provider === 'local') {
          hint.childNodes[0].textContent = 'Local endpoint (e.g. Ollama, LM Studio, vLLM) — API key optional.';
          if (hintLink) { hintLink.style.display = 'none'; }
        } else {
          hint.childNodes[0].textContent = 'Use your OpenRouter key (sk-or-…) — ';
          if (hintLink) { hintLink.style.display = ''; hintLink.textContent = 'Get key →'; hintLink.href = 'https://openrouter.ai/keys'; }
        }
      }

      UI.toast('✅ ChatWithIt loaded', 'success');
    } catch (error) {
      console.error('Init error:', error);
      UI.toast('Failed to initialise application', 'error');
    }
  },

  // FIX Marcus: rAF-throttled scroll — called per streaming token (only if user hasn't scrolled up)
  _scheduleScroll() {
    if (this._scrollScheduled) return;
    this._scrollScheduled = true;
    requestAnimationFrame(() => {
      if (typeof UI.isNearBottom === 'function' && !UI.isNearBottom(120)) {
        this._scrollScheduled = false;
        UI._updateScrollBtn();
        return;
      }
      const chat = UI.el('chatBody');
      if (chat) chat.scrollTop = chat.scrollHeight;
      this._scrollScheduled = false;
      UI._updateScrollBtn();
    });
  },

  buildParamFilter() {
    const sel = UI.el('paramFilter');
    if (!sel) return;
    sel.innerHTML = '';
    PARAM_TIERS.forEach(tier => {
      const opt = document.createElement('option');
      opt.value = tier.value;
      opt.textContent = tier.label;
      if (tier.value === AppState.paramFilter) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', (e) => {
      const previousModel = AppState.selectedModel;
      AppState.paramFilter = e.target.value;
      AppState.persistState();
      this.refreshModels(previousModel);
    });
  },

  setupProviderListeners() {
    const localUrlInput = UI.el('localBaseUrlInput');
    if (localUrlInput) {
      const updateLocalUrl = (e) => {
        AppState.localBaseUrl = e.target.value.trim() || 'http://localhost:11434/v1';
        AppState.persistState();
        if (AppState.currentProvider === 'local') {
          this.refreshModels();
        }
      };
      localUrlInput.addEventListener('change', updateLocalUrl);
      localUrlInput.addEventListener('blur', updateLocalUrl);
    }

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

        const localRow = UI.el('localConfigRow');
        if (localRow) {
          localRow.style.display = provider === 'local' ? 'block' : 'none';
        }

        const input = UI.el('apiKeyInput');
        if (input) {
          if (provider === 'huggingface') input.placeholder = 'hf_…';
          else if (provider === 'local') input.placeholder = 'Optional API key (if configured)';
          else input.placeholder = 'sk-or-…';
        }

        const isAuth = AppState.isAuthenticatedFor(provider);
        UI.setAuthState(isAuth, isAuth ? `${PROVIDERS[provider].name} ready` : 'Not authenticated');

        const hint = UI.el('authHint');
        const hintLink = UI.el('authHintLink');
        if (hint) {
          if (provider === 'huggingface') {
            hint.childNodes[0].textContent = 'Use your Hugging Face token (hf_…) — ';
            if (hintLink) { hintLink.style.display = ''; hintLink.textContent = 'Get token →'; hintLink.href = 'https://huggingface.co/settings/tokens'; }
          } else if (provider === 'local') {
            hint.childNodes[0].textContent = 'Local endpoint (e.g. Ollama, LM Studio, vLLM) — API key optional.';
            if (hintLink) { hintLink.style.display = 'none'; }
          } else {
            hint.childNodes[0].textContent = 'Use your OpenRouter key (sk-or-…) — ';
            if (hintLink) { hintLink.style.display = ''; hintLink.textContent = 'Get key →'; hintLink.href = 'https://openrouter.ai/keys'; }
          }
        }

        this.refreshModels();
        UI.toast(`Provider: ${PROVIDERS[provider].name}`, 'info');
      });
    });
  },

  setupAuthListeners() {
    UI.el('authBtn').addEventListener('click', () => this.authenticate());
    UI.el('apiKeyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.authenticate();
    });
    UI.el('clearAuthBtn').addEventListener('click', () => {
      AppState.apiKey  = '';
      AppState.hfToken = '';
      AppState.localApiKey = '';
      UI.el('apiKeyInput').value = '';
      if (AppState.currentProvider === 'local') {
        UI.setAuthState(true, 'Local endpoint ready');
      } else {
        UI.setAuthState(false, 'Not authenticated');
        UI.el('modelSelect').innerHTML = '<option value="none" disabled selected>— authenticate first —</option>';
        UI.updateModelLabel('No model selected');
      }
      UI.toast('Authentication cleared', 'info');
    });
    UI.el('lockBtn')?.addEventListener('click', () => this.lockApp());
  },

  lockApp() {
    // Wipe the in-memory encryption key and show passphrase modal
    if (typeof AppState.lockKey === 'function') {
      AppState.lockKey();
    } else {
      // Fallback if encryption not available
      UI.toast('App locked', 'info');
    }
    // Show passphrase modal again
    UI.confirmModal('Enter your passphrase to unlock', (passphrase) => {
      UI.toast('Unlocked', 'success');
    });
  },

  async authenticate() {
    const input = UI.el('apiKeyInput');
    const key   = input?.value.trim() || '';

    if (AppState.currentProvider === 'local') {
      AppState.localApiKey = key;
      input.value = '';
      UI.setAuthState(true, `${PROVIDERS[AppState.currentProvider].name} ready`);
      UI.toast('✅ Local endpoint updated', 'success');
      await this.refreshModels();
      return;
    }

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

  setupModelListeners() {
    UI.el('modelSelect').addEventListener('change', (e) => {
      const newModelId = e.target.value;
      const oldModelId = AppState.selectedModel;
      if (newModelId === oldModelId) return;

      const model = AppState.allModels.find(m => m.id === newModelId);
      const modelName = model?.name || newModelId;

      // Mid-response dynamic model switching:
      // If a stream is active when the user switches model, abort the current in-flight
      // request cleanly. The conversation context is preserved and the next message / retry
      // will use the newly selected model.
      if (this._sending) {
        API.cancelRequest();
        this._sending = false;
        UI.setSendButtonState(true);
        UI.removeTyping();
        UI.toast(`Model switched to ${modelName} (stopped active stream)`, 'info');
      } else {
        UI.toast(`Model: ${modelName}`, 'info');
      }

      // Visual divider in chat if conversation already has messages
      if (AppState.chatHistory.length > 0) {
        UI.appendDivider(`Model changed to ${modelName}`);
      }

      AppState.selectedModel = newModelId;
      AppState.persistState();

      AppState.totalPromptTokens     = 0;
      AppState.totalCompletionTokens = 0;
      AppState.turnTokens            = [];
      UI.updateStats(0, 0);
      UI.updateContextBar();

      if (model) {
        const ctxK = model.ctx ? `${(model.ctx / 1000).toFixed(0)}k ctx` : '';
        const roleBadge = model.role && model.role !== 'general' ? `🏷️ ${model.role}` : '';
        const costBadge = model.costTier ? (model.costTier === 'free' ? '🎁 Free' : `💰 ${model.costTier}`) : '';
        UI.el('modelMeta').textContent = [costBadge, roleBadge, model.paramTier !== '?' ? model.paramTier : '', ctxK, model.uncensored ? '🔓 uncensored' : ''].filter(Boolean).join(' · ');
        UI.updateModelLabel(model.name);
        AppState.modelContextMap[model.id] = model.ctx || 8192;
      }
    });
  },

  async refreshModels(restoreModelId) {
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
      // FIX Dev: single source of truth — no separate App-level _allModelsCache
      AppState.allModels = models;
      AppState.modelContextMap = {};
      models.forEach(m => { AppState.modelContextMap[m.id] = m.ctx || 8192; });

      sel.innerHTML = '';
      if (!models.length) {
        sel.innerHTML = '<option value="none" disabled selected>No models for this filter</option>';
        UI.updateModelCount(0, 0);
        return;
      }

      UI.updateModelCount(models.length, models.length);
      this._renderModelOptions(models, sel);

      const preferred = restoreModelId || AppState.selectedModel;
      const found = preferred !== 'none' && models.find(m => m.id === preferred);

      if (!found) {
        const first = models[0];
        sel.value = first.id;
        AppState.selectedModel = first.id;
        AppState.persistState();
        UI.updateModelLabel(first.name);
        AppState.modelContextMap[first.id] = first.ctx || 8192;
        const roleBadge = first.role && first.role !== 'general' ? `🏷️ ${first.role}` : '';
        const costBadge = first.costTier ? (first.costTier === 'free' ? '🎁 Free' : `💰 ${first.costTier}`) : '';
        UI.el('modelMeta').textContent = [
          costBadge,
          roleBadge,
          first.paramTier !== '?' ? first.paramTier : '',
          first.ctx ? `${(first.ctx / 1000).toFixed(0)}k ctx` : '',
          first.uncensored ? '🔓 uncensored' : ''
        ].filter(Boolean).join(' · ');
      } else {
        sel.value = found.id;
        AppState.selectedModel = found.id;
        AppState.persistState();
        UI.updateModelLabel(found.name);
        const ctxK = found.ctx ? `${(found.ctx / 1000).toFixed(0)}k ctx` : '';
        const roleBadge = found.role && found.role !== 'general' ? `🏷️ ${found.role}` : '';
        const costBadge = found.costTier ? (found.costTier === 'free' ? '🎁 Free' : `💰 ${found.costTier}`) : '';
        UI.el('modelMeta').textContent = [costBadge, roleBadge, found.paramTier !== '?' ? found.paramTier : '', ctxK, found.uncensored ? '🔓 uncensored' : ''].filter(Boolean).join(' · ');
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
    const hint = UI.el('modelFilterHint');
    const searchVal = UI.el('searchInput')?.value?.trim();
    // FIX Dev: use AppState.allModels directly
    const total = AppState.allModels.length;
    if (hint) {
      hint.textContent = (searchVal && models.length < total)
        ? `${models.length} of ${total} models shown`
        : '';
    }

    if (!models || models.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'none';
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = 'No matching models';
      sel.appendChild(opt);
      return;
    }

    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const cooldownSecs = AppState.modelCooldownSecondsLeft(m.id);
      const cooldownTag  = cooldownSecs > 0 ? ` ⏳ ${cooldownSecs}s` : '';
      const roleTag = m.role && m.role !== 'general' ? ` [${m.role}]` : '';
      opt.textContent = badge + m.name + roleTag + (m.uncensored ? ' 🔓' : '') + cooldownTag;
      if (m.id === AppState.selectedModel) opt.selected = true;
      sel.appendChild(opt);
    });

    this._startCooldownCountdown(models, sel);
  },

  _startCooldownCountdown(models, sel) {
    if (!AppState.hasActiveCooldowns()) {
      if (this._cooldownInterval) {
        clearInterval(this._cooldownInterval);
        this._cooldownInterval = null;
      }
      return;
    }
    if (this._cooldownInterval) return;

    this._cooldownInterval = setInterval(() => {
      if (!AppState.hasActiveCooldowns()) {
        clearInterval(this._cooldownInterval);
        this._cooldownInterval = null;
        return;
      }
      const providerCfg = API.getProvider();
      const badge = providerCfg?.badgeLabel ? `[${providerCfg.badgeLabel}] ` : '';
      Array.from(sel.options).forEach(opt => {
        const model = models.find(m => m.id === opt.value);
        if (!model) return;
        const secs = AppState.modelCooldownSecondsLeft(model.id);
        const tag  = secs > 0 ? ` ⏳ ${secs}s` : '';
        opt.textContent = badge + model.name + (model.uncensored ? ' 🔓' : '') + tag;
      });
    }, 1000);
  },

  setupChatListeners() {
    const userInput = UI.el('userInput');

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });

    // FIX Marcus: debounce textarea resize to avoid forced reflow on every keystroke
    const resizeInput = Utils.debounce((el) => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }, 16);

    userInput.addEventListener('input', (e) => {
      UI.updateCharCount(e.target.value.length);
      resizeInput(e.target);
    });

    UI.el('sendBtn').addEventListener('click', () => this.sendMessage());

    UI.el('stopBtn').addEventListener('click', () => {
      API.cancelRequest();
      this._sending = false;
      UI.setSendButtonState(true);
      UI.removeTyping();
      UI.toast('Generation stopped', 'info');
    });

    document.querySelectorAll('.persona-card').forEach(card => {
      const activate = () => {
        const prompt = card.dataset.prompt;
        if (!prompt) return;
        AppState.currentPersonaPrompt = prompt;
        AppState.persistState();
        // FIX Priya: update aria-pressed on all persona cards
        document.querySelectorAll('.persona-card').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('active');
        card.setAttribute('aria-pressed', 'true');
        const name = card.querySelector('strong')?.textContent || 'Persona';
        UI.setPersonaLabel(name);
        // FIX Sofia: insert a divider in chat when persona changes mid-conversation
        if (AppState.chatHistory.length > 0) {
          UI.appendDivider(`Persona changed to ${name}`);
        }
        UI.toast(`Persona: ${name}`, 'info');
        this._updateWelcomeChips(name);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const userInput = UI.el('userInput');
        if (!userInput) return;
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

  setupAttachmentListeners() {
    const attachBtn = UI.el('attachBtn');
    const fileInput = UI.el('fileAttachmentInput');
    const composerBox = UI.el('composerBox');
    const userInput = UI.el('userInput');

    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
          this.processFiles(e.target.files);
          fileInput.value = '';
        }
      });
    }

    // Prevent unhandled file drops anywhere on window from navigating the page away
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
      }
    });

    window.addEventListener('drop', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
      }
    });

    if (composerBox) {
      ['dragenter', 'dragover'].forEach(evt => {
        composerBox.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          composerBox.classList.add('drag-over');
        });
      });

      ['dragleave', 'dragend', 'drop'].forEach(evt => {
        composerBox.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          composerBox.classList.remove('drag-over');
        });
      });

      composerBox.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          this.processFiles(e.dataTransfer.files);
        }
      });
    }

    if (userInput) {
      userInput.addEventListener('paste', (e) => {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
          this.processFiles(e.clipboardData.files);
        }
      });
    }
  },

  async processFiles(fileList) {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);

    for (const file of files) {
      if (AppState.attachedFiles.length >= AppState.MAX_ATTACHMENTS) {
        UI.toast(`Maximum ${AppState.MAX_ATTACHMENTS} files allowed at once.`, 'warning');
        break;
      }

      const cleanName = file.name.replace(/[^\w.\-\s]/g, '_').slice(0, 80);

      if (file.size > AppState.MAX_FILE_SIZE) {
        UI.toast(`"${cleanName}" exceeds 500 KB limit.`, 'warning');
        continue;
      }

      if (AppState.getTotalAttachmentSize() + file.size > AppState.MAX_TOTAL_ATTACHMENT_SIZE) {
        UI.toast(`Total attachment size limit (2 MB) exceeded.`, 'warning');
        break;
      }

      try {
        let content = '';
        let isImage = false;
        let previewUrl = null;

        if (file.type.startsWith('image/')) {
          isImage = true;
          try { previewUrl = URL.createObjectURL(file); } catch (_) {}
          content = `[Image attachment: ${cleanName}]`;
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const pdfjsLib = await import('pdfjs-dist');
            if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = '';
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let extracted = '';
            for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
              const page = await pdf.getPage(i);
              const textObj = await page.getTextContent();
              const pageStr = textObj.items.map(it => it.str).join(' ');
              extracted += `[Page ${i}]\n${pageStr}\n\n`;
            }
            content = extracted.trim() || `[PDF: ${cleanName} - No text extracted]`;
          } catch (pdfErr) {
            console.warn('PDF extraction fallback:', pdfErr);
            content = `[PDF: ${cleanName} - Client-side text extraction not supported]`;
          }
        } else {
          content = await file.text();
        }

        const res = AppState.addAttachment({
          name: cleanName,
          type: file.type || 'text/plain',
          size: file.size,
          content,
          isImage,
          previewUrl,
        });

        if (!res.ok) {
          UI.toast(res.error, 'warning');
        }
      } catch (err) {
        console.error('Failed to read file:', err);
        UI.toast(`Failed to read "${cleanName}"`, 'error');
      }
    }
    this.renderAttachmentList();
  },

  renderAttachmentList() {
    UI.renderAttachments(AppState.attachedFiles, (index) => {
      AppState.removeAttachment(index);
      this.renderAttachmentList();
    });
  },

  setupConversationListeners() {
    UI.el('newChatBtn')?.addEventListener('click', () => {
      const searchInput = UI.el('convSearchInput');
      if (searchInput) searchInput.value = '';
      this.newConversation();
    });

    const searchInput = UI.el('convSearchInput');
    if (searchInput) {
      const doSearch = Utils.debounce((query) => {
        this.renderConversationList();
      }, 150);

      searchInput.addEventListener('input', (e) => doSearch(e.target.value));
      searchInput.addEventListener('search', (e) => doSearch(e.target.value));
    }
  },

  renderConversationList() {
    const searchInput = UI.el('convSearchInput');
    const q = searchInput?.value?.trim();

    if (q) {
      const results = AppState.searchConversations(q);
      UI.renderConversations(
        results,
        AppState.currentConversationId,
        {
          onSwitch: (id, msgIdx) => this.switchConversation(id, msgIdx),
          onRename: (id, title) => this.renameConversation(id, title),
          onDelete: (id, title) => this.deleteConversation(id, title),
        },
        'No matching chats'
      );
      return;
    }

    const convs = AppState.listConversations();
    UI.renderConversations(convs, AppState.currentConversationId, {
      onSwitch: (id) => this.switchConversation(id),
      onRename: (id, title) => this.renameConversation(id, title),
      onDelete: (id, title) => this.deleteConversation(id, title),
    });
  },

  newConversation() {
    if (this._sending) {
      UI.toast('Please wait for current response to complete', 'warning');
      return;
    }
    const searchInput = UI.el('convSearchInput');
    if (searchInput) searchInput.value = '';
    AppState.createConversation('New chat');
    AppState.clearAttachments();
    this.renderAttachmentList();
    UI.renderChatHistory(AppState.chatHistory);
    UI.hideUnsavedBanner();
    this.renderConversationList();
    UI.toast('Started new chat', 'info');
  },

  switchConversation(id, msgIndex) {
    if (id !== AppState.currentConversationId) {
      if (this._sending) {
        UI.toast('Please wait for current response to complete', 'warning');
        return;
      }
      const ok = AppState.switchConversation(id);
      if (ok) {
        AppState.clearAttachments();
        this.renderAttachmentList();
        UI.renderChatHistory(AppState.chatHistory);
        UI.hideUnsavedBanner();
        this.renderConversationList();
      }
    }
    if (msgIndex !== undefined && msgIndex >= 0) {
      setTimeout(() => UI.scrollToMessageIndex(msgIndex), 50);
    }
  },

  renameConversation(id, currentTitle) {
    UI.promptModal('Rename conversation:', currentTitle, (newTitle) => {
      AppState.renameConversation(id, newTitle);
      this.renderConversationList();
      UI.toast('Conversation renamed', 'info');
    });
  },

  deleteConversation(id, title) {
    UI.confirmModal(`Delete "${title || 'this conversation'}"?`, () => {
      AppState.deleteConversation(id);
      UI.renderChatHistory(AppState.chatHistory);
      UI.hideUnsavedBanner();
      this.renderConversationList();
      UI.toast('Conversation deleted', 'info');
    });
  },

  _updateWelcomeChips(personaName) {
    const chipSets = {
      'Assistant': [
        'Explain quantum entanglement simply',
        'Write a Python web scraper',
        'Summarise this in 3 bullet points',
        'What are the pros and cons of microservices?',
      ],
      'Tutor': [
        'Walk me through recursion step by step',
        'Explain Big O notation with examples',
        'How does gradient descent work?',
        'Quiz me on JavaScript closures',
      ],
      'Creative Writer': [
        'Write a noir opening paragraph',
        'Give me a plot twist for my story',
        'Describe a futuristic city in 3 sentences',
        'Write dialogue between two rivals',
      ],
      'Code Reviewer': [
        'Review this function for edge cases',
        'What design pattern fits this problem?',
        'Spot the bug in this code',
        'How would you refactor this class?',
      ],
      'Debate Coach': [
        'Steelman the opposing argument',
        'Find the weakest point in this position',
        'How do I rebut "slippery slope"?',
        'Give me the strongest counter-argument',
      ],
    };
    const chips = document.querySelectorAll('.chip');
    const prompts = chipSets[personaName];
    if (!prompts || !chips.length) return;
    chips.forEach((chip, i) => {
      if (prompts[i]) chip.textContent = prompts[i];
    });
  },

  _estimateMessagesTokens(messages) {
    return messages.reduce((sum, m) => sum + Math.ceil((m.content || '').length / 4), 0);
  },

  async sendMessage(options = {}) {
    // FIX Zara/Dev: guard against DOMPurify not loaded
    if (!window.DOMPurify) return;

    if (this._sending) return;
    const { isRetry = false } = options;

    const userInput = UI.el('userInput');
    const text = userInput?.value.trim() || '';
    const hasAttachments = AppState.attachedFiles.length > 0;
    if (!text && !hasAttachments) return;

    if (AppState.selectedModel === 'none') {
      UI.toast('Please select a model first', 'warning');
      return;
    }

    if (!AppState.isAuthenticatedFor(AppState.currentProvider)) {
      UI.toast('Please authenticate first', 'warning');
      return;
    }

    // FIX S: retries bypass the rate-limit bucket — they are re-attempts,
    // not new requests, and should not consume an additional slot.
    if (!isRetry) {
      const rateCheck = AppState.canMakeRequest();
      if (!rateCheck.allowed) {
        UI.toast(`Rate limited — try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`, 'warning');
        return;
      }
      AppState.recordRequest();
    }

    // Build prompt including formatted attachments
    let fullUserPrompt = text;
    if (hasAttachments) {
      const formattedAttachments = AppState.attachedFiles.map(f => {
        if (f.isImage) {
          return `[Attached Image: ${f.name} (${Utils.formatFileSize(f.size)}) — Note: vision is not enabled on this text endpoint]`;
        }
        return `--- Attached File: ${f.name} ---\n${f.content || ''}\n----------------------------------`;
      }).join('\n\n');
      fullUserPrompt = text ? `${text}\n\n${formattedAttachments}` : formattedAttachments;
    }

    const rawMessages = [
      { role: 'system', content: AppState.currentPersonaPrompt },
      ...AppState.chatHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: fullUserPrompt },
    ];
    const messages = AppState.trimHistoryToFitContext(rawMessages);
    const sentContextUsage = this._estimateMessagesTokens(messages) / AppState.getContextLimit();

    this._lastUserText = text || fullUserPrompt;
    UI.removeRetryButton();
    AppState.addMessage('user', fullUserPrompt);
    this.renderConversationList();

    // Clear attachments & composer input
    AppState.clearAttachments();
    this.renderAttachmentList();
    userInput.value = '';
    userInput.style.height = 'auto';
    UI.updateCharCount(0);
    UI.showChat();
    UI.appendMessage('user', fullUserPrompt);
    UI.setSendButtonState(false);
    UI.showTyping();
    UI.hideUnsavedBanner();
    this._sending = true;

    const currentModelId = AppState.selectedModel;
    let streamBubble = null;
    let fullContent  = '';
    let firstToken   = true;

    API.createAbortController();

    try {
      // FIX: wire Utils.retryWithBackoff for transient network errors (not auth/rate-limit errors).
      // We define the streaming call as a thunk and wrap it — on a genuine network drop it will
      // retry up to 2 times with exponential backoff before surfacing the error to the user.
      const doStream = () => API.sendMessageStream(
        messages,
        currentModelId,
        (delta) => {
          if (firstToken) {
            UI.removeTyping();
            streamBubble = UI.createStreamBubble(currentModelId);
            firstToken = false;
          }
          fullContent += delta;
          UI.appendStreamToken(streamBubble, delta);
          // FIX Marcus: throttled rAF scroll instead of direct scrollTop
          this._scheduleScroll();
        },
        { temperature: AppState.temperature, maxTokens: AppState.maxTokens }
      );

      // Only retry on transient network failures — propagate API error codes immediately.
      const response = await Utils.retryWithBackoff(
        doStream,
        2,    // max retries
        800,  // base delay ms
        (err) => !err.code   // only retry when there is no structured error code
      ).catch(err => { throw err; });

      if (streamBubble) {
        UI.finaliseStreamBubble(streamBubble, fullContent);
      } else {
        UI.removeTyping();
        const content = response?.choices?.[0]?.message?.content || '';
        fullContent = content;
        if (fullContent) UI.appendMessage('assistant', fullContent, currentModelId);
      }

      const finalContent = fullContent || response?.choices?.[0]?.message?.content || '';
      if (finalContent) {
        AppState.addMessage('assistant', finalContent, currentModelId);
        this.renderConversationList();
        const { promptTokens, completionTokens } = API.extractTokenUsage(response);
        AppState.updateTokens(promptTokens, completionTokens);
        UI.updateStats(AppState.totalPromptTokens, AppState.totalCompletionTokens);
        UI.updateContextBar();
        if (sentContextUsage > 0.9) {
          UI.toast('⚠️ Context nearly full (>90%). Consider exporting and starting a new chat.', 'warning', 7000);
        }
        UI.updateRateLimitInfo(AppState.getRemainingRequests());
        UI.updateDiagnostics(AppState.currentProvider, AppState.selectedModel);
        UI.addRetryButton(() => this._retryLastMessage());
        UI.maybeShowUnsavedBanner(() => this.exportChat('md'));
      }

    } catch (error) {
      UI.removeTyping();

      if (error.code === 'ABORTED') {
        if (fullContent && fullContent.trim()) {
          if (streamBubble) {
            UI.finaliseStreamBubble(streamBubble, fullContent);
          }
          AppState.addMessage('assistant', fullContent, currentModelId);
          this.renderConversationList();
        } else if (streamBubble) {
          UI.removeStreamBubble(streamBubble);
        }
      } else {
        if (streamBubble) UI.removeStreamBubble(streamBubble);

        if (error.code === 'UPSTREAM_RATE_LIMIT') {
          AppState.setModelCooldown(AppState.selectedModel, 60000);
          this._renderModelOptions(AppState.allModels, UI.el('modelSelect'));
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
          AppState.apiKey  = '';
          AppState.hfToken = '';
          UI.setAuthState(false, 'Authentication failed');
          UI.toast(error.message || 'Authentication error — please re-enter your API key', 'error');
          const input = UI.el('apiKeyInput');
          if (input) { input.value = ''; input.focus(); }
        } else if (error.code === 'MODEL_NOT_FREE' || error.code === 'MODEL_MISSING') {
          UI.toast(error.message || 'Model unavailable', 'error');
          await this.refreshModels();
        } else {
          UI.toast(error.message || 'Request failed — please try again', 'error');
        }
      }
    } finally {
      this._sending = false;
      UI.setSendButtonState(true);
    }
  },

  _retryLastMessage() {
    if (!this._lastUserText || this._sending) return;
    const userInput = UI.el('userInput');
    if (userInput) userInput.value = this._lastUserText;
    const saved = this._lastUserText;
    this.sendMessage({ isRetry: true });
    if (!this._lastUserText) this._lastUserText = saved;
  },

  setupUIListeners() {
    const modal     = UI.el('shortcuts-modal');
    const themeMenu = UI.el('theme-menu');

    UI.el('statsBtn').addEventListener('click', () => UI.toggleStats());
    UI.el('rp-close').addEventListener('click', () => {
      UI.el('rightPanel')?.classList.remove('open');
    });

    // FIX Sofia/Zara: replaced native confirm() with accessible modal
    UI.el('clearBtn').addEventListener('click', () => {
      const doClear = () => {
        AppState.clearAttachments();
        this.renderAttachmentList();
        UI.clearChat();
        this.renderConversationList();
        UI.hideUnsavedBanner();
        UI.toast('Chat cleared', 'info');
      };
      if (AppState.chatHistory.length && !AppState.chatExported) {
        UI.confirmModal('Clear this conversation?', doClear);
      } else {
        doClear();
      }
    });

    const resetBtn = UI.el('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        UI.confirmModal('Reset session (auth, model, chat)?', () => {
          AppState.reset();
          AppState.clearAttachments();
          this.renderAttachmentList();
          UI.clearChat();
          this.renderConversationList();
          UI.hideUnsavedBanner();
          const input = UI.el('apiKeyInput');
          if (input) input.value = '';
          UI.setAuthState(false, 'Not authenticated');
          const sel = UI.el('modelSelect');
          if (sel) sel.innerHTML = '<option value="none" disabled selected>— authenticate first —</option>';
          UI.updateModelLabel('No model selected');
          UI.toast('Session reset', 'info');
        });
      });
    }

    UI.el('shortcutsBtn').addEventListener('click', () => {
      modal?.classList.toggle('open');
    });
    UI.el('shortcutsClose')?.addEventListener('click', () => {
      modal?.classList.remove('open');
    });
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    UI.el('sidebarToggle')?.addEventListener('click', () => UI.toggleSidebar());
    UI.el('mobileOverlay')?.addEventListener('click', () => UI.toggleSidebar());

    themeMenu?.querySelectorAll('.theme-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const theme = opt.dataset.theme;
        AppState.setTheme(theme);
        UI.setTheme(theme);
        themeMenu.classList.remove('open');
        UI.toast(`Theme: ${opt.textContent.trim()}`, 'info');
      });
    });
    UI.el('themeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      themeMenu?.classList.toggle('open');
    });

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

    const maxSlider = UI.el('maxTokensSlider');
    const maxVal    = UI.el('maxTokensVal');
    if (maxSlider) {
      maxSlider.value = AppState.maxTokens;
      if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();
      maxSlider.addEventListener('input', (e) => {
        AppState.maxTokens = parseInt(e.target.value, 10);
        if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();
        AppState.persistState();
      });
    }

    // FIX R: single consolidated Escape handler — no duplicate listeners
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      themeMenu?.classList.remove('open');
      UI.el('export-menu')?.classList.remove('open');
      modal?.classList.remove('open');
      if (AppState.sidebarOpen) UI.toggleSidebar();
    });

    // FIX: Ctrl+K model search — moved here from inline <script> in index.html
    // so all keyboard shortcuts live in one place and are consistently managed.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const s = UI.el('searchInput');
        if (s) { s.focus(); s.select(); }
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-wrap'))  themeMenu?.classList.remove('open');
      if (!e.target.closest('.export-wrap')) UI.el('export-menu')?.classList.remove('open');
    });
  },

  setupSearchListeners() {
    const searchInput = UI.el('searchInput');
    if (!searchInput) return;

    const doSearch = Utils.debounce((query) => {
      const sel    = UI.el('modelSelect');
      // FIX Dev: use AppState.allModels directly
      const models = AppState.allModels;
      if (!models?.length || !sel) return;

      const q = query.trim().toLowerCase();
      const filtered = q
        ? models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
        : models;

      UI.updateModelCount(filtered.length, models.length);
      this._renderModelOptions(filtered, sel);

      if (filtered.find(m => m.id === AppState.selectedModel)) {
        sel.value = AppState.selectedModel;
      } else if (filtered.length) {
        sel.value = filtered[0].id;
      }
    }, 150);

    searchInput.addEventListener('input', (e) => doSearch(e.target.value));
    searchInput.addEventListener('search', (e) => doSearch(e.target.value));
  },

  setupExportListeners() {
    const exportBtn  = UI.el('exportBtn');
    const exportMenu = UI.el('export-menu');

    // FIX Sofia: CSS class-only toggle — no style.display manipulation
    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu?.classList.toggle('open');
    });

    const closeExport = () => exportMenu?.classList.remove('open');

    UI.el('exportMd')?.addEventListener('click',   () => { this.exportChat('md');   closeExport(); });
    UI.el('exportJson')?.addEventListener('click',  () => { this.exportChat('json'); closeExport(); });
    UI.el('exportTxt')?.addEventListener('click',   () => { this.exportChat('txt');  closeExport(); });
    UI.el('exportCopy')?.addEventListener('click',  () => { this.exportChat('copy'); closeExport(); });
    // Phase 4: PDF export
    UI.el('exportPdf')?.addEventListener('click',   () => { this.exportChat('pdf'); closeExport(); });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.exportChat('md');
      }
    });
  },

  exportChat(format) {
    return this._exportChat(format);
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
          exported:   new Date().toISOString(),
          provider:   AppState.currentProvider,
          model:      AppState.selectedModel,
          promptTokens:     AppState.totalPromptTokens,
          completionTokens: AppState.totalCompletionTokens,
          totalTokens:      AppState.totalPromptTokens + AppState.totalCompletionTokens,
          turns:      AppState.sessionStats.turnCount,
          messages:   AppState.chatHistory,
        }, null, 2);
        Utils.downloadAsFile(`${base}.json`, data, 'application/json');

      } else if (format === 'txt') {
        const lines = AppState.chatHistory.map(m =>
          `[${m.role.toUpperCase()}] ${new Date(m.timestamp).toLocaleTimeString()}\n${m.content}`
        );
        Utils.downloadAsFile(`${base}.txt`, lines.join('\n\n---\n\n'), 'text/plain');

      } else if (format === 'copy') {
        const md = AppState.chatHistory.map(m =>
          `**${m.role === 'user' ? 'You' : 'Assistant'}:** ${m.content}`
        ).join('\n\n---\n\n');
        navigator.clipboard.writeText(md)
          .then(() => UI.toast('📋 Copied to clipboard', 'success'))
          .catch(() => UI.toast('Clipboard copy failed', 'error'));
        AppState.chatExported = true;
        UI.hideUnsavedBanner();
        return;

      } else if (format === 'pdf') {
        this._exportPdf(base);
        return;

      } else {
        const header = [
          `# ChatWithIt Export`,
          `**Date:** ${new Date().toLocaleString()}`,
          `**Provider:** ${AppState.currentProvider}`,
          `**Model:** ${AppState.selectedModel}`,
          `**Tokens:** ${AppState.totalPromptTokens + AppState.totalCompletionTokens} total (${AppState.totalPromptTokens} prompt + ${AppState.totalCompletionTokens} completion)`,
          `**Turns:** ${AppState.sessionStats.turnCount}`,
          '',
          '---',
          '',
        ].join('\n');
        const body = AppState.chatHistory.map(m =>
          `### ${m.role === 'user' ? '👤 You' : '🤖 Assistant'} \`${new Date(m.timestamp).toLocaleTimeString()}\`\n\n${m.content}`
        ).join('\n\n---\n\n');
        Utils.downloadAsFile(`${base}.md`, header + body, 'text/markdown');
      }

      AppState.chatExported = true;
      UI.hideUnsavedBanner();
      UI.toast(`✅ Exported as ${format.toUpperCase()}`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      UI.toast(`Export failed: ${err.message || 'unknown error'}`, 'error', 5000);
    }
  },

  /**
   * Phase 4: PDF export via html2canvas + jsPDF.
   * Renders the chat messages area to canvas, then saves as a PDF with a header.
   */
  async _exportPdf(base) {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');

      const chat = UI.el('chatBody');
      if (!chat) { UI.toast('Nothing to export', 'info'); return; }

      UI.toast('Rendering PDF…', 'info', 2000);

      const canvas = await html2canvas(chat, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const headerH = 56;

      // ── Header ────────────────────────────────────────────────────────────
      const title = AppState.chatHistory[0]?.content?.slice(0, 60) || 'ChatWithIt Conversation';
      const modelName = (AppState.allModels.find(m => m.id === AppState.selectedModel)?.name) || AppState.selectedModel || 'unknown';
      const dateStr = new Date().toLocaleString();

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text('ChatWithIt Export', margin, margin + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      pdf.text(`Title: ${title}`, margin, margin + 20);
      pdf.text(`Model: ${modelName}`, margin, margin + 32);
      pdf.text(`Date: ${dateStr}`, margin, margin + 44);
      pdf.setTextColor(0);

      // divider line
      pdf.setDrawColor(200);
      pdf.line(margin, margin + headerH - 8, pageW - margin, margin + headerH - 8);

      // ── Image (chat screenshot) ─────────────────────────────────────────────
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * imgW;

      let heightLeft = imgH;
      let position = margin + headerH;
      pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
      heightLeft -= (pageH - (margin + headerH));

      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgH - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        heightLeft -= (pageH - margin * 2);
      }

      pdf.save(`${base}.pdf`);
      AppState.chatExported = true;
      UI.hideUnsavedBanner();
      UI.toast('✅ Exported as PDF', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      UI.toast(`PDF export failed: ${err.message || 'unknown error'}`, 'error', 5000);
    }
  },

  _setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      // FIX: only warn if there are at least 3 messages (not just 1 orphan)
      if (AppState.chatHistory.length >= 3 && !AppState.chatExported) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },

  // Phase 3: Keyboard shortcuts and high contrast toggle
  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl+N → start new conversation
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        const searchInput = UI.el('convSearchInput');
        if (searchInput) searchInput.value = '';
        if (typeof this.newConversation === 'function') this.newConversation();
        return;
      }

      // Cmd/Ctrl+/ → focus chat composer input
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        const userInput = UI.el('userInput');
        if (userInput) {
          userInput.focus();
          userInput.setSelectionRange(userInput.value.length, userInput.value.length);
        }
        return;
      }

      // Ctrl+Enter → send message
      if (e.ctrlKey && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        if (typeof this.sendMessage === 'function') this.sendMessage();
      }

      // Ctrl+Shift+E → open export menu
      if (e.ctrlKey && e.shiftKey && e.key === 'e') {
        e.preventDefault();
        const exportMenu = UI.el('export-menu');
        if (exportMenu) exportMenu.classList.toggle('open');
      }

      // Command palette (Ctrl+K) - search chats/personas
      if (e.ctrlKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const search = UI.el('searchInput');
        if (search) { search.focus(); search.select(); }
      }

      // Escape key → close open menus/overlays or clear active search
      if (e.key === 'Escape') {
        const openOverlay = document.querySelector('.confirm-overlay.open');
        if (openOverlay) {
          openOverlay.classList.remove('open');
          setTimeout(() => openOverlay.remove(), 200);
          return;
        }

        const exportMenu = UI.el('export-menu');
        if (exportMenu && exportMenu.classList.contains('open')) {
          exportMenu.classList.remove('open');
          return;
        }

        const themeMenu = UI.el('theme-menu');
        if (themeMenu && themeMenu.classList.contains('open')) {
          themeMenu.classList.remove('open');
          return;
        }

        const convSearch = UI.el('convSearchInput');
        if (convSearch && (document.activeElement === convSearch || convSearch.value)) {
          convSearch.value = '';
          convSearch.blur();
          this.renderConversationList();
          return;
        }

        const personaSearch = UI.el('searchInput');
        if (personaSearch && (document.activeElement === personaSearch || personaSearch.value)) {
          personaSearch.value = '';
          personaSearch.blur();
          this.buildParamFilter();
          return;
        }
      }
    });

    // Add tooltips to buttons for desktop
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
      if (!btn.title) btn.title = btn.textContent.trim();
    });
  },

  _setupHighContrastToggle() {
    // Add high contrast toggle button to header after theme button
    const themeBtn = UI.el('themeBtn');
    if (!themeBtn) return;

    const hcBtn = document.createElement('button');
    hcBtn.id = 'highContrastBtn';
    hcBtn.className = 'btn btn-ghost btn-icon';
    hcBtn.type = 'button';
    hcBtn.title = 'Toggle high contrast mode';
    hcBtn.setAttribute('aria-label', 'Toggle high contrast mode');
    hcBtn.textContent = '◐';
    hcBtn.addEventListener('click', () => {
      const enabled = !AppState.highContrast;
      AppState.setHighContrast(enabled);
      UI.toast(`High contrast ${enabled ? 'enabled' : 'disabled'}`, 'info');
    });

    themeBtn.parentNode.insertBefore(hcBtn, themeBtn.nextSibling);
  },

  _restorePersonaCard() {
    const saved = AppState.currentPersonaPrompt;
    if (!saved) return;
    let matched = false;
    document.querySelectorAll('.persona-card').forEach(card => {
      const match = card.dataset.prompt === saved;
      card.classList.toggle('active', match);
      card.setAttribute('aria-pressed', String(match));
      if (match) {
        matched = true;
        const name = card.querySelector('strong')?.textContent || '';
        UI.setPersonaLabel(name);
        this._updateWelcomeChips(name);
      }
    });
    if (!matched) {
      AppState.currentPersonaPrompt = AppState.defaultPersonaPrompt;
      AppState.persistState();
      const defaultCard = document.querySelector('.persona-card[data-prompt*="helpful AI assistant"]');
      if (defaultCard) {
        defaultCard.classList.add('active');
        defaultCard.setAttribute('aria-pressed', 'true');
        const name = defaultCard.querySelector('strong')?.textContent || 'Assistant';
        UI.setPersonaLabel(name);
      }
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());

export default App;
