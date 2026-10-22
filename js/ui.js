/**
 * UI Manager — redesigned
 * Glassmorphism dark/light, animated messages, message actions, scroll-to-bottom,
 * Ctrl+K model search focus, smooth scroll, header model badge.
 */

import { AppState } from './state.js';
import { Utils } from './utils.js';

export const UI = {
  el(id) { return document.getElementById(id); },

  initEnhancements() {
    // 1. The chat list is a navigable log, but it is NOT a live region: streamed tokens would be
    //    re-announced on every chunk. Completion is announced once through #chatAnnouncer instead.
    const chatList = this.el('chatBody');
    if (chatList) {
      chatList.setAttribute('role', 'log');
      chatList.setAttribute('aria-live', 'off');
      chatList.removeAttribute('aria-relevant');
    }

    // 4. All inputs must have associated labels
    // (handled via index.html label/aria-label already, but ensure dynamic inputs get them)
    const inputs = document.querySelectorAll('input, select, textarea, button');
    inputs.forEach(input => {
      if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby') && input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (!label) {
          // Skip if already has accessible name via children
          if (!input.textContent.trim()) {
            input.setAttribute('aria-label', input.placeholder || input.id);
          }
        }
      }
    });
  },

  loadTheme() {
    let stored = 'dark';
    try { stored = localStorage.getItem('cwi_theme') || 'dark'; } catch (_) {}
    this.ensureSystemThemeListener();
    this.setThemeAttribute(stored);
  },

  loadLowPowerMode() {
    let stored = false;
    try { stored = localStorage.getItem('cwi_low_power') === 'true'; } catch (_) {}
    this.setLowPowerAttribute(stored);
    const toggle = this.el('lowPowerToggle');
    if (toggle) toggle.checked = stored;
    const label = this.el('lowPowerLabel');
    if (label) label.textContent = stored ? 'On' : 'Off';
  },

  setLowPowerAttribute(enabled) {
    document.documentElement.setAttribute('data-low-power', enabled ? 'true' : 'false');
  },

  themeColors: {
    dark: '#0d0f1a',
    light: '#f4f7ff',
    violet: '#0a0a0f',
    ember: '#17100e',
    forest: '#091511',
    aurora: '#07131b',
  },

  setThemeAttribute(theme) {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    this.updateThemeMenu(theme);
    this.syncThemeColor(resolved);
  },

  syncThemeColor(resolved) {
    const color = this.themeColors[resolved] || this.themeColors.dark;
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', color);
    });
  },

  ensureSystemThemeListener() {
    if (this._systemThemeListener || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    if (!query.addEventListener) return;
    this._systemThemeListener = () => {
      let stored = 'dark';
      try { stored = localStorage.getItem('cwi_theme') || 'dark'; } catch (_) {}
      if (stored === 'system') this.setThemeAttribute('system');
    };
    query.addEventListener('change', this._systemThemeListener);
  },

  updateThemeMenu(theme) {
    document.querySelectorAll('.theme-opt').forEach(option => {
      const selected = option.dataset.theme === theme;
      option.setAttribute('aria-pressed', String(selected));
    });
  },

  loadSidebarState() {
    if (window.matchMedia('(min-width: 1101px)').matches) {
      try {
        document.body.classList.toggle('sidebar-collapsed', localStorage.getItem('cwi_sidebar_collapsed') === 'true');
      } catch (_) {}
    }
    this.syncSidebarToggleState();
  },

  syncSidebarToggleState() {
    const toggle = this.el('sidebarToggle');
    if (!toggle) return;
    const isMobile = this._isMobile();
    const isOpen = isMobile
      ? Boolean(this.el('sidebar')?.classList.contains('open'))
      : !document.body.classList.contains('sidebar-collapsed');
    const isCollapsed = !isMobile && !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isMobile
      ? (isOpen ? 'Close menu' : 'Open menu')
      : (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'));
    toggle.title = isMobile ? 'Menu' : (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  },

  setTheme(theme) {
    this.ensureSystemThemeListener();
    this.setThemeAttribute(theme);
    try { localStorage.setItem('cwi_theme', theme); } catch (_) {}
  },

  setAuthState(ok, label) {
    const dot    = this.el('authDot');
    const status = this.el('authStatus');
    if (dot)    dot.className    = 'auth-dot ' + (ok ? 'ok' : 'err');
    if (status) status.textContent = label;
    this.updateWelcomeHint();
  },

  // First-use guidance on the empty screen: say what to do next, not just what the app is.
  updateWelcomeHint() {
    const hint = this.el('welcomeHint');
    if (!hint) return;
    const authed = AppState.isAuthenticatedFor(AppState.currentProvider);
    const hasModel = AppState.selectedModel && AppState.selectedModel !== 'none';
    if (!authed) hint.textContent = 'Connect a provider in the sidebar (Menu on mobile) to begin.';
    else if (!hasModel) hint.textContent = 'Connected. Choose a model in the sidebar to start chatting.';
    else hint.textContent = 'Ready to chat. Pick a suggestion or write your own.';
  },

  setChatBusy(busy) {
    this.el('chatBody')?.setAttribute('aria-busy', String(Boolean(busy)));
  },

  showSecurityBanner(message) {
    let banner = this.el('security-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'security-banner';
      banner.setAttribute('role', 'alert');
      Object.assign(banner.style, {
        position:'fixed',top:'0',left:'0',right:'0',zIndex:'9999',
        background:'#dc2626',color:'#fff',textAlign:'center',
        padding:'.75rem 1rem',fontSize:'.9rem',fontWeight:'600',
        boxShadow:'0 2px 8px rgba(0,0,0,.3)',
      });
      document.body.prepend(banner);
    }
    banner.textContent = message;
  },

  maybeShowUnsavedBanner(onExport) {
    if (AppState.chatExported) return;
    if (AppState.chatHistory.length < 5) return;
    if (this.el('unsaved-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'unsaved-banner';
    banner.setAttribute('role', 'status');
    const marker = document.createElement('span');
    marker.className = 'unsaved-symbol';
    marker.setAttribute('aria-hidden', 'true');
    marker.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M5 4h12l3 3v13H4V4h1Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>';
    const exportButton = document.createElement('button');
    exportButton.id = 'unsaved-export-btn';
    exportButton.type = 'button';
    exportButton.textContent = 'Export now';
    banner.append(marker, document.createTextNode('Unsaved — '), exportButton);
    const anchor = this.el('composerWrap');
    if (anchor) anchor.parentNode.insertBefore(banner, anchor);
    exportButton.addEventListener('click', () => { if (typeof onExport === 'function') onExport(); });
  },

  hideUnsavedBanner() {
    const b = this.el('unsaved-banner');
    if (b) b.remove();
  },

  showChat() {
    const welcome = this.el('welcome');
    if (welcome) welcome.classList.add('hidden');
  },

  clearChat() {
    const body = this.el('chatBody');
    const welcome = this.el('welcome');
    // Remove messages but keep #welcome in the DOM so the empty state can return.
    if (body) Array.from(body.children).forEach(child => { if (child !== welcome) child.remove(); });
    if (welcome) welcome.classList.remove('hidden');
    this.updateWelcomeHint();
    AppState.clearChat();
    this.updateStats(0, 0);
    this.updateContextBar();
    this._updateScrollBtn();
  },

  // Confirm modal — native <dialog> opened with showModal(), so the browser
  // provides top-layer stacking, an inert background, focus containment and Escape.
  // Cancel is the default focus target (the non-destructive action) and focus is
  // restored to whatever opened the dialog. onConfirm only runs from Confirm.
  confirmModal(message, onConfirm, options = {}) {
    const { confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = options;
    const opener = document.activeElement;
    this._confirmSeq = (this._confirmSeq || 0) + 1;
    const msgId = `confirm-msg-${this._confirmSeq}`;

    const dlg = document.createElement('dialog');
    dlg.className = 'confirm-box';
    dlg.setAttribute('role', 'alertdialog');
    dlg.setAttribute('aria-labelledby', msgId);

    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.id = msgId;
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary confirm-cancel';
    cancelBtn.textContent = cancelLabel;
    cancelBtn.autofocus = true;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn-primary confirm-confirm';
    confirmBtn.textContent = confirmLabel;

    actions.append(cancelBtn, confirmBtn);
    dlg.append(msg, actions);
    document.body.appendChild(dlg);

    dlg.addEventListener('close', () => {
      dlg.remove();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    });

    let confirmed = false;
    cancelBtn.addEventListener('click', () => dlg.close('cancel'));
    confirmBtn.addEventListener('click', () => {
      if (confirmed) return;
      confirmed = true;
      dlg.close('confirm');
      onConfirm();
    });
    // Backdrop click: the dialog element itself is the click target only outside its box.
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close('cancel');
    });

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    cancelBtn.focus();
    return dlg;
  },

  // Chat divider (Sofia fix — persona change indicator)
  appendDivider(text) {
    const chat = this.el('chatBody');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = 'chat-divider';
    div.setAttribute('aria-hidden', 'true');
    div.textContent = `— ${text} —`;
    chat.appendChild(div);
    this._scrollToBottom();
  },

  // Accessible announcer (Priya fix — dedicated live region)
  announce(text) {
    const live = this.el('chatAnnouncer');
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  },

  // Message rendering
  _buildMsgWrap(role) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    wrap.setAttribute('role', 'article');
    wrap.setAttribute('aria-label', role === 'user' ? 'You said' : 'Assistant said');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'user' ? 'Y' : 'AI';

    const col = document.createElement('div');
    col.className = 'msg-col';

    wrap.appendChild(avatar);
    wrap.appendChild(col);
    return { wrap, col };
  },

  _buildMeta(role, bubble) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const ts = document.createElement('span');
    ts.className = 'msg-time';
    ts.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    ts.setAttribute('aria-hidden', 'true');

    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy message');
    const copyIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
    const copiedIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
    copyBtn.innerHTML = copyIcon;
    copyBtn.addEventListener('click', () => {
      const text = bubble._rawText || bubble.textContent;
      Utils.copyToClipboard(text).then(ok => {
        if (ok) {
          copyBtn.innerHTML = copiedIcon;
          copyBtn.setAttribute('aria-label', 'Message copied');
          copyBtn.title = 'Copied';
          this.announce('Message copied to clipboard');
          setTimeout(() => {
            if (!copyBtn.isConnected) return;
            copyBtn.innerHTML = copyIcon;
            copyBtn.setAttribute('aria-label', 'Copy message');
            copyBtn.title = 'Copy';
          }, 1500);
        }
      });
    });

    actions.appendChild(copyBtn);
    meta.appendChild(ts);
    meta.appendChild(actions);
    return meta;
  },

  appendMessage(role, text) {
    const chat = this.el('chatBody');
    if (!chat) return;

    const { wrap, col } = this._buildMsgWrap(role);
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble._rawText = text;

    col.appendChild(bubble);
    col.appendChild(this._buildMeta(role, bubble));
    chat.appendChild(wrap);

    if (role === 'assistant') {
      Utils.parseMarkdown(text).then(html => {
        bubble.innerHTML = html;
        this._scrollToBottom();
        this.announce('Response complete');
      });
    } else {
      bubble.textContent = text;
      this._scrollToBottom();
    }
  },

  createStreamBubble() {
    const chat = this.el('chatBody');
    if (!chat) return null;

    const { wrap, col } = this._buildMsgWrap('assistant');
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble streaming';

    const content = document.createElement('span');
    content.className = 'bubble-stream-content';
    bubble.appendChild(content);
    col.appendChild(bubble);
    col.appendChild(this._buildMeta('assistant', bubble));
    chat.appendChild(wrap);
    this._scrollToBottom();
    return bubble;
  },

  appendStreamToken(bubble, delta) {
    if (!bubble) return;
    const content = bubble.querySelector('.bubble-stream-content');
    if (content) {
      content.textContent += delta;
      bubble._rawText = (bubble._rawText || '') + delta;
    }
  },

  finaliseStreamBubble(bubble, fullContent) {
    if (!bubble) return;
    bubble.classList.remove('streaming');
    bubble._rawText = fullContent;
    const content = bubble.querySelector('.bubble-stream-content');
    if (!content) return;
    Utils.parseMarkdown(fullContent).then(html => {
      content.innerHTML = html;
      this._scrollToBottom();
      this.announce('Response complete');
    });
  },

  removeStreamBubble(bubble) {
    if (!bubble) return;
    bubble.closest('.msg')?.remove();
  },

  showTyping() {
    const chat = this.el('chatBody');
    if (!chat || this.el('typing-indicator')) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    wrap.id = 'typing-indicator';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'AI is typing');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'AI';

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    const label = document.createElement('span');
    label.className = 'typing-label';
    label.textContent = 'Thinking';
    typing.appendChild(label);

    wrap.appendChild(avatar);
    wrap.appendChild(typing);
    chat.appendChild(wrap);
    this._scrollToBottom();
  },

  removeTyping() {
    this.el('typing-indicator')?.remove();
  },

  // Scroll helpers
  _scrollToBottom() {
    const chat = this.el('chatBody');
    if (!chat) return;
    requestAnimationFrame(() => {
      chat.scrollTop = chat.scrollHeight;
      this._updateScrollBtn();
    });
  },

  _updateScrollBtn() {
    const chat = this.el('chatBody');
    const btn  = this.el('scrollToBottom');
    if (!chat || !btn) return;
    const atBottom = chat.scrollHeight - chat.clientHeight - chat.scrollTop < 80;
    btn.classList.toggle('show', !atBottom && chat.scrollHeight > chat.clientHeight + 100);
  },

  initScrollBtn() {
    const chat = this.el('chatBody');
    const btn  = this.el('scrollToBottom');
    if (!chat || !btn) return;
    chat.addEventListener('scroll', Utils.throttle(() => this._updateScrollBtn(), 120));
    btn.addEventListener('click', () => this._scrollToBottom());
  },

  // Stats
  updateStats(promptToks, completionToks) {
    const max = Math.max(promptToks, completionToks, 1);
    const setEl  = (id, val) => { const e = this.el(id); if (e) e.textContent = Utils.formatTokens(val); };
    const setBar = (id, pct) => { const e = this.el(id); if (e) e.style.width = (pct * 100).toFixed(1) + '%'; };
    setEl('stat-prompt',     promptToks);
    setEl('stat-completion', completionToks);
    setEl('stat-total',      promptToks + completionToks);
    setEl('stat-turns',      AppState.sessionStats.turnCount);
    setBar('stat-prompt-bar',     promptToks     / max);
    setBar('stat-completion-bar', completionToks / max);

    const chart = this.el('stat-chart');
    if (chart) {
      if (AppState.turnTokens.length) {
        const last8 = AppState.turnTokens.slice(-8);
        const peak  = Math.max(...last8.map(t => t.p + t.c), 1);
        chart.innerHTML = last8.map(t => {
          const h = Math.max(3, Math.round(((t.p + t.c) / peak) * 44));
          return `<div class="chart-bar" style="height:${h}px" title="P:${t.p} C:${t.c}" aria-hidden="true"></div>`;
        }).join('');
      } else {
        chart.innerHTML = '<div class="chart-bar" style="height:3px;opacity:.25"></div>'.repeat(4);
      }
    }
  },

  updateLiveUsage({ promptTokens = null, completionTokens = 0, estimated = true, streaming = false } = {}) {
    const el = this.el('stat-live');
    if (!el) return;
    const completion = Utils.formatTokens(completionTokens);
    const prompt = promptTokens == null ? 'prompt pending' : `${Utils.formatTokens(promptTokens)} prompt`;
    const estimateLabel = estimated ? ' approx.' : '';
    el.textContent = streaming
      ? `Streaming · ${prompt} · ~${completion} output tokens`
      : `Last turn · ${prompt} · ${completion} completion${estimateLabel}`;
  },

  updateRateLimitInfo(remaining) {
    const el = this.el('stat-rl');
    if (el) el.textContent = String(remaining);
  },

  updateDiagnostics(provider, modelId) {
    const el = this.el('stat-diag');
    if (!el) return;
    const name = provider === 'huggingface' ? 'Hugging Face' : 'OpenRouter';
    el.innerHTML = `Provider: ${name}<br>Model: ${modelId === 'none' ? 'none' : modelId}`;
  },

  _isMobile() { return window.matchMedia('(max-width: 1100px)').matches; },

  // Focus the first candidate that actually takes focus (hidden elements silently refuse it).
  _focusFirst(candidates) {
    for (const el of candidates) {
      if (!el || typeof el.focus !== 'function') continue;
      el.focus();
      if (document.activeElement === el) return true;
    }
    return false;
  },

  // While a mobile drawer/sheet is open, everything behind it is inert: no Tab, click or
  // screen-reader access to the page underneath. Desktop panels are non-modal, so nothing is inert.
  _syncInert() {
    const q = (sel) => document.querySelector(sel);
    const all = [q('.main'), this.el('sidebar'), this.el('rightPanel'), q('.main-wrapper'), this.el('composerWrap'), q('.header-left')];
    const inertSet = new Set();
    if (this._isMobile()) {
      const sidebarOpen = this.el('sidebar')?.classList.contains('open');
      const statsOpen = document.body.classList.contains('stats-open');
      const actionsOpen = document.body.classList.contains('actions-open');
      if (sidebarOpen) { inertSet.add(q('.main')); inertSet.add(this.el('rightPanel')); }
      else if (statsOpen) { inertSet.add(q('.main')); inertSet.add(this.el('sidebar')); }
      else if (actionsOpen) {
        [q('.main-wrapper'), this.el('composerWrap'), q('.header-left'), this.el('sidebar'), this.el('rightPanel')].forEach(el => inertSet.add(el));
      }
    }
    all.forEach(el => { if (el) el.toggleAttribute('inert', inertSet.has(el)); });
  },

  toggleStats() {
    const panel = this.el('rightPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    document.body.classList.toggle('stats-open', isOpen);
    this.el('statsBtn')?.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      this.closeActionTray();
      if (this._isMobile() && this.el('sidebar')?.classList.contains('open')) {
        this.toggleSidebar();
      }
      this.updateStats(AppState.totalPromptTokens || 0, AppState.totalCompletionTokens || 0);
      this.updateRateLimitInfo(AppState.getRemainingRequests());
      this.updateDiagnostics(AppState.currentProvider, AppState.selectedModel);
      this.syncMobileOverlay();
      if (this._isMobile()) this._focusFirst([this.el('rp-close')]);
    } else {
      this.syncMobileOverlay();
      this._focusFirst([this.el('statsBtn'), this.el('moreBtn')]);
    }
  },

  closeStats({ restoreFocus = false } = {}) {
    const panel = this.el('rightPanel');
    const hadFocus = panel?.contains(document.activeElement);
    panel?.classList.remove('open');
    document.body.classList.remove('stats-open');
    this.el('statsBtn')?.setAttribute('aria-expanded', 'false');
    this.syncMobileOverlay();
    if (restoreFocus && hadFocus) this._focusFirst([this.el('statsBtn'), this.el('moreBtn')]);
  },

  toggleActionTray() {
    const tray = this.el('actionTray');
    if (!tray) return;
    const isOpen = tray.classList.toggle('open');
    this.el('moreBtn')?.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('actions-open', isOpen);
    if (isOpen) {
      this.closeStats();
      if (this.el('sidebar')?.classList.contains('open')) this.toggleSidebar();
    }
    this.syncMobileOverlay();
    if (isOpen && this._isMobile()) this._focusFirst([tray.querySelector('button:not([disabled])')]);
    else if (!isOpen) this._focusFirst([this.el('moreBtn')]);
  },

  closeActionTray({ restoreFocus = false } = {}) {
    const tray = this.el('actionTray');
    const hadFocus = tray?.contains(document.activeElement);
    tray?.classList.remove('open');
    this.el('moreBtn')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('actions-open');
    this.syncMobileOverlay();
    if (restoreFocus && (hadFocus || document.activeElement === document.body)) this._focusFirst([this.el('moreBtn')]);
  },

  syncMobileOverlay() {
    this._syncInert();
    const overlay = this.el('mobileOverlay');
    if (!overlay || !this._isMobile()) return;
    const sidebarOpen = this.el('sidebar')?.classList.contains('open');
    const statsOpen = document.body.classList.contains('stats-open');
    const actionsOpen = document.body.classList.contains('actions-open');
    overlay.classList.toggle('show', Boolean(sidebarOpen || statsOpen || actionsOpen));
  },

  bindPopover(menu, anchor) {
    if (!menu || !anchor || menu.dataset.placed === 'true') return;
    menu.dataset.placed = 'true';
    menu.addEventListener('toggle', (event) => {
      if (event.newState !== 'open') return;
      const anchorRect = anchor.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.margin = '0';
      menu.style.right = 'auto';
      menu.style.maxHeight = 'min(70dvh, 420px)';
      menu.style.overflow = 'auto';
      const menuRect = menu.getBoundingClientRect();
      let top = anchorRect.bottom + 8;
      if (top + menuRect.height > window.innerHeight - 12) {
        top = Math.max(12, anchorRect.top - menuRect.height - 8);
      }
      let left = anchorRect.right - menuRect.width;
      left = Math.max(12, Math.min(left, window.innerWidth - menuRect.width - 12));
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
    });
  },

  bindVisualViewport() {
    const viewport = window.visualViewport;
    if (!viewport || this._viewportBound) return;
    this._viewportBound = true;
    const sync = () => {
      const layoutShrunk = document.documentElement.clientHeight < window.innerHeight - 40;
      const inset = layoutShrunk ? 0 : Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
    };
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    sync();
  },

  // Send button
  setSendButtonState(enabled) {
    const send = this.el('sendBtn');
    const stop = this.el('stopBtn');
    if (send) { send.disabled = !enabled; send.setAttribute('aria-disabled', String(!enabled)); }
    // FIX B1: toggle a class instead of inline visibility. index.html CSS owns
    // the stop button's visible/hidden state via opacity+pointer-events, and an
    // inline `style.visibility` never overrides CSS opacity, so the stop button
    // used to stay invisible+unclickable while streaming.
    if (stop) stop.classList.toggle('streaming-visible', !enabled);
  },

  // Char count
  updateCharCount(len) {
    const el = this.el('charCount');
    if (!el) return;
    el.textContent = len > 0 ? `${len.toLocaleString()} chars` : '';
    el.className = 'char-count' + (len > 28000 ? ' over' : len > 24000 ? ' warn' : '');
  },

  // Model label
  updateModelLabel(modelName) {
    const el    = this.el('modelLabel');
    const badge = this.el('modelBadge');
    const inl   = this.el('modelLabelInline');
    const short = modelName ? modelName.split('(')[0].trim() : 'No model';
    if (el)    el.textContent  = modelName || 'No model selected';
    if (badge) {
      badge.textContent = short;
      badge.className   = 'model-badge' + (AppState.currentProvider === 'huggingface' ? ' hf' : '');
    }
    if (inl)   inl.textContent = short !== 'No model' ? short : '';
    this.updateWelcomeHint();
  },

  setPersonaLabel(name) {
    const el = this.el('personaLabel');
    if (el) el.textContent = name ? `Active: ${name}` : '';
    const summary = this.el('personaSummaryName');
    if (summary) summary.textContent = name || 'Assistant';
  },

  updateModelCount(current, total) {
    const el = this.el('modelCount');
    if (!el) return;
    el.textContent = current === total
      ? `${current} model${current !== 1 ? 's' : ''}`
      : `${current} of ${total} models`;
  },

  // Context bar
  updateContextBar() {
    const bar   = this.el('ctxBar');
    const info  = this.el('ctxInfo');
    const track = this.el('ctxTrack');
    const pct   = AppState.getContextUsage();
    const lim   = AppState.getContextLimit();

    if (bar) {
      bar.style.width = (Math.min(pct, 1) * 100).toFixed(1) + '%';
      bar.className   = 'ctx-fill' + (pct > 0.9 ? ' over' : pct > 0.75 ? ' warn' : '');
    }
    if (info) {
      const pctUsed = Math.round(pct * 100);
      const limStr  = Utils.formatTokens(lim);
      info.textContent = `${pctUsed}% of ${limStr}`;
    }
    if (track) {
      const val = Math.round(Math.min(pct, 1) * 100);
      track.setAttribute('aria-valuenow', val);
      track.setAttribute('aria-valuetext', `${val}% of context used`);
    }
  },

  // Sidebar
  _focusableSelectors: 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',

  _focusFirstSidebarControl(toggleBtn) {
    const sidebar = this.el('sidebar');
    const firstControl = sidebar?.querySelector(this._focusableSelectors);
    (firstControl || toggleBtn)?.focus();
  },

  toggleSidebar() {
    const sidebar = this.el('sidebar');
    const overlay = this.el('mobileOverlay');
    const toggle  = this.el('sidebarToggle');
    if (!sidebar) return;

    const isMobile = window.matchMedia('(max-width: 1100px)').matches;
    if (!isMobile) {
      this.collapseSidebarDesktop();
      if (overlay) overlay.classList.remove('show');
      document.body.classList.remove('sidebar-open');
      if (toggle) {
        this.syncSidebarToggleState();
      }
      AppState.sidebarOpen = false;
      return;
    }

    document.body.classList.remove('sidebar-collapsed');
    const isOpen = sidebar.classList.toggle('open');
    AppState.sidebarOpen = isOpen;
    if (overlay) overlay.classList.toggle('show', isOpen);
    if (toggle) this.syncSidebarToggleState();
    document.body.classList.toggle('sidebar-open', isOpen);
    if (isOpen) {
      this.closeStats();
      this.closeActionTray();
    }
    this.syncMobileOverlay();
    if (isOpen) this._focusFirstSidebarControl(toggle);
    else toggle?.focus();
  },

  collapseSidebarDesktop() {
    if (!window.matchMedia('(min-width: 1101px)').matches) return;
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    try { localStorage.setItem('cwi_sidebar_collapsed', String(collapsed)); } catch (_) {}
    const toggle = this.el('sidebarToggle');
    this.syncSidebarToggleState();
  },

  // Retry button
  addRetryButton(onRetry) {
    this.removeRetryButton();
    const chat = this.el('chatBody');
    if (!chat) return;
    const btn = document.createElement('button');
    btn.id = 'retryBtn';
    btn.className = 'retry-btn';
    btn.setAttribute('aria-label', 'Retry last message');
    btn.textContent = '↻ Retry last message';
    btn.addEventListener('click', () => { this.removeRetryButton(); onRetry(); });
    chat.appendChild(btn);
    this._scrollToBottom();
  },

  removeRetryButton() {
    this.el('retryBtn')?.remove();
    this.removeSendError();
  },

  // Persistent inline error for a failed send. Real actions only: Retry resends the same
  // message; the optional suggestion switches to a model from the free list on click.
  showSendError({ message, onRetry, suggestion } = {}) {
    this.removeRetryButton();
    const chat = this.el('chatBody');
    if (!chat) return;
    const box = document.createElement('div');
    box.id = 'sendError';
    box.className = 'send-error';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Message failed');
    const text = document.createElement('p');
    text.className = 'send-error-text';
    text.textContent = message || 'Request failed — please try again.';
    box.appendChild(text);
    const row = document.createElement('div');
    row.className = 'send-error-actions';
    const mk = (label, handler) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'retry-btn';
      b.textContent = label;
      b.addEventListener('click', () => { this.removeSendError(); handler(); });
      row.appendChild(b);
    };
    if (suggestion?.label && suggestion.onUse) mk(`Use ${suggestion.label}`, suggestion.onUse);
    if (onRetry) mk('↻ Retry', onRetry);
    box.appendChild(row);
    chat.appendChild(box);
    this._scrollToBottom();
  },

  removeSendError() {
    this.el('sendError')?.remove();
  },

  // Toast
  toast(message, type = 'info', duration = 3000) {
    const area = this.el('toastArea');
    if (!area) return;
    Array.from(area.querySelectorAll('.toast')).find(t => t.dataset.msg === message)?.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.msg = message;
    // Errors interrupt (alert); everything else waits its turn (status).
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    // Insert the live-region element empty, then fill it, so assistive tech reliably announces it.
    area.appendChild(toast);
    requestAnimationFrame(() => {
      toast.textContent = message;
      toast.classList.add('show');
    });
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
};

export default UI;
