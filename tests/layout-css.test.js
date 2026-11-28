import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Declaration blocks of every rule whose selector list contains `selector` (blocks without nested braces). */
function bodies(css, selector) {
  const re = new RegExp(`(?:^|[}\\s,])${escapeRe(selector)}\\s*(?:,[^{}]*)?\\{([^{}]*)\\}`, 'g');
  return [...css.matchAll(re)].map((m) => m[1]);
}

/** Highest z-index declared for `selector` in `css`. */
function zIndex(css, selector) {
  const values = bodies(css, selector)
    .map((body) => body.match(/z-index:\s*(\d+)/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return values.length ? Math.max(...values) : null;
}

describe('mobile action tray layering', () => {
  const pwa = read('css/pwa-safe-area.css');
  const layout = read('css/layout.css');

  it('sits above the backdrop overlay, the drawer and the Stats sheet', () => {
    const tray = zIndex(pwa, '.action-tray');
    expect(tray).toBe(150);
    expect(tray).toBeGreaterThan(zIndex(pwa, '.mobile-overlay.show'));
    expect(tray).toBeGreaterThan(zIndex(pwa, '.sidebar.open'));
    expect(tray).toBeGreaterThan(zIndex(layout, '.right-panel.open'));
  });

  it('the header does not trap the fixed tray (no backdrop-filter, no stacking context) at phone widths', () => {
    const header = bodies(pwa, '.chat-header').join('\n');
    expect(header).toMatch(/backdrop-filter:\s*none/);
    expect(header).toMatch(/z-index:\s*auto/);
  });
});

describe('mobile action tray motion', () => {
  const pwa = read('css/pwa-safe-area.css');

  it('slides and fades with a transition, and animates display where the browser supports it', () => {
    const closed = bodies(pwa, '.action-tray').find((body) => /opacity:\s*0/.test(body)) || '';
    expect(closed).toMatch(/transform:\s*translateY\(/);
    expect(closed).toMatch(/transition:\s*opacity[^;]*,\s*transform[^;]*;/);
    expect(closed).toMatch(/display[^;]*allow-discrete/);
    expect(bodies(pwa, '.action-tray.open').join('\n')).toMatch(/opacity:\s*1/);
    expect(pwa).toMatch(/@starting-style\s*\{\s*\.action-tray\.open\s*\{[^}]*opacity:\s*0/);
  });

  it('only changes the mobile layout (desktop keeps display: contents)', () => {
    expect(pwa).toMatch(/Mobile action tray motion[\s\S]*?\*\/\s*@media \(max-width: 1100px\)\s*\{\s*\.action-tray\s*\{/);
  });

  it('turns the animation off for prefers-reduced-motion', () => {
    expect(pwa).toMatch(/@media \(max-width: 1100px\) and \(prefers-reduced-motion: reduce\)\s*\{[^{]*\{[^}]*transition:\s*none/);
  });
});

describe('provider tab labels', () => {
  const local = read('css/local.css');

  it('can shrink and are cut with an ellipsis instead of overlapping', () => {
    const tab = bodies(local, '.ptab').find((body) => /text-overflow/.test(body)) || '';
    expect(tab).toMatch(/min-width:\s*0/);
    expect(tab).toMatch(/max-width:\s*100%/);
    expect(tab).toMatch(/flex-shrink:\s*1/);
    expect(tab).toMatch(/overflow:\s*hidden/);
    expect(tab).toMatch(/white-space:\s*nowrap/);
    expect(tab).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('use a block layout with a 44px line box on small screens and coarse pointers', () => {
    expect(local).toMatch(/@media \(max-width: 768px\), \(pointer: coarse\)\s*\{\s*\.ptab\s*\{[^}]*display:\s*block[^}]*line-height:\s*44px/);
  });

  it('keep three equal columns that are allowed to shrink', () => {
    expect(local).toMatch(/\.ptabs\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('use a smaller label on narrow phones', () => {
    expect(local).toMatch(/@media \(max-width: 400px\)\s*\{\s*\.ptab\s*\{[^}]*font-size/);
  });
});

describe('service worker cache version', () => {
  const sw = read('sw.js');
  it('was bumped for these CSS changes', () => {
    expect(Number(sw.match(/chatwithit-v(\d+)/)[1])).toBeGreaterThanOrEqual(29);
  });
  it('precaches local.css and pwa-safe-area.css', () => {
    expect(sw).toContain("'./css/local.css'");
    expect(sw).toContain("'./css/pwa-safe-area.css'");
  });
});
