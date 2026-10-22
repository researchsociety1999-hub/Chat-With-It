import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { UI } from '../js/ui.js';

// jsdom may lack HTMLDialogElement.showModal/close; stub minimally so close fires 'close'.
beforeEach(() => {
  const P = window.HTMLDialogElement.prototype;
  P.showModal = function () { this.setAttribute('open', ''); };
  P.close = function (v) { this.removeAttribute('open'); this.returnValue = v; this.dispatchEvent(new Event('close')); };
  document.body.innerHTML = '<button id="opener">Open</button><div id="toastArea"></div>';
});

describe('confirmModal', () => {
  it('focuses Cancel by default and restores focus to the opener', () => {
    const opener = document.getElementById('opener');
    opener.focus();
    const dlg = UI.confirmModal('Delete?', () => {});
    expect(document.activeElement.classList.contains('confirm-cancel')).toBe(true);
    dlg.querySelector('.confirm-cancel').click();
    expect(document.activeElement).toBe(opener);
  });
  it('calls onConfirm once on Confirm, never on Cancel, and removes the node', () => {
    const yes = vi.fn(), no = vi.fn();
    const a = UI.confirmModal('A', yes);
    a.querySelector('.confirm-confirm').click();
    a.querySelector('.confirm-confirm').click();
    expect(yes).toHaveBeenCalledTimes(1);
    const b = UI.confirmModal('B', no);
    b.querySelector('.confirm-cancel').click();
    expect(no).not.toHaveBeenCalled();
    expect(document.querySelectorAll('dialog.confirm-box').length).toBe(0);
  });
});

describe('toast semantics', () => {
  it('uses alert for errors and status otherwise', () => {
    UI.toast('bad', 'error'); UI.toast('ok', 'success'); UI.toast('fyi', 'info');
    const roles = [...document.querySelectorAll('.toast')].map(t => t.getAttribute('role'));
    expect(roles).toEqual(['alert', 'status', 'status']);
  });
});

