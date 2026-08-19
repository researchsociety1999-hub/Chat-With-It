import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UI } from '../js/ui.js';
import { AppState } from '../js/state.js';

let viewportWidth = 390;

function setViewport(width) {
  viewportWidth = width;
  window.matchMedia = vi.fn(query => ({
    matches: query.includes('min-width') ? width >= 1101 : width <= 1100,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderSidebarFixture() {
  document.body.innerHTML = `
    <button id="sidebarToggle" aria-expanded="false">Menu</button>
    <div id="mobileOverlay"></div>
    <aside id="sidebar">
      <button id="firstSidebarControl">Lock</button>
    </aside>
  `;
}

describe('sidebar behavior', () => {
  beforeEach(() => {
    renderSidebarFixture();
    document.body.className = '';
    localStorage.clear();
    AppState.sidebarOpen = false;
    setViewport(viewportWidth);
  });

  it('opens the sidebar and overlay on mobile', () => {
    UI.toggleSidebar();

    expect(document.querySelector('#sidebar').classList.contains('open')).toBe(true);
    expect(document.querySelector('#mobileOverlay').classList.contains('show')).toBe(true);
    expect(document.body.classList.contains('sidebar-open')).toBe(true);
    expect(document.querySelector('#sidebarToggle').getAttribute('aria-expanded')).toBe('true');
    expect(AppState.sidebarOpen).toBe(true);
  });

  it('moves focus into the sidebar when opening and returns it when closing', () => {
    const toggle = document.querySelector('#sidebarToggle');
    toggle.focus();

    UI.toggleSidebar();
    expect(document.activeElement).toBe(document.querySelector('#firstSidebarControl'));

    UI.toggleSidebar();
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('collapses the desktop sidebar without opening the mobile overlay', () => {
    setViewport(1440);

    UI.toggleSidebar();

    expect(document.body.classList.contains('sidebar-collapsed')).toBe(true);
    expect(document.querySelector('#sidebar').classList.contains('open')).toBe(false);
    expect(document.querySelector('#mobileOverlay').classList.contains('show')).toBe(false);
    expect(document.querySelector('#sidebarToggle').getAttribute('aria-pressed')).toBe('true');
    expect(AppState.sidebarOpen).toBe(false);
  });

  it('restores the persisted desktop collapse state', () => {
    setViewport(1440);
    localStorage.setItem('cwi_sidebar_collapsed', 'true');

    UI.loadSidebarState();

    expect(document.body.classList.contains('sidebar-collapsed')).toBe(true);
  });

  it('cleans stale mobile state when invoked on desktop', () => {
    setViewport(1440);
    document.querySelector('#sidebar').classList.add('open');
    document.querySelector('#mobileOverlay').classList.add('show');
    document.body.classList.add('sidebar-open');

    UI.toggleSidebar();

    expect(document.querySelector('#sidebar').classList.contains('open')).toBe(true);
    expect(document.querySelector('#mobileOverlay').classList.contains('show')).toBe(false);
    expect(document.body.classList.contains('sidebar-open')).toBe(false);
  });
});
