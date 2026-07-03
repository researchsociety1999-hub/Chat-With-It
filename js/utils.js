/**
 * Utility Functions
 * Formatting, validation, storage, and helper functions
 */

const Utils = {
  formatTokens(count) {
    return Math.floor(count).toLocaleString();
  },

  formatContextUsage(pct) {
    return Math.round(pct * 100) + '%';
  },

  formatContextInfo(used, limit) {
    return `${Utils.formatTokens(used)} / ~${(limit / 1000).toFixed(0)}k tokens`;
  },

  sanitizeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  },

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Validate API key format.
   * Trims whitespace first — copy-paste trailing spaces are the #1 cause of
   * "invalid key" errors for first-time users.
   * Accepts:
   *   OpenRouter/OpenAI: sk-xxx or sk-or-xxx (20+ chars)
   *   Anthropic:         sk-ant-xxx          (20+ chars)
   *   Hugging Face:      hf_xxx              (10+ chars)
   */
  isValidApiKey(key) {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (trimmed.startsWith('hf_') && trimmed.length >= 10) return true;
    return (trimmed.startsWith('sk-') || trimmed.startsWith('sk-ant-')) && trimmed.length >= 20;
  },

  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func(...args); };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  getTimeSince(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  },

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  },

  /**
   * Download a text payload as a file.
   * Signature is (filename, text, mimeType) to match all app call sites.
   */
  downloadAsFile(filename, text, mimeType = 'text/plain') {
    const blob = new Blob([text], { type: mimeType });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    try {
      document.body.appendChild(a);
      a.click();
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  },

  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Parse markdown and sanitize output to prevent XSS.
   * Uses marked + DOMPurify when available.
   * Falls back gracefully to plain-text rendering if either CDN script failed
   * to load (SRI mismatch, network error, etc.) — keeps the app functional.
   */
  async parseMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try {
        const raw = marked.parse(text);
        if (typeof DOMPurify !== 'undefined') {
          return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
        }
        // DOMPurify unavailable — strip dangerous tags manually
        console.warn('DOMPurify unavailable — using manual HTML sanitisation.');
        return raw
          .replace(/<(script|iframe|object|embed|link|meta|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
          .replace(/<(script|iframe|object|embed|link|meta|form)\b[^>]*\/?>/gi, '')
          .replace(/\s+on\w+\s*=/gi, ' data-removed=');
      } catch (e) {
        console.error('Markdown parse error:', e);
        return Utils.sanitizeHtml(text);
      }
    }
    // marked unavailable — render as safe plain text
    console.warn('marked unavailable — falling back to plain-text rendering.');
    return Utils.sanitizeHtml(text);
  },

  /**
   * Highlight search matches in text.
   * Wraps result in DOMPurify.sanitize when available to prevent XSS via
   * crafted search queries.
   */
  highlightMatches(text, query) {
    if (!query || !text) return text;
    try {
      const regex = new RegExp(`(${Utils.escapeRegex(query)})`, 'gi');
      const highlighted = text.replace(regex, '<span class="search-highlight">$1</span>');
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(highlighted, {
          ALLOWED_TAGS: ['span'],
          ALLOWED_ATTR: ['class'],
        });
      }
      return highlighted;
    } catch (e) {
      console.error('Highlight error:', e);
      return text;
    }
  },

  isValidFileSize(sizeInBytes, maxSizeMb = 10) {
    return sizeInBytes <= maxSizeMb * 1024 * 1024;
  },

  isMobile() {
    return window.innerWidth <= 768;
  },

  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const delay = baseDelay * Math.pow(2, i);
        await Utils.sleep(delay);
      }
    }
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },
};
