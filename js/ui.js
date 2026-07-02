/**
 * UI Manager
 * Handles all DOM manipulation, rendering, and UI state updates
 */

const UI = {
  el(id) { return document.getElementById(id); },

  // ─── Theme ────────────────────────────────────────────────────────────────

  loadTheme() {
    let stored = 'dark';
    try { stored = localStorage.getItem('cwi_theme') || 'dark'; } catch (_) {}
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

  /**
   * Append a finalized message bubble.
   *
   * FIX (scroll timing): assistant rendering is async (Utils.parseMarkdown returns
   * a Promise). Previously, chat.scrollTop was set synchronously right after
   * appendChild, before the bubble had any height — the page jumped to the wrong
   * position. Now we scroll AFTER the Promise resolves so the layout is final.
   *
   * FIX (unified render path): both streamed and non-streamed assistant messages
   * now go through Utils.parseMarkdown, which applies DOMPurify sanitization.
   * Previously appendMessage used the same path but finaliseStreamBubble called
   * marked.parse directly, creating two divergent sanitization branches.
   */
  appendMessage(role, text) {
    const chat = this.el('chatBody');
    if (!chat) return;

    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    wrap.setAttribute('role', 'article');

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:.25rem;max-width:calc(100% - 44px)';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const ts = document.createElement('div');
    ts.style.cssText = 'font-size:.68rem;color:var(--fg-muted);padding:0 .25rem';
    ts.textContent = new Date().toLocaleTimeString();
    ts.setAttribute('aria-hidden', 'true');

    col.appendChild(bubble);
    col.appendChild(ts);
    wrap.appendChild(avatar);
    wrap.appendChild(col);
    chat.appendChild(wrap);

    if (role === 'assistant') {
      // FIX: scroll after markdown renders so the bubble has its final height
      Utils.parseMarkdown(text).then(html => {
        bubble.innerHTML = html;
        chat.scrollTop = chat.scrollHeight;
      });
    } else {
      bubble.textContent = text;
      chat.scrollTop = chat.scrollHeight;
    }
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
    avatar.textContent = '🤖';

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

  /**
   * FIX (unified render path): delegates to Utils.parseMarkdown instead of
   * duplicating marked.parse + DOMPurify inline. This ensures the same
   * sanitization logic is used for ALL assistant output.
   */
  finaliseStreamBubble(bubble, fullContent) {
    if (!bubble) return;
    bubble.classList.remove('streaming');
    const content = bubble.querySelector('.bubble-stream-content');
    if (!content) return;
    Utils.parseMarkdown(fullContent).then(html => {
      content.innerHTML = html;
      const chat = this.el('chatBody');
      if (chat) chat.scrollTop = chat.scrollHeight;
    });
  },

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
    avatar.textContent = '🤖';

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
    if (chart) {
      if (AppState.turnTokens.length) {
        const last8 = AppState.turnTokens.slice(-8);
        const peak  = Math.max(...last8.map(t => t.p + t.c), 1);
        chart.innerHTML = last8.map(t => {
          const h = Math.max(2, Math.round(((t.p + t.c) / peak) * 44));
          return `<div class="chart-bar" style="height:${h}px" title="Prompt: ${t.p} / Completion: ${t.c}" aria-hidden="true"></div>`;
        }).join('');
      } else {
        // FIX: show placeholder bars so the chart area is never invisibly 0-height
        chart.innerHTML = '<div class="chart-bar" style="height:2px;opacity:.3" aria-hidden="true"></div>'.repeat(4);
      }
    }
  },

  /**
   * Rate-limit info in stats panel.
   */
  updateRateLimitInfo(remaining) {
    const el = this.el('stat-rl');
    if (el) el.textContent = String(remaining);
  },

  /**
   * Provider/model diagnostics line.
   */
  updateDiagnostics(provider, modelId) {
    const el = this.el('stat-diag');
    if (!el) return;
    const providerName = provider === 'huggingface' ? 'Hugging Face' : 'OpenRouter';
    const modelLabel = modelId === 'none' ? 'none' : modelId;
    el.textContent = `Provider: ${providerName} · Model: ${modelLabel}`;
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

  setPersonaLabel(name) {
    const el = this.el('personaLabel');
    if (el) el.textContent = name ? `Persona: ${name}` : '';
  },

  updateModelCount(current, total) {
    const el = this.el('modelCount');
    if (!el) return;
    el.textContent = current === total
      ? `${current} model${current !== 1 ? 's' : ''}`
      : `${current} of ${total} models`;
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
    if (info) {
      const pctUsed      = Math.round(pct * 100);
      const pctRemaining = Math.max(0, 100 - pctUsed);
      const usedStr      = Utils.formatTokens(used);
      const limStr       = Utils.formatTokens(lim);
      info.textContent   = `${usedStr} used (${pctUsed}%), ~${pctRemaining}% remaining of ${limStr}`;
    }
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

  // ─── Retry last message ──────────────────────────────────────────────────

  /**
   * Appends a small "↻ Retry" button beneath the last assistant reply.
   * Removed automatically when sendMessage fires again.
   */
  addRetryButton(onRetry) {
    this.removeRetryButton(); // only one at a time
    const chat = this.el('chatBody');
    if (!chat) return;
    const btn = document.createElement('button');
    btn.id = 'retryBtn';
    btn.className = 'retry-btn';
    btn.setAttribute('aria-label', 'Retry last message');
    btn.textContent = '↻ Retry';
    btn.addEventListener('click', () => { this.removeRetryButton(); onRetry(); });
    chat.appendChild(btn);
    chat.scrollTop = chat.scrollHeight;
  },

  removeRetryButton() {
    const el = this.el('retryBtn');
    if (el) el.remove();
  },

  // ─── Toast ────────────────────────────────────────────────────────────────

  toast(message, type = 'info', duration = 3000) {
    const area = this.el('toastArea');
    if (!area) return;

    const existing = Array.from(area.querySelectorAll('.toast')).find(t => t.dataset.msg === message);
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.dataset.msg = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    area.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
};
