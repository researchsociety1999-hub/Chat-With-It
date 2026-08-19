import { describe, expect, it } from 'vitest';
import { Utils } from '../js/utils.js';

describe('utility behavior', () => {
  it('formats token counts and context usage', () => {
    expect(Utils.formatTokens(12345.9)).toBe('12,345');
    expect(Utils.formatContextUsage(0.756)).toBe('76%');
    expect(Utils.formatContextInfo(2048, 8192)).toBe('2,048 / ~8k tokens');
  });

  it('accepts supported API key formats and rejects malformed keys', () => {
    expect(Utils.isValidApiKey(' sk-or-' + 'x'.repeat(20) + ' ')).toBe(true);
    expect(Utils.isValidApiKey('hf_' + 'x'.repeat(7))).toBe(true);
    expect(Utils.isValidApiKey('sk-short')).toBe(false);
    expect(Utils.isValidApiKey('not-a-key')).toBe(false);
    expect(Utils.isValidApiKey(null)).toBe(false);
  });

  it('escapes regex metacharacters before search highlighting', () => {
    expect(Utils.escapeRegex('a+b?')).toBe('a\\+b\\?');
    expect(Utils.highlightMatches('a+b? is literal', 'a+b?')).toContain('search-highlight');
    expect(Utils.highlightMatches('plain', '')).toBe('plain');
  });

  it('sanitizes unsafe markdown output', async () => {
    const html = await Utils.parseMarkdown('<img src=x onerror=alert(1)>**safe**');

    expect(html).not.toContain('onerror');
    expect(html).toContain('<strong>safe</strong>');
  });

  it('rejects files larger than the configured limit', () => {
    expect(Utils.isValidFileSize(10 * 1024 * 1024)).toBe(true);
    expect(Utils.isValidFileSize(10 * 1024 * 1024 + 1)).toBe(false);
  });
});
