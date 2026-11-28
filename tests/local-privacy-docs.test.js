import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const privacy = read('PRIVACY.md');
const readme = read('README.md');

describe('PRIVACY.md documents Local mode accurately', () => {
  it('says the model runs in the browser through wllama and WebAssembly', () => {
    expect(privacy).toMatch(/wllama/);
    expect(privacy).toMatch(/WebAssembly/);
    expect(privacy).toMatch(/not sent to OpenRouter, Hugging Face, or any ChatWithIt server/);
  });

  it('discloses that jsDelivr and Hugging Face see the visitor IP address', () => {
    expect(privacy).toMatch(/cdn\.jsdelivr\.net/);
    expect(privacy).toMatch(/jsDelivr/);
    expect(privacy).toMatch(/huggingface\.co/);
    expect(privacy).toMatch(/can see your IP address/);
  });

  it('says what is kept in IndexedDB and where model files live', () => {
    expect(privacy).toMatch(/IndexedDB \(`cwi-local-models`\)/);
    expect(privacy).toMatch(/holds no chat content and no keys/);
    expect(privacy).toMatch(/engine's browser cache/);
  });

  it('says Local chats are saved in localStorage', () => {
    expect(privacy).toMatch(/includes Local-mode chats/i);
    expect(privacy).toMatch(/`localStorage` \(`cwiChatHistory`\)/);
  });

  it('says provider calls go straight from the browser with no ChatWithIt server in between', () => {
    expect(privacy).toMatch(/without passing through any ChatWithIt server/);
  });

  it('still discloses that a saved profile key is stored unencrypted', () => {
    expect(privacy).toMatch(/Save current key[\s\S]*unencrypted/);
  });

  it('does not claim to be fully private or offline', () => {
    expect(privacy).not.toMatch(/100% private|fully offline|completely offline|nothing leaves your device/i);
  });
});

describe('README.md documents Local mode accurately', () => {
  it('describes the on-device engine, the model list and the external hosts', () => {
    expect(readme).toMatch(/### Local \(on-device\) mode/);
    expect(readme).toMatch(/wllama/);
    expect(readme).toMatch(/WebAssembly/);
    expect(readme).toMatch(/IndexedDB \(`cwi-local-models`\)/);
    expect(readme).toMatch(/cdn\.jsdelivr\.net/);
    expect(readme).toMatch(/huggingface\.co/);
    expect(readme).toMatch(/IP address/);
  });

  it('says Local chats are saved in localStorage', () => {
    expect(readme).toMatch(/Local chats are saved in `localStorage`/);
  });

  it('links to PRIVACY.md from the Local section', () => {
    expect(readme).toMatch(/Local \(on-device\) mode[\s\S]*?\[PRIVACY\.md\]\(\.\/PRIVACY\.md\)/);
  });
});

describe('blocked absolute claims stay out (see readiness-regressions.test.js)', () => {
  const claims = `${privacy}\n${readme}`;
  it('has none of the blanket storage claims', () => {
    expect(claims).not.toMatch(/never written to `?localStorage/i);
    expect(claims).not.toMatch(/Keys are never stored\./);
    expect(claims).not.toMatch(/never logged or stored/i);
    expect(claims).not.toMatch(/NEVER written to localStorage/);
  });
});
