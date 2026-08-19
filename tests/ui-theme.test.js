import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UI } from '../js/ui.js';

describe('theme behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = `
      <button id="themeBtn" aria-expanded="false"></button>
      <div id="theme-menu">
        <button class="theme-opt" data-theme="dark"></button>
        <button class="theme-opt" data-theme="light"></button>
        <button class="theme-opt" data-theme="violet"></button>
        <button class="theme-opt" data-theme="system"></button>
      </div>
    `;
    window.matchMedia = vi.fn(query => ({
      matches: query.includes('prefers-color-scheme: light'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('applies and persists a named theme', () => {
    UI.setTheme('violet');

    expect(document.documentElement.getAttribute('data-theme')).toBe('violet');
    expect(localStorage.getItem('cwi_theme')).toBe('violet');
    expect(document.querySelector('.theme-opt[data-theme="violet"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.theme-opt[data-theme="dark"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('resolves System to the operating system light preference', () => {
    UI.setTheme('system');

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('cwi_theme')).toBe('system');
    expect(document.querySelector('.theme-opt[data-theme="system"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('loads a persisted theme and marks its option selected', () => {
    localStorage.setItem('cwi_theme', 'light');

    UI.loadTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('.theme-opt[data-theme="light"]').getAttribute('aria-pressed')).toBe('true');
  });
});