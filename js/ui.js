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
    // 1. Add role="log" and aria-live to chat message list for accessibility
    const chatList = this.el('chatBody');
    if (chatList) {
      chatList.setAttribute('role', 'log');
      chatList.setAttribute('aria-live', 'polite');
      chatList.setAttribute('aria-relevant', 'additions');
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
    this.setThemeAttribute(stored);
  },

  setThemeAttribute(theme) {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    this.updateThemeMenu(theme);
  },

  updateThemeMenu(theme) {
    document.querySelectorAll('.theme-opt').forEach(option => {
      const selected = option.dataset.theme === theme;
      option.setAttribute('aria-pressed', String(selected));
    });
  },

  loadSidebarState() {
    if (!window.matchMedia('(min-width: 1101px)').matches) return;
    try {
      document.body.classList.toggle('sidebar-collapsed', localStorage.getItem('cwi_sidebar_collapsed') === 'true');
    } catch (_) {}
  },

  setTheme(theme) {
    this.setThemeAttribute(theme);
    try { localStorage.setItem('cwi_theme', theme); } catch (_) {}
  },

  setAuthState(ok, label) {
    const dot    = this.el('authDot');
    const status = this.el('authStatus');
    if (dot)    dot.className    = 'auth-dot ' + (ok ? 'ok' : 'err');
    if (status) status.textContent = label;
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
    banner.innerHTML = '💾 Unsaved — <button id="unsaved-export-btn" style="background:none;border:none;cursor:pointer;font-size:inherit;font-weight:800;color:inherit;text-decoration:underline;padding:0;margin-left:.2rem;">Export now</button>';
    const anchor = this.el('composerWrap');
    if (anchor) anchor.parentNode.insertBefore(banner, anchor);
    this.el('unsaved-export-btn')?.addEventListener('click', () => { if (typeof onExport === 'function') onExport(); });
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
    if (body) body.innerHTML = '';
    const welcome = this.el('welcome');
    if (welcome) welcome.classList.remove('hidden');
    AppState.clearChat();
    this.updateStats(0, 0);
    this.updateContextBar();
    this._updateScrollBtn();
  },

  // Confirm modal (replaces native confirm() — Zara/Priya fix)
  confirmModal(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'presentation');

    const box = document.createElement('div');
    box.className = 'confirm-box';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', message);
    box.tabIndex = -1;

    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary confirm-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary confirm-confirm';
    confirmBtn.textContent = 'Confirm';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(msg);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('open');
      box.focus();
    });

    const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => { onConfirm(); close(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  },

  // Prompt modal for renaming
  promptModal(message, defaultValue, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'presentation');

    const box = document.createElement('div');
    box.className = 'confirm-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', message);
    box.tabIndex = -1;

    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.textContent = message;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue || '';
    input.maxLength = 60;
    input.style.width = '100%';
    input.style.marginBottom = '.75rem';
    input.style.boxSizing = 'border-box';

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary confirm-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary confirm-confirm';
    confirmBtn.textContent = 'Save';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(msg);
    box.appendChild(input);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('open');
      input.focus();
      input.select();
    });

    const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
      const val = input.value.trim();
      if (val) onConfirm(val);
      close();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val) onConfirm(val);
        close();
      } else if (e.key === 'Escape') {
        close();
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  },

  renderConversations(conversations, activeId, { onSwitch, onRename, onDelete }, emptyText = 'No saved chats') {
    const listEl = this.el('convList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!conversations || !conversations.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.fontSize = '.75rem';
      empty.style.padding = '.4rem .2rem';
      empty.textContent = emptyText;
      listEl.appendChild(empty);
      return;
    }

    conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === activeId ? ' active' : '');
      item.dataset.id = conv.id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');

      const main = document.createElement('div');
      main.className = 'conv-item-main';

      const title = document.createElement('div');
      title.className = 'conv-title';
      title.textContent = conv.title || 'New chat';
      title.title = conv.title || 'New chat';

      const time = document.createElement('div');
      time.className = 'conv-time';
      const lastTs = conv.updatedAt || conv.createdAt || Date.now();
      time.textContent = Utils.getTimeSince(lastTs);

      main.appendChild(title);
      main.appendChild(time);

      if (conv.snippet) {
        const snippetEl = document.createElement('div');
        snippetEl.className = 'conv-snippet';
        snippetEl.textContent = conv.snippet;
        snippetEl.title = conv.snippet;
        main.appendChild(snippetEl);
      }

      const actions = document.createElement('div');
      actions.className = 'conv-actions';

      const renameBtn = document.createElement('button');
      renameBtn.className = 'conv-btn';
      renameBtn.title = 'Rename chat';
      renameBtn.setAttribute('aria-label', `Rename chat ${conv.title}`);
      renameBtn.textContent = '✎';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onRename === 'function') onRename(conv.id, conv.title);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'conv-btn delete';
      deleteBtn.title = 'Delete chat';
      deleteBtn.setAttribute('aria-label', `Delete chat ${conv.title}`);
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onDelete === 'function') onDelete(conv.id, conv.title);
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(main);
      item.appendChild(actions);

      item.addEventListener('click', () => {
        if (typeof onSwitch === 'function') onSwitch(conv.id, conv.messageIndex);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof onSwitch === 'function') onSwitch(conv.id, conv.messageIndex);
        }
      });

      listEl.appendChild(item);
    });
  },

  scrollToMessageIndex(index) {
    const chat = this.el('chatBody');
    if (!chat || index < 0) return;
    const msgs = chat.querySelectorAll('.msg');
    if (msgs && msgs[index]) {
      msgs[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      msgs[index].style.transition = 'box-shadow 0.3s ease';
      msgs[index].style.boxShadow = '0 0 0 2px var(--accent)';
      setTimeout(() => {
        msgs[index].style.boxShadow = '';
      }, 1500);
    }
  },

  renderChatHistory(messages) {
    const body = this.el('chatBody');
    if (!body) return;
    body.innerHTML = '';
    const welcome = this.el('welcome');

    if (!messages || !messages.length) {
      if (welcome) welcome.classList.remove('hidden');
      this.updateStats(0, 0);
      this.updateContextBar();
      this._updateScrollBtn();
      return;
    }

    if (welcome) welcome.classList.add('hidden');

    messages.forEach(m => {
      this.appendMessage(m.role, m.content, m.model);
    });
    this.updateContextBar();
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
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const col = document.createElement('div');
    col.className = 'msg-col';

    wrap.appendChild(avatar);
    wrap.appendChild(col);
    return { wrap, col };
  },

  _buildMeta(role, bubble, modelId = null) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const ts = document.createElement('span');
    ts.className = 'msg-time';
    ts.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    ts.setAttribute('aria-hidden', 'true');

    if (role === 'assistant' && modelId) {
      const modelBadge = document.createElement('span');
      modelBadge.className = 'msg-model';
      const short = modelId.split('/').pop().replace(/:free$/, '').slice(0, 24);
      modelBadge.textContent = short;
      modelBadge.title = modelId;
      meta.appendChild(modelBadge);
    }

    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy message');
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', () => {
      const text = bubble._rawText || bubble.textContent;
      Utils.copyToClipboard(text).then(ok => {
        if (ok) { copyBtn.textContent = '✅'; setTimeout(() => { copyBtn.textContent = '📋'; }, 1500); }
      });
    });

    actions.appendChild(copyBtn);
    meta.appendChild(ts);
    meta.appendChild(actions);
    return meta;
  },

  _decorateCodeBlocks(container) {
    if (!container) return;
    const preBlocks = container.querySelectorAll('pre');
    preBlocks.forEach(pre => {
      if (pre.querySelector('.code-copy-btn')) return;
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-copy-btn';
      copyBtn.setAttribute('aria-label', 'Copy code snippet');
      copyBtn.title = 'Copy code';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = pre.querySelector('code');
        const textToCopy = code ? code.innerText : pre.innerText;
        Utils.copyToClipboard(textToCopy).then(ok => {
          if (ok) {
            copyBtn.textContent = 'Copied';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 1500);
          }
        });
      });
      pre.appendChild(copyBtn);
    });
  },

  appendMessage(role, text, modelId = null) {
    const chat = this.el('chatBody');
    if (!chat) return;

    const { wrap, col } = this._buildMsgWrap(role);
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble._rawText = text;

    col.appendChild(bubble);
    col.appendChild(this._buildMeta(role, bubble, modelId));
    chat.appendChild(wrap);

    if (role === 'assistant') {
      Utils.parseMarkdown(text).then(html => {
        bubble.innerHTML = html;
        this._decorateCodeBlocks(bubble);
        this._scrollToBottom(false);
        this.announce('Assistant replied');
      });
    } else {
      bubble.textContent = text;
      this._scrollToBottom(true);
    }
  },

  createStreamBubble(modelId = null) {
    const chat = this.el('chatBody');
    if (!chat) return null;

    const { wrap, col } = this._buildMsgWrap('assistant');
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble streaming';

    const content = document.createElement('span');
    content.className = 'bubble-stream-content';
    bubble.appendChild(content);
    col.appendChild(bubble);
    col.appendChild(this._buildMeta('assistant', bubble, modelId));
    chat.appendChild(wrap);
    this._scrollToBottom(false);
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
      this._decorateCodeBlocks(bubble);
      this._scrollToBottom(false);
      this.announce('Assistant finished reply');
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
    avatar.textContent = '🤖';

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';

    wrap.appendChild(avatar);
    wrap.appendChild(typing);
    chat.appendChild(wrap);
    this._scrollToBottom();
  },

  removeTyping() {
    this.el('typing-indicator')?.remove();
  },

  // Scroll helpers
  isNearBottom(threshold = 100) {
    const chat = this.el('chatBody');
    if (!chat) return true;
    return chat.scrollHeight - chat.clientHeight - chat.scrollTop <= threshold;
  },

  _scrollToBottom(force = false) {
    const chat = this.el('chatBody');
    if (!chat) return;
    if (!force && !this.isNearBottom()) {
      this._updateScrollBtn();
      return;
    }
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
    btn.addEventListener('click', () => {
      if (chat) chat.scrollTop = chat.scrollHeight;
      this._updateScrollBtn();
    });
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
    let name = 'OpenRouter';
    if (provider === 'huggingface') name = 'Hugging Face';
    else if (provider === 'local') name = 'Local (Custom)';
    el.innerHTML = `Provider: ${name}<br>Model: ${modelId === 'none' ? 'none' : modelId}`;
  },

  toggleStats() {
    const panel = this.el('rightPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    document.body.classList.toggle('stats-open', isOpen);
    this.el('statsBtn')?.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      this.updateStats(AppState.totalPromptTokens || 0, AppState.totalCompletionTokens || 0);
      this.updateRateLimitInfo(AppState.getRemainingRequests());
      this.updateDiagnostics(AppState.currentProvider, AppState.selectedModel);
    }
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
      let badgeClass = 'model-badge';
      if (AppState.currentProvider === 'huggingface') badgeClass += ' hf';
      else if (AppState.currentProvider === 'local') badgeClass += ' loc';
      badge.className = badgeClass;
    }
    if (inl)   inl.textContent = short !== 'No model' ? short : '';
  },

  setPersonaLabel(name) {
    const el = this.el('personaLabel');
    if (el) el.textContent = name ? `Active: ${name}` : '';
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
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-pressed', String(document.body.classList.contains('sidebar-collapsed')));
      }
      AppState.sidebarOpen = false;
      return;
    }

    document.body.classList.remove('sidebar-collapsed');
    const isOpen = sidebar.classList.toggle('open');
    AppState.sidebarOpen = isOpen;
    if (overlay) overlay.classList.toggle('show', isOpen);
    if (toggle)  toggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('sidebar-open', isOpen);
    if (isOpen) this._focusFirstSidebarControl(toggle);
    else toggle?.focus();
  },

  collapseSidebarDesktop() {
    if (!window.matchMedia('(min-width: 1101px)').matches) return;
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    try { localStorage.setItem('cwi_sidebar_collapsed', String(collapsed)); } catch (_) {}
    const toggle = this.el('sidebarToggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(collapsed));
      toggle.setAttribute('aria-expanded', 'false');
    }
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
  },

  // Toast
  toast(message, type = 'info', duration = 3000) {
    const area = this.el('toastArea');
    if (!area) return;
    Array.from(area.querySelectorAll('.toast')).find(t => t.dataset.msg === message)?.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    toast.dataset.msg = message;
    toast.setAttribute('role', 'alert');
    area.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // File Attachments
  renderAttachments(files = [], onRemove) {
    const list = this.el('attachmentList');
    if (!list) return;
    list.innerHTML = '';
    if (!files.length) {
      list.classList.remove('has-files');
      return;
    }
    list.classList.add('has-files');

    files.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = file.isImage ? '🖼️' : file.name.endsWith('.pdf') ? '📄' : '📝';

      const name = document.createElement('span');
      name.className = 'file-name';
      name.title = file.name;
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = Utils.formatFileSize(file.size);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove';
      removeBtn.setAttribute('aria-label', `Remove attachment ${file.name}`);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onRemove === 'function') onRemove(index);
      });

      chip.appendChild(icon);
      chip.appendChild(name);
      chip.appendChild(size);
      chip.appendChild(removeBtn);
      list.appendChild(chip);
    });
  },
};

export default UI;
