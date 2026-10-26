import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const docs = ['README.md', 'PRIVACY.md', 'SECURITY.md', 'CASE_STUDY.md'];

describe('security and privacy documents agree with the code', () => {
  it('saved Profiles really store tokens in localStorage', () => {
    expect(read('js/profiles.js')).toMatch(/localStorage\.setItem/);
  });
  for (const f of docs) {
    it(`${f} has no absolute "never in localStorage / memory only" key claim`, () => {
      const t = read(f);
      expect(t).not.toMatch(/never\W{0,4}written to\W{0,3}`?localStorage/i);
      expect(t).not.toMatch(/Keys in (browser )?memory only/i);
      expect(t).not.toMatch(/\|\s*API keys\s*\|\s*Memory only\s*\|/);
    });
  }
  for (const f of ['PRIVACY.md', 'SECURITY.md']) {
    it(`${f} discloses the saved-profile exception`, () => {
      expect(read(f)).toMatch(/Save current key[\s\S]*unencrypted/);
    });
  }
  it('CASE_STUDY.md mentions saved Profiles and does not call history optional', () => {
    const t = read('CASE_STUDY.md');
    expect(t).toMatch(/Profiles/);
    expect(t).not.toMatch(/Optional local (chat )?history/i);
  });
});
