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
    document.documentElement.setAttribute('data-theme', stored);
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
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
        this.announce('Assistant replied');
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

  toggleStats() {
    const panel = this.el('rightPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
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
      badge.className   = 'model-badge' + (AppState.currentProvider === 'huggingface' ? ' hf' : '');
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
  toggleSidebar() {
    const sidebar = this.el('sidebar');
    const overlay = this.el('mobileOverlay');
    const toggle  = this.el('sidebarToggle');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    AppState.sidebarOpen = isOpen;
    if (overlay) overlay.classList.toggle('show', isOpen);
    if (toggle)  toggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('sidebar-open', isOpen);
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
};

export default UI;
