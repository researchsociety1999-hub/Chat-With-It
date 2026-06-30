/**
 * UI Handler
 * Manages all DOM updates, rendering, and UI interactions.
 */

const UI = {

  el(id) {
    return document.getElementById(id);
  },

  // ─── Toast ────────────────────────────────────────────────────────────────

  toast(message, type = 'info') {
    const container = this.el('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  // ─── Status line ──────────────────────────────────────────────────────────

  setStatus(message, type = 'neutral', isHF = false) {
    const el = isHF ? this.el('hfStatus') : this.el('status');
    if (!el) return;
    const colors = { ok: 'var(--green)', error: 'var(--rose)', info: 'var(--accent)', neutral: 'var(--fg-muted)' };
    el.style.color = colors[type] || colors.neutral;
    el.textContent = message;
  },

  // ─── Model dropdowns ──────────────────────────────────────────────────────

  populateModels(models) {
    ['modelSelect', 'modelSelectB'].forEach(id => {
      const select = this.el(id);
      if (!select) return;
      const prev = select.value;
      select.innerHTML = '';
      const def = document.createElement('option');
      def.value = 'none';
      def.textContent = id === 'modelSelect' ? '— select a model —' : '— select model B —';
      select.appendChild(def);
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        const ctxLabel = m.ctx >= 1000000 ? `${Math.round(m.ctx/1000000)}M` :
                         m.ctx >= 1000    ? `${Math.round(m.ctx/1000)}k`    : `${m.ctx || '?'}`;
        const lock = m.uncensored ? ' 🔓' : '';
        opt.textContent = `${m.name || m.id} [${ctxLabel}]${lock}`;
        select.appendChild(opt);
      });
      if (models.some(m => m.id === prev)) select.value = prev;
    });
    this.updateBadge();
  },

  updateBadge() {
    const badge = this.el('activeBadge');
    if (!badge) return;
    const modelId = this.el('modelSelect')?.value;
    if (!modelId || modelId === 'none') {
      badge.textContent = 'No model';
      badge.className = 'model-badge';
      return;
    }
    const provider = (typeof API !== 'undefined' && API.getProvider?.()) || { badgeLabel: '', badgeClass: '' };
    const model = AppState.allModels.find(m => m.id === modelId);
    const name = model ? (model.name || modelId) : modelId;
    const shortName = name.length > 28 ? name.slice(0, 26) + '…' : name;
    badge.innerHTML = `<span style="opacity:.7;font-size:.6rem">${provider.badgeLabel || ''}</span> ${shortName}`;
    badge.className = 'model-badge ' + (provider.badgeClass || '');
  },

  // ─── Chat rendering ───────────────────────────────────────────────────────

  appendMessage(role, content) {
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

    if (role === 'assistant') {
      if (window.marked) {
        bubble.innerHTML = marked.parse(content);
      } else {
        bubble.textContent = content;
      }
    } else {
      bubble.textContent = content;
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
    return wrap;
  },

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

  finaliseStreamBubble(bubble, fullContent) {
    if (!bubble) return;
    bubble.classList.remove('streaming');
    const content = bubble.querySelector('.bubble-stream-content');
    if (!content) return;
    if (window.marked) {
      content.innerHTML = marked.parse(fullContent);
    } else {
      content.textContent = fullContent;
    }
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

    const bp = this.el('bar-prompt');
    const bc = this.el('bar-completion');
    const vp = this.el('val-prompt');
    const vc = this.el('val-completion');

    if (bp) bp.style.width = (promptToks / max * 100) + '%';
    if (bc) bc.style.width = (completionToks / max * 100) + '%';
    if (vp) vp.textContent = (typeof Utils !== 'undefined' && Utils.formatTokens) ? Utils.formatTokens(promptToks) : promptToks;
    if (vc) vc.textContent = (typeof Utils !== 'undefined' && Utils.formatTokens) ? Utils.formatTokens(completionToks) : completionToks;

    const ctxSize = AppState.getContextLimit?.() || 8192;
    const used = (AppState.totalPromptTokens || 0) + (AppState.totalCompletionTokens || 0);
    const pct = AppState.getContextUsage?.() || 0;
    const circumference = 138.2;

    const ring = this.el('ctx-ring');
    if (ring) {
      ring.style.strokeDashoffset = circumference * (1 - pct);
      ring.style.stroke = pct > 0.8 ? 'var(--rose)' : pct > 0.5 ? 'var(--amber)' : 'var(--teal)';
    }

    const cp = this.el('ctx-pct');
    const cs = this.el('ctx-sub');
    if (cp) cp.textContent = (typeof Utils !== 'undefined' && Utils.formatContextUsage) ? Utils.formatContextUsage(pct) : Math.round(pct * 100) + '%';
    if (cs) cs.textContent = (typeof Utils !== 'undefined' && Utils.formatContextInfo) ? Utils.formatContextInfo(used, ctxSize) : `${used} / ~${Math.round(ctxSize / 1000)}k tokens`;

    const turnList = this.el('turn-list');
    if (turnList && AppState.turnTokens) {
      turnList.innerHTML = '';
      AppState.turnTokens.slice(-8).forEach((t, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;font-size:.68rem;color:var(--fg-muted);font-family:var(--mono);padding:.1rem 0;';
        const n = AppState.turnTokens.length - Math.min(AppState.turnTokens.length, 8) + i + 1;
        row.innerHTML = `<span>Turn ${n}</span><span style="color:var(--accent)">${t.p}p</span><span style="color:var(--teal)">${t.c}c</span>`;
        row.setAttribute('role', 'listitem');
        turnList.appendChild(row);
      });
    }

    this.updateMonitor();
    this.updateContextDisplay();
  },

  updateMonitor() {
    const el = this.el('monitor');
    if (!el) return;
    const msgs = AppState.chatHistory?.length || 0;
    const turns = Math.floor(msgs / 2);
    const tokens = (AppState.totalPromptTokens || 0) + (AppState.totalCompletionTokens || 0);
    const fmt = (typeof Utils !== 'undefined' && Utils.formatTokens) ? Utils.formatTokens(tokens) : tokens;
    el.innerHTML = `📊 <b>${msgs}</b> msgs · <b>${turns}</b> turns · <b>${fmt}</b> tokens`;
  },

  updateContextDisplay() {
    const el = this.el('ctxUsage');
    if (!el) return;
    const pct = AppState.getContextUsage?.() || 0;
    const used = (AppState.totalPromptTokens || 0) + (AppState.totalCompletionTokens || 0);
    const limit = AppState.getContextLimit?.() || 8192;
    el.textContent = 'ctx: ' + ((typeof Utils !== 'undefined' && Utils.formatContextInfo) ? Utils.formatContextInfo(used, limit) : `${used}/${limit}`);
    el.style.color = pct > 0.8 ? 'var(--rose)' : pct > 0.5 ? 'var(--amber)' : 'var(--fg-dim)';
  },

  // ─── Chat state ───────────────────────────────────────────────────────────

  clearChat() {
    const chat = this.el('chatBody');
    if (!chat) return;
    const welcome = this.el('welcomeScreen');
    chat.innerHTML = '';
    if (welcome) chat.appendChild(welcome);
    AppState.clearChat?.();
    this.updateMonitor();
    this.updateStats(0, 0);
    this.showWelcome();
  },

  showWelcome() {
    const ws = this.el('welcomeScreen');
    if (ws) ws.style.display = '';
  },

  showChat() {
    const ws = this.el('welcomeScreen');
    if (ws) ws.style.display = 'none';
  },

  // ─── Layout panels ────────────────────────────────────────────────────────

  toggleSidebar() {
    const sidebar = this.el('sidebar');
    const overlay = this.el('mobileOverlay');
    if (!sidebar) return;
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const open = sidebar.classList.toggle('open');
      sidebar.classList.toggle('collapsed', !open);
      if (overlay) overlay.classList.toggle('active', open);
    } else {
      const collapsed = sidebar.classList.toggle('collapsed');
      if (overlay) overlay.classList.remove('active');
      if (!collapsed) sidebar.classList.remove('open');
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
    if (stop) stop.style.display = enabled ? 'none' : 'inline-flex';
  },

  updateCharCount(count) {
    const el = this.el('charCount');
    if (el) el.textContent = count + ' chars';
  },

  // ─── Theming ──────────────────────────────────────────────────────────────

  setTheme(themeName) {
    const cls = themeName ? 'theme-' + themeName.replace(/^theme-/, '') : 'theme-midnight';
    document.body.className = cls;
    try { localStorage.setItem('cwiTheme', cls); } catch (e) {}
  },

  loadTheme() {
    try {
      const saved = localStorage.getItem('cwiTheme') || 'theme-midnight';
      document.body.className = saved;
    } catch (e) {
      document.body.className = 'theme-midnight';
    }
  },
};
