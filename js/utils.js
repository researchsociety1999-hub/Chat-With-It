/**
 * Utility Functions
 * Formatting, validation, storage, and helper functions
 */

const Utils = {
  /**
   * Format token count with comma separator
   */
  formatTokens(count) {
    return Math.floor(count).toLocaleString();
  },

  /**
   * Format context usage as percentage
   */
  formatContextUsage(pct) {
    return Math.round(pct * 100) + '%';
  },

  /**
   * Format context info string
   */
  formatContextInfo(used, limit) {
    return `${Utils.formatTokens(used)} / ~${(limit / 1000).toFixed(0)}k tokens`;
  },

  /**
   * Sanitize HTML to prevent XSS
   */
  sanitizeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  },

  /**
   * Escape special regex characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * Validate email format
   */
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Validate API key format
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

  /**
   * Deep clone an object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Debounce a function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle a function
   */
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

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Get time since timestamp
   */
  getTimeSince(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  },

  /**
   * Copy text to clipboard
   */
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
   * Download text as file
   */
  downloadAsFile(text, filename, mimeType = 'text/plain') {
    const blob = new Blob([text], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Generate unique ID
   */
  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Parse markdown and sanitize output to prevent XSS.
   * Uses DOMPurify if available, otherwise strips dangerous tags/attributes manually.
   */
  async parseMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try {
        const raw = marked.parse(text);
        // Prefer DOMPurify when available (loaded via CDN)
        if (typeof DOMPurify !== 'undefined') {
          return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
        }
        // Fallback: strip script/iframe/object tags and inline event handlers
        return raw
          .replace(/<(script|iframe|object|embed|link|meta|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
          .replace(/<(script|iframe|object|embed|link|meta|form)\b[^>]*\/?>/gi, '')
          .replace(/\s+on\w+\s*=/gi, ' data-removed=');
      } catch (e) {
        console.error('Markdown parse error:', e);
        return Utils.sanitizeHtml(text);
      }
    }
    return Utils.sanitizeHtml(text);
  },

  /**
   * Highlight search matches in text
   */
  highlightMatches(text, query) {
    if (!query || !text) return text;
    try {
      const regex = new RegExp(`(${Utils.escapeRegex(query)})`, 'gi');
      return text.replace(regex, '<span class="search-highlight">$1</span>');
    } catch (e) {
      console.error('Highlight error:', e);
      return text;
    }
  },

  /**
   * Validate file size
   */
  isValidFileSize(sizeInBytes, maxSizeMb = 10) {
    return sizeInBytes <= maxSizeMb * 1024 * 1024;
  },

  /**
   * Check if device is mobile
   */
  isMobile() {
    return window.innerWidth <= 768;
  },

  /**
   * Retry async operation with exponential backoff
   */
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

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },
};