describe('static markup', () => {
  const html = readFileSync('index.html', 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  it('provider tabs are pressed-state buttons with no orphan tab roles', () => {
    const tabs = doc.querySelectorAll('.ptab');
    expect(tabs.length).toBeGreaterThan(0);
    tabs.forEach(t => {
      expect(t.tagName).toBe('BUTTON');
      expect(t.hasAttribute('aria-pressed')).toBe(true);
      expect(t.hasAttribute('aria-selected')).toBe(false);
    });
    expect(doc.querySelector('[role="tab"]')).toBeNull();
  });
  it('persona cards are real buttons with aria-pressed', () => {
    doc.querySelectorAll('.persona-card').forEach(c => {
      expect(c.tagName).toBe('BUTTON');
      expect(c.hasAttribute('aria-pressed')).toBe(true);
    });
  });
});

// WCAG contrast over real token values.
const lum = (h) => { const n = parseInt(h.slice(1), 16); return [16, 8, 0].map(s => ((n >> s) & 255) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((a, c, i) => a + c * [.2126, .7152, .0722][i], 0); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const css = readFileSync('css/themes.css', 'utf8') + readFileSync('css/variables.css', 'utf8');
const vars = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(m => [m[1], m[2]]));
const base = vars(readFileSync('css/variables.css', 'utf8').split('html.high-contrast')[0]);

describe('theme contrast (AA 4.5:1)', () => {
  for (const t of ['dark', 'light', 'violet', 'ember', 'forest', 'aurora']) {
    it(`${t}: text, muted text and on-accent`, () => {
      const m = css.match(new RegExp(`\\[data-theme="${t}"\\]\\s*\\{([^}]*)\\}`));
      const v = { ...base, ...vars(m[1]) };
      expect(ratio(v.fg, v['panel-solid'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(v['fg-muted'], v['panel-solid'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(v['on-accent'], v.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('user bubble end stops keep white text at 4.5:1', () => {
    for (const m of css.matchAll(/--user-bubble:\s*linear-gradient\([^)]*?(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\)/g)) {
      expect(ratio('#ffffff', m[2])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('overlay state', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn(q => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} }));
    document.body.className = '';
    document.body.innerHTML = `<div class="main"><button id="moreBtn" aria-expanded="false">More</button></div>
      <div id="mobileOverlay"></div><aside id="sidebar"></aside><aside id="rightPanel"></aside>
      <div id="actionTray"><button id="t1">One</button></div>`;
  });
  it('action tray makes the page behind it inert on mobile and restores on close', () => {
    UI.toggleActionTray();
    expect(document.body.classList.contains('actions-open')).toBe(true);
    expect(document.getElementById('sidebar').hasAttribute('inert')).toBe(true);
    expect(document.getElementById('mobileOverlay').classList.contains('show')).toBe(true);
    UI.closeActionTray({ restoreFocus: true });
    expect(document.getElementById('sidebar').hasAttribute('inert')).toBe(false);
    expect(document.getElementById('mobileOverlay').classList.contains('show')).toBe(false);
    expect(document.getElementById('moreBtn').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('announcer', () => {
  it('announce() replaces the live-region text once per call', async () => {
    document.body.innerHTML = '<div id="chatAnnouncer" aria-live="polite">old</div>';
    UI.announce('Response complete');
    expect(document.getElementById('chatAnnouncer').textContent).toBe('');
    await new Promise(r => requestAnimationFrame(r));
    expect(document.getElementById('chatAnnouncer').textContent).toBe('Response complete');
  });
  it('the shipped announcer is polite, not assertive', () => {
    const doc = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
    expect(doc.getElementById('chatAnnouncer').getAttribute('aria-live')).toBe('polite');
  });
});

// Translucent panels: blend rgba over the opaque page background, then compare text on the result.
const hexToRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const blend = (rgba, bgHex) => { const [r, g, b, a] = rgba; const bg = hexToRgb(bgHex); return '#' + [r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)).toString(16).padStart(2, '0')).join(''); };
describe('glass panel contrast (alpha blended over --bg)', () => {
  for (const t of ['dark', 'light', 'violet', 'ember', 'forest', 'aurora']) {
    it(`${t}: fg and muted text on --panel`, () => {
      const block = css.match(new RegExp(`\\[data-theme="${t}"\\]\\s*\\{([^}]*)\\}`))[1];
      const v = { ...base, ...vars(block) };
      const p = block.match(/--panel:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      const panel = blend([+p[1], +p[2], +p[3], +p[4]], v.bg);
      expect(ratio(v.fg, panel)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(v['fg-muted'], panel)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('focus indicator and warning colors', () => {
  for (const t of ['dark', 'light', 'violet', 'ember', 'forest', 'aurora']) {
    it(`${t}: focus ring accent is at least 3:1 against the page background`, () => {
      const block = css.match(new RegExp(`\\[data-theme="${t}"\\]\\s*\\{([^}]*)\\}`))[1];
      const v = { ...base, ...vars(block) };
      expect(ratio(v.accent, v.bg)).toBeGreaterThanOrEqual(3);
    });
  }
  it('the focus ring token is a solid accent ring, not a translucent glow', () => {
    const tok = readFileSync('css/variables.css', 'utf8').match(/--focus-ring:\s*([^;]+);/)[1];
    expect(tok).toContain('var(--accent)');
    expect(tok).not.toContain('accent-glow');
  });
  it('light warn color is readable as text on the panel', () => {
    const block = css.match(/\[data-theme="light"\]\s*\{([^}]*)\}/)[1];
    const v = { ...base, ...vars(block) };
    expect(ratio(v.warn, v['panel-solid'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('css wiring guards', () => {
  const layout = readFileSync('css/layout.css', 'utf8');
  it('every winning mobile composer padding rule includes the keyboard inset', () => {
    const rules = layout.match(/#composerWrap\s*\{[^}]*padding-bottom:[^}]*\}/g) || [];
    const mobile = rules.filter(r => r.includes('safe-area-inset-bottom'));
    expect(mobile.length).toBeGreaterThan(0);
    mobile.forEach(r => expect(r).toContain('--keyboard-inset'));
  });
  it('model list loading/error styles target the real #modelSelect element', () => {
    const comp = readFileSync('css/components.css', 'utf8');
    expect(comp).toMatch(/#modelSelect\.loading/);
    expect(comp).toMatch(/#modelSelect\.error/);
  });
  it('pulse-danger is defined in a loaded stylesheet', () => {
    expect(readFileSync('css/components.css', 'utf8')).toMatch(/@keyframes pulse-danger/);
  });
});
