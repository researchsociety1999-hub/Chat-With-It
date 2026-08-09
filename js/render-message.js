/**
 * js/render-message.js
 * ChatWithIt — Chat Message Rendering (Visual Core)
 *
 * Assumes globally available:
 *   - marked (Marked.js)      -> marked.parse(str)
 *   - Prism (Prism.js)        -> Prism.highlightAllUnder(el)
 *   - curatedModels           -> { [modelName]: { name, contextWindow, promptCostPer1k, completionCostPer1k, provider } }
 *
 * messageObject shape (per messagesRepo.js):
 * {
 *   id: string,
 *   role: 'user' | 'assistant' | 'system',
 *   content: string,                 // raw markdown/text
 *   modelName?: string,               // e.g. 'openrouter/anthropic/claude-3.5', assistant messages only
 *   personaTag?: string,              // e.g. 'creative', 'coder', assistant messages only
 *   attachments?: [{ name, mimeType, size, blobUrl }],
 *   tokensIn?: number,                // tokens used for the user's prompt/message
 *   tokensOut?: number,
 *   contextUsed?: number,             // tokens used for system prompt/history
 *   timestamp: number | string,
 *   status?: 'idle' | 'streaming' | 'error'
 * }
 */

(function (global) {
  'use strict';

  const ICONS = {
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/></svg>',
    assistant: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3v4M16 3v4M3 12h18"/></svg>',
    copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
    retry: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
    file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
    image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  /**
   * Parses markdown content into safe HTML. Falls back to escaped text
   * with <br> line breaks if Marked.js isn't loaded.
   */
  function parseContent(rawContent) {
    if (!rawContent) return { html: '' };

    let html;
    if (global.marked && typeof global.marked.parse === 'function') {
      html = global.marked.parse(rawContent, { breaks: true, gfm: true });
    } else {
      html = escapeHtml(rawContent).replace(/\n/g, '<br>');
    }

    return { html };
  }

  /**
   * Adds a language label + copy button to each <pre><code> block
   * inside the given container, then runs Prism highlighting.
   * Call AFTER innerHTML is set on the wrapper.
   */
  function enhanceCodeBlocks(container) {
    const blocks = container.querySelectorAll('pre code');
    blocks.forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (pre.dataset.enhanced) return;
      pre.dataset.enhanced = 'true';

      const langMatch = codeEl.className.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : 'text';

      const bar = document.createElement('div');
      bar.className = 'cwi-code-bar';
      bar.innerHTML = `
        <span class="cwi-code-lang">${escapeHtml(lang)}</span>
        <button class="cwi-code-copy" type="button" aria-label="Copy code">
          ${ICONS.copy}<span>Copy</span>
        </button>
      `;
      pre.classList.add('cwi-code-block');
      pre.prepend(bar);

      bar.querySelector('.cwi-code-copy').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(codeEl.textContent);
          const btn = e.currentTarget;
          const span = btn.querySelector('span');
          const prevText = span.textContent;
          span.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            span.textContent = prevText;
            btn.classList.remove('copied');
          }, 1500);
        } catch (err) {
          console.error('Copy failed', err);
        }
      });
    });

    if (global.Prism && typeof global.Prism.highlightAllUnder === 'function') {
      global.Prism.highlightAllUnder(container);
    }
  }

  function attachmentIcon(mimeType) {
    if (mimeType && mimeType.startsWith('image/')) return ICONS.image;
    return ICONS.file;
  }

  /**
   * Renders the attachment strip. Returns an HTML string (may be empty).
   * Images render as circular thumbnails linking to the lazy-loaded blob;
   * everything else renders as a labeled file chip.
   * Each attachment: { name, mimeType, size, blobUrl }
   */
  function renderAttachments(attachments) {
    if (!attachments || !attachments.length) return '';

    const items = attachments.map((att) => {
      const isImage = att.mimeType && att.mimeType.startsWith('image/');
      const thumb = isImage && att.blobUrl
        ? `<img src="${escapeHtml(att.blobUrl)}" alt="${escapeHtml(att.name)}" loading="lazy" />`
        : `<span class="cwi-attach-icon">${attachmentIcon(att.mimeType)}</span>`;

      return `
        <a class="cwi-attachment ${isImage ? 'is-image' : ''}"
           href="${escapeHtml(att.blobUrl || '#')}"
           target="_blank" rel="noopener"
           title="${escapeHtml(att.name)} (${formatBytes(att.size)})">
          ${thumb}
          <span class="cwi-attach-meta">
            <span class="cwi-attach-name">${escapeHtml(att.name)}</span>
            <span class="cwi-attach-size">${formatBytes(att.size)}</span>
          </span>
        </a>
      `;
    }).join('');

    return `<div class="cwi-attachments">${items}</div>`;
  }

  /**
   * Computes token/context stats for the footer using the curatedModels
   * lookup table (modelName -> { name, contextWindow, ... }).
   */
  function computeStats(messageObject) {
    const stats = {
      tokensIn: messageObject.tokensIn || 0,
      tokensOut: messageObject.tokensOut || 0,
      contextUsed: messageObject.contextUsed || 0,
      contextMax: null,
      contextPct: null,
      modelLabel: null
    };

    const modelName = messageObject.modelName;
    const modelData = modelName && global.curatedModels ? global.curatedModels[modelName] : null;

    if (modelData) {
      stats.modelLabel = modelData.name || modelName;
      stats.contextMax = modelData.contextWindow || null;
      if (stats.contextMax) {
        stats.contextPct = Math.min(100, Math.round((stats.contextUsed / stats.contextMax) * 100));
      }
    } else if (modelName) {
      // Fall back to a short label if not found in curatedModels
      // e.g. 'openrouter/anthropic/claude-3.5' -> 'claude-3.5'
      const parts = modelName.split('/');
      stats.modelLabel = parts[parts.length - 1];
    }

    return stats;
  }

  function renderFooter(messageObject, stats) {
    if (messageObject.role !== 'assistant') {
      return `<div class="cwi-msg-footer"><span class="cwi-msg-time">${formatTime(messageObject.timestamp)}</span></div>`;
    }

    const parts = [];
    if (stats.modelLabel) {
      parts.push(`<span class="cwi-stat cwi-stat-model">${escapeHtml(stats.modelLabel)}</span>`);
    }
    if (messageObject.personaTag) {
      parts.push(`<span class="cwi-stat cwi-stat-persona">${escapeHtml(messageObject.personaTag)}</span>`);
    }
    if (stats.tokensIn || stats.tokensOut) {
      parts.push(`<span class="cwi-stat cwi-stat-tokens">${stats.tokensIn}↑ / ${stats.tokensOut}↓ tok</span>`);
    }
    if (stats.contextPct !== null) {
      parts.push(`
        <span class="cwi-stat cwi-stat-context" title="${stats.contextUsed} / ${stats.contextMax} tokens">
          <span class="cwi-context-bar"><span class="cwi-context-fill" style="width:${stats.contextPct}%"></span></span>
          ${stats.contextPct}% ctx
        </span>
      `);
    }

    return `
      <div class="cwi-msg-footer">
        <div class="cwi-msg-stats">${parts.join('')}</div>
        <div class="cwi-msg-actions">
          <button class="cwi-msg-action" data-action="copy" type="button" aria-label="Copy message">${ICONS.copy}</button>
          <button class="cwi-msg-action" data-action="retry" type="button" aria-label="Retry message">${ICONS.retry}</button>
        </div>
        <span class="cwi-msg-time">${formatTime(messageObject.timestamp)}</span>
      </div>
    `;
  }

  /**
   * Main entry point. Returns a fully built, styled DOM element.
   * ui.js should call: container.appendChild(renderMessage(msg))
   */
  function renderMessage(messageObject) {
    if (!messageObject || !messageObject.role) {
      throw new Error('renderMessage: invalid messageObject');
    }

    const { html: bodyHtml } = parseContent(messageObject.content);
    const attachmentsHtml = renderAttachments(messageObject.attachments);
    const stats = computeStats(messageObject);
    const footerHtml = renderFooter(messageObject, stats);
    const isStreaming = messageObject.status === 'streaming';
    const isError = messageObject.status === 'error';

    const wrapper = document.createElement('div');
    wrapper.className = [
      'cwi-message',
      `cwi-message--${messageObject.role}`,
      isStreaming ? 'is-streaming' : '',
      isError ? 'is-error' : ''
    ].filter(Boolean).join(' ');
    wrapper.dataset.messageId = messageObject.id || '';

    wrapper.innerHTML = `
      <div class="cwi-msg-avatar">${ICONS[messageObject.role] || ICONS.assistant}</div>
      <div class="cwi-msg-bubble">
        <div class="cwi-msg-content">${bodyHtml}</div>
        ${attachmentsHtml}
        ${isStreaming ? '<span class="cwi-typing-dot"></span><span class="cwi-typing-dot"></span><span class="cwi-typing-dot"></span>' : ''}
        ${footerHtml}
      </div>
    `;

    enhanceCodeBlocks(wrapper);

    const copyBtn = wrapper.querySelector('[data-action="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(messageObject.content || '');
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1200);
        } catch (err) {
          console.error('Copy failed', err);
        }
      });
    }

    const retryBtn = wrapper.querySelector('[data-action="retry"]');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        wrapper.dispatchEvent(new CustomEvent('cwi:retry-message', {
          bubbles: true,
          detail: { messageId: messageObject.id }
        }));
      });
    }

    return wrapper;
  }

  global.ChatWithIt = global.ChatWithIt || {};
  global.ChatWithIt.renderMessage = renderMessage;
  global.ChatWithIt.escapeHtml = escapeHtml;

})(typeof window !== 'undefined' ? window : globalThis);
