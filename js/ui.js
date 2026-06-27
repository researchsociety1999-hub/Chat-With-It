/**
 * UI Handler
 * Manages all DOM updates, rendering, and UI interactions
 */

const UI = {
  /**
   * Get DOM element safely
   */
  el(id) {
    return document.getElementById(id);
  },

  /**
   * Show toast notification
   */
  toast(message, type = 'info') {
    const colors = {
      info: 'var(--accent)',
      success: 'var(--green)',
      error: 'var(--rose)',
      warning: 'var(--amber)'
    };

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span style="color:${colors[type] || colors.info}">${message}</span>`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    this.el('toast-container').appendChild(toast);

    setTimeout(() => toast.remove(), 2900);
  },

  /**
   * Update status message
   */
  setStatus(message, type = 'neutral', isHF = false) {
    const el = isHF ? this.el('hfStatus') : this.el('status');
    const colors = {
      ok: 'var(--green)',
      error: 'var(--rose)',
      info: 'var(--accent)',
      neutral: 'var(--fg-muted)'
    };

    el.style.color = colors[type] || colors.neutral;
    el.style.borderColor = type === 'neutral' ? 'var(--border)' : colors[type];
    el.textContent = message;
  },

  /**
   * Populate model selects
   */
  populateModels(models) {
    ['modelSelect', 'modelSelectB'].forEach(id => {
      const select = this.el(id);
      const previousValue = select.value;

      select.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = 'none';
      defaultOption.textContent = id === 'modelSelect' ? '\u2014 select a model \u2014' : '\u2014 select model B \u2014';
      select.appendChild(defaultOption);

      models.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.provider ? `${m.name} [${m.provider}]` : m.name;
        select.appendChild(option);
      });

      // Restore previous selection if available
      if (models.some(m => m.id === previousValue)) {
        select.value = previousValue;
      }
    });
  },

  /**
   * Update active model badge
   */
  updateBadge() {
    const modelId = this.el('modelSelect').value;
    const provider = API.getProvider();

    if (modelId === 'none') {
      this.el('activeBadge').innerHTML = '<span class="crumb-dot"></span>No model selected';
      return;
    }

    const model = AppState.allModels.find(m => m.id === modelId);
    const badge = `<span class="provider-badge ${provider.badgeClass}">${provider.badgeLabel}</span>`;
    const name = model ? Utils.sanitizeHtml(model.name) : modelId;
    this.el('activeBadge').innerHTML = `<span class="crumb-dot"></span>${badge} ${name}`;
  },

  /**
   * Append message to chat
   */
  appendMessage(role, content, container = null) {
    const chat = container || this.el('chat');
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${role}`;
    wrap.setAttribute('role', 'article');

    const avatar = document.createElement('div');
    avatar.className = `avatar ${role}`;
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'user' ? '\uD83D\uDC64' : '\uD83E\uDD16';

    const col = document.createElement('div');
    col.className = 'bubble-col';

    const bubble = document.createElement('div');
    bubble.className = `bubble ${role}`;

    if (role === 'assistant') {
      // Parse markdown and render HTML
      Utils.parseMarkdown(content).then(html => {
        bubble.innerHTML = html;
      }).catch(e => {
        console.error('Markdown error:', e);
        bubble.textContent = content;
      });
    } else {
      bubble.textContent = content;
    }

    const timestamp = document.createElement('div');
    timestamp.className = 'msg-meta';
    timestamp.textContent = new Date().toLocaleTimeString();
    timestamp.setAttribute('aria-hidden', 'true');

    col.appendChild(bubble);
    col.appendChild(timestamp);
    wrap.appendChild(avatar);
    wrap.appendChild(col);

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;

    return wrap;
  },

  /**
   * Create an empty streaming assistant bubble.
   * Returns the bubble element so tokens can be appended into it.
   */
  createStreamBubble() {
    const chat = this.el('chat');

    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap assistant';
    wrap.setAttribute('role', 'article');

    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '\uD83E\uDD16';

    const col = document.createElement('div');
    col.className = 'bubble-col';

    const bubble = document.createElement('div');
    bubble.className = 'bubble assistant streaming';

    const content = document.createElement('span');
    content.className = 'bubble-stream-content';
    bubble.appendChild(content);

    const timestamp = document.createElement('div');
    timestamp.className = 'msg-meta';
    timestamp.textContent = new Date().toLocaleTimeString();
    timestamp.setAttribute('aria-hidden', 'true');

    col.appendChild(bubble);
    col.appendChild(timestamp);
    wrap.appendChild(avatar);
    wrap.appendChild(col);

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;

    return bubble;
  },

  /**
   * Append a streaming token delta to a live stream bubble.
   */
  appendStreamToken(bubble, delta) {
    const content = bubble.querySelector('.bubble-stream-content');
    if (content) {
      content.textContent += delta;
      const chat = this.el('chat');
      chat.scrollTop = chat.scrollHeight;
    }
  },

  /**
   * Finalise a stream bubble once all tokens have arrived.
   * Parses the full Markdown content and replaces the raw streamed text.
   */
  finaliseStreamBubble(bubble, fullContent) {
    bubble.classList.remove('streaming');
    const content = bubble.querySelector('.bubble-stream-content');
    if (!content) return;

    Utils.parseMarkdown(fullContent)
      .then(html => {
        content.innerHTML = html;
      })
      .catch(e => {
        console.error('Markdown finalise error:', e);
        content.textContent = fullContent;
      });
  },

  /**
   * Show typing indicator
   */
  showTyping(container = null) {
    const chat = container || this.el('chat');
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap assistant';
    wrap.id = 'typing-indicator';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'AI is typing');

    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '\uD83E\uDD16';

    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<span></span><span></span><span></span>';

    wrap.appendChild(avatar);
    wrap.appendChild(typing);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  },

  /**
   * Remove typing indicator
   */
  removeTyping() {
    const typing = this.el('typing-indicator');
    if (typing) typing.remove();
  },

  /**
   * Update token statistics
   */
  updateStats(promptToks, completionToks) {
    const max = Math.max(promptToks, completionToks, 1);
    this.el('bar-prompt').style.width = (promptToks / max * 100) + '%';
    this.el('bar-completion').style.width = (completionToks / max * 100) + '%';
    this.el('val-prompt').textContent = Utils.formatTokens(promptToks);
    this.el('val-completion').textContent = Utils.formatTokens(completionToks);

    // Update context ring
    const ctxSize = AppState.getContextLimit();
    const used = AppState.totalPromptTokens + AppState.totalCompletionTokens;
    const pct = AppState.getContextUsage();
    const circumference = 138.2;

    const ring = this.el('ctx-ring');
    ring.style.strokeDashoffset = circumference * (1 - pct);
    ring.style.stroke = pct > 0.8 ? 'var(--rose)' : pct > 0.5 ? 'var(--amber)' : 'var(--teal)';
    this.el('ctx-pct').textContent = Utils.formatContextUsage(pct);
    this.el('ctx-sub').textContent = Utils.formatContextInfo(used, ctxSize);

    // Update turn list
    const turnList = this.el('turn-list');
    turnList.innerHTML = '';
    AppState.turnTokens.slice(-8).forEach((t, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;font-size:.68rem;color:var(--fg-muted);font-family:var(--mono);padding:.1rem 0;';
      const turnNumber = AppState.turnTokens.length - Math.min(AppState.turnTokens.length, 8) + i + 1;
      row.innerHTML = `<span>Turn ${turnNumber}</span><span style="color:var(--accent)">${t.p}p</span><span style="color:var(--teal)">${t.c}c</span>`;
      row.setAttribute('role', 'listitem');
      turnList.appendChild(row);
    });

    this.updateMonitor();
  },

  /**
   * Update monitor statistics
   */
  updateMonitor() {
    const msgs = AppState.chatHistory.length;
    const turns = Math.floor(msgs / 2);
    const tokens = AppState.totalPromptTokens + AppState.totalCompletionTokens;
    this.el('monitor').innerHTML = `\uD83D\uDCCA <b>${msgs}</b> msgs \u00B7 <b>${turns}</b> turns \u00B7 <b>${Utils.formatTokens(tokens)}</b> tokens`;
  },

  /**
   * Clear chat
   */
  clearChat() {
    this.el('chat').innerHTML = '';
    AppState.clearChat();
    this.updateMonitor();
    this.updateStats(0, 0);
  },

  /**
   * Toggle sidebar
   */
  toggleSidebar() {
    const sidebar = this.el('sidebar');
    const overlay = this.el('mobileOverlay');

    if (Utils.isMobile()) {
      AppState.sidebarOpen = !AppState.sidebarOpen;
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
      AppState.sidebarOpen = !sidebar.classList.contains('collapsed');
    }
  },

  /**
   * Toggle stats panel
   */
  toggleStats() {
    const panel = this.el('right-panel');
    AppState.statsOpen = !AppState.statsOpen;
    panel.classList.toggle('open');
    if (AppState.statsOpen) {
      this.updateStats(
        AppState.totalPromptTokens,
        AppState.totalCompletionTokens
      );
    }
  },

  /**
   * Toggle export menu
   */
  toggleExportMenu() {
    const menu = this.el('export-menu');
    if (menu) menu.classList.toggle('open');
  },

  /**
   * Toggle theme
   */
  setTheme(themeName) {
    document.body.className = themeName;
    localStorage.setItem('cwiTheme', themeName);
  },

  /**
   * Load saved theme
   */
  loadTheme() {
    const saved = localStorage.getItem('cwiTheme') || 'theme-midnight';
    this.setTheme(saved);
  },

  /**
   * Show welcome screen
   */
  showWelcome() {
    this.el('welcome').style.display = 'flex';
    this.el('chat').style.display = 'none';
  },

  /**
   * Show chat screen
   */
  showChat() {
    this.el('welcome').style.display = 'none';
    this.el('chat').style.display = 'flex';
  },

  /**
   * Enable/disable send button
   */
  setSendButtonState(enabled) {
    const btn = this.el('sendBtn');
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', !enabled);
  },

  /**
   * Update character count
   */
  updateCharCount(count) {
    this.el('char-count').textContent = count.toString();
  },

  /**
   * Show search overlay
   */
  showSearchOverlay() {
    this.el('search-overlay').classList.add('open');
    this.el('search-input-box').focus();
  },

  /**
   * Hide search overlay
   */
  hideSearchOverlay() {
    this.el('search-overlay').classList.remove('open');
  },
};
