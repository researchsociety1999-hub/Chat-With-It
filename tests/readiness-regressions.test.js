import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

describe('profile panel styles are intact', () => {
  const css = read('css/profiles.css');
  // Every class the profile panel markup uses must have a rule in the loaded stylesheet.
  const js = read('js/profiles.js');
  const used = [...js.matchAll(/class="([^"$]+)/g)].flatMap(m => m[1].split(/\s+/)).filter(c => c.startsWith('profile'));
  for (const cls of [...new Set(used)].filter(c => !['profile-active'].includes(c) && !c.startsWith('badge'))) {
    it(`.${cls} has a rule in profiles.css`, () => {
      expect(css).toMatch(new RegExp(`\\.${cls}[\\s{,:.]`));
    });
  }
  it('profile names truncate and actions stay aligned', () => {
    expect(css).toMatch(/\.profile-name\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.profile-actions\s*\{[^}]*display:\s*flex/);
  });
});

describe('saved profiles', () => {
  const js = read('js/profiles.js');
  it('activation asks the app to reload models via an event, not an undefined global', () => {
    expect(js).not.toMatch(/typeof App\b/);
    expect(js).toContain("'cwi:profile-activated'");
    expect(read('js/app.js')).toContain("'cwi:profile-activated'");
  });
  it('the panel tells the user a saved key is stored unencrypted', () => {
    expect(js).toMatch(/unencrypted in this browser/i);
  });
});

describe('privacy claims match the code', () => {
  const claims = ['PRIVACY.md', 'README.md', 'index.html', 'js/api.js'].map(read).join('\n');
  it('profiles really do store tokens in localStorage (so absolute "never stored" claims must not return)', () => {
    expect(read('js/profiles.js')).toMatch(/localStorage\.setItem/);
    expect(claims).not.toMatch(/never written to `?localStorage/i);
    expect(claims).not.toMatch(/Keys are never stored\./);
    expect(claims).not.toMatch(/never logged or stored/i);
    expect(claims).not.toMatch(/NEVER written to localStorage/);
  });
  it('the exception for saved profiles is disclosed in PRIVACY.md', () => {
    expect(read('PRIVACY.md')).toMatch(/Save current key[\s\S]*unencrypted/);
  });
});

describe('repo hygiene and cache version', () => {
  it('no stray patch files at the repo root', () => {
    expect(existsSync('audit-followups.patch')).toBe(false);
    expect(existsSync('chat-with-it-all-in-one.patch')).toBe(false);
  });
  it('service worker cache was bumped after the CSS/JS changes', () => {
    const n = Number(read('sw.js').match(/chatwithit-v(\d+)/)[1]);
    expect(n).toBeGreaterThanOrEqual(25);
  });
});
