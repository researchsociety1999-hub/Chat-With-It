/**
 * UI Manager
 * Handles all DOM manipulation, rendering, and UI state updates
 */

const UI = {
  el(id) { return document.getElementById(id); },

  // ─── Theme ────────────────────────────────────────────────────────────────

  loadTheme() {
    const stored = localStorage.getItem('cwi_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', stored);
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('cwi_theme', theme); } catch (_) {}
  },

  // ─── Auth UI ──────────────────────────────────────────────────────────────

  setAuthState(ok, label) {
    const dot    = this.el('authDot');
    const status = this.el('authStatus');
    if (dot)    { dot.className    = 'auth-dot ' + (ok ? 'ok' : 'err'); }
    if (status) { status.textContent = label; }
  },

  // ─── Chat display ─────────────────────────────────────────────────────────

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
  },

  appendMessage(role, text) {
    const chat = this.el('chatBody');
    if (!chat) return;

    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    wrap.setAttribute('role', 'article');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'user' ? '\uD83D\uDC64' : '\uD83E\uDD16';

    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:.25rem;max-width:calc(100% - 44px)';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (role === 'assistant') {
      Utils.parseMarkdown(text).then(html => { bubble.innerHTML = html; });
    } else {
      bubble.textContent = text;
    }

    const ts = document.createElement('div');
    ts.style.cssText = 'font-size:.68rem;color:var(--fg-muted);padding:0 .25rem';
    ts.textContent = new Date().toLocaleTimeString();
    ts.setAttribute('aria-hidden', 'true');

    col.appendChild(bubble);
    col.appendChild(ts);
    wrap.appendChild(avatar);
    wrap.appendChild(col);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  },

  // ─── Streaming bubble ─────────────────────────────────────────────────────

  createStreamBubble() {
    const chat = this.el('chatBody');
    if (!chat) return null;

    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    wrap.setAttribute('role', 'article');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '\uD83E\uDD16';

    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:.25rem;max-width:calc(100% - 44px)';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble streaming';

    const content = document.createElement('span');
    content.className = 'bubble-stream-content';
    bubble.appendChild(content);

    const ts = document.createElement('div');
    ts.style.cssText = 'font-size:.68rem;color:var(--fg-muted);padding:0 .25rem';
    ts.textContent = new Date().toLocaleTimeString();
    ts.setAttribute('aria-hidden', 'true');

    col.appendChild(bubble);
    col.appendChild(ts);
    wrap.appendChild(avatar);
    wrap.appendChild(col);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return bubble;
  },

  appendStreamToken(bubble, delta) {
    if (!bubble) return;
    const content = bubble.querySelector('.bubble-stream-content');
    if (content) {
      content.textContent += delta;
      const chat = this.el('chatBody');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }
  },

  finaliseStreamBubble(bubble, fullContent) {
    if (!bubble) return;
    bubble.classList.remove('streaming');
    const content = bubble.querySelector('.bubble-stream-content');
    if (!content) return;
    if (window.marked) {
      const raw = marked.parse(fullContent);
      content.innerHTML = window.DOMPurify
        ? DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
        : raw.replace(/<(script|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
             .replace(/\s+on\w+\s*=/gi, ' data-removed=');
    } else {
      content.textContent = fullContent;
    }
  },

  /**
   * Remove an empty stream bubble from the DOM.
   * Called when a stream errors out before any tokens arrive.
   */
  removeStreamBubble(bubble) {
    if (!bubble) return;
    const wrap = bubble.closest('.msg');
    if (wrap) wrap.remove();
  },

  // ─── Typing indicator ─────────────────────────────────────────────────────

  showTyping() {
    const chat = this.el('chatBody');
    if (!chat) return;
    if (this.el('typing-indicator')) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    wrap.id = 'typing-indicator';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'AI is typing');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '\uD83E\uDD16';

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';

    wrap.appendChild(avatar);
    wrap.appendChild(typing);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  },

  removeTyping() {
    const t = this.el('typing-indicator');
    if (t) t.remove();
  },

  // ─── Stats panel ──────────────────────────────────────────────────────────

  updateStats(promptToks, completionToks) {
    const max = Math.max(promptToks, completionToks, 1);

    const setEl = (id, val) => { const e = this.el(id); if (e) e.textContent = Utils.formatTokens(val); };
    const setBar = (id, pct) => { const e = this.el(id); if (e) e.style.width = (pct * 100).toFixed(1) + '%'; };

    setEl('stat-prompt',     promptToks);
    setEl('stat-completion', completionToks);
    setEl('stat-total',      promptToks + completionToks);
    setEl('stat-turns',      AppState.sessionStats.turnCount);
    setBar('stat-prompt-bar',     promptToks     / max);
    setBar('stat-completion-bar', completionToks / max);

    const chart = this.el('stat-chart');
    if (chart && AppState.turnTokens.length) {
      const last8 = AppState.turnTokens.slice(-8);
      const peak  = Math.max(...last8.map(t => t.p + t.c), 1);
      chart.innerHTML = last8.map(t => {
        const h = Math.round(((t.p + t.c) / peak) * 44);
        return `<div class="chart-bar" style="height:${h}px" title="P:${t.p} C:${t.c}"></div>`;
      }).join('');
    }
  },

  toggleStats() {
    const panel = this.el('rightPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    if (isOpen) this.updateStats(AppState.totalPromptTokens || 0, AppState.totalCompletionTokens || 0);
  },

  // ─── Input bar helpers ────────────────────────────────────────────────────

  setSendButtonState(enabled) {
    const send = this.el('sendBtn');
    const stop = this.el('stopBtn');
    if (send) {
      send.disabled = !enabled;
      send.setAttribute('aria-disabled', String(!enabled));
    }
    if (stop) stop.style.display = enabled ? 'none' : 'flex';
  },

  updateCharCount(len) {
    const el = this.el('charCount');
    if (el) el.textContent = `${len.toLocaleString()} / 32,000`;
  },

  // ─── Model label ──────────────────────────────────────────────────────────

  updateModelLabel(modelName) {
    const el = this.el('modelLabel');
    if (el) el.textContent = modelName || 'No model selected';
  },

  // ─── Context bar ──────────────────────────────────────────────────────────

  updateContextBar() {
    const bar  = this.el('ctxBar');
    const info = this.el('ctxInfo');
    const fill = this.el('ctxFill');
    const pct  = AppState.getContextUsage();
    const used = AppState.totalPromptTokens + AppState.totalCompletionTokens;
    const lim  = AppState.getContextLimit();

    if (bar) {
      bar.style.width = (pct * 100).toFixed(1) + '%';
      bar.className   = 'ctx-bar' + (pct > 0.9 ? ' over' : pct > 0.75 ? ' warn' : '');
    }
    if (info) info.textContent = Utils.formatContextInfo(used, lim);
    if (fill) fill.setAttribute('aria-valuenow', Math.round(pct * 100));
  },

  // ─── Sidebar ──────────────────────────────────────────────────────────────

  toggleSidebar() {
    const sidebar = this.el('sidebar');
    const overlay = this.el('mobileOverlay');
    const toggle  = this.el('sidebarToggle');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show', isOpen);
    if (toggle)  toggle.setAttribute('aria-expanded', String(isOpen));
  },

  // ─── Toast ────────────────────────────────────────────────────────────────

  toast(message, type = 'info', duration = 3000) {
    const area = this.el('toastArea');
    if (!area) return;

    // Deduplicate: if the same message is already showing, remove it first
    const existing = Array.from(area.querySelectorAll('.toast'))
      .find(t => t.dataset.msg === message);
    if (existing) existing.remove();

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.dataset.msg = message;
    t.textContent = message;
    // Prevent overflow on mobile for long error strings
    t.style.cssText = 'max-width:min(92vw,560px);white-space:normal;word-break:break-word';
    area.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'slideIn .25s reverse forwards';
      setTimeout(() => t.remove(), 260);
    }, duration);
  },
};
