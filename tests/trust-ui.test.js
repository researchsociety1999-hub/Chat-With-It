import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTrustUi, noteSendError, clearSendError, __resetTrustForTests } from '../js/trust-ui.js';
import { AppState } from '../js/state.js';

const err = (props, message = 'x') => Object.assign(new Error(message), props);
const tag = () => document.getElementById('dataSourceTag');
const cards = () => document.querySelectorAll('.error-card');
const button = (action) => document.querySelector(`.error-card [data-action="${action}"]`);
const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
  document.body.innerHTML = `
    <div id="sidebar"></div>
    <div id="chatBody"></div>
    <span id="dataSourceTag"></span>
    <input id="apiKeyInput">
    <div id="localPanel"><div id="localModelsPanel"><button id="firstModelBtn" type="button">Load</button></div></div>
    <button class="ptab" data-provider="openrouter"></button>
    <button class="ptab" data-provider="huggingface"></button>
    <button class="ptab" data-provider="local"></button>`;
  const ui = {
    toast: vi.fn(),
    showSendError: vi.fn(),
    showTyping: vi.fn(),
    setAuthState: vi.fn(),
    updateWelcomeHint: vi.fn(),
    updateModelLabel: vi.fn(),
    toggleSidebar: vi.fn(),
    _isMobile: vi.fn(() => false),
    _scrollToBottom: vi.fn(),
  };
  const base = { ...ui };
  installTrustUi(ui, document);
  return { ui, base };
}

beforeEach(() => {
  __resetTrustForTests();
  AppState.currentProvider = 'openrouter';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('data source tag', () => {
  it('shows the source of the selected provider when the app refreshes its labels', () => {
    const { ui } = setup();
    expect(tag().textContent).toBe('OpenRouter · Remote API');
    for (const [provider, text, kind] of [
      ['huggingface', 'Hugging Face · Remote API', 'remote'],
      ['local', 'Local WASM · On-Device', 'local'],
      ['openrouter', 'OpenRouter · Remote API', 'remote'],
    ]) {
      AppState.currentProvider = provider;
      ui.updateWelcomeHint();
      expect(tag().textContent).toBe(text);
      expect(tag().dataset.kind).toBe(kind);
      expect(tag().textContent).not.toMatch(/[\[\]]/);
      expect(tag().title).not.toBe('');
    }
  });

  it('follows a provider tab click', () => {
    setup();
    AppState.currentProvider = 'local';
    document.querySelector('.ptab[data-provider="local"]').click();
    expect(tag().textContent).toBe('Local WASM · On-Device');
  });

  it('follows the auth state and the model label (model selection)', () => {
    const { ui } = setup();
    AppState.currentProvider = 'huggingface';
    ui.setAuthState(true, 'ok');
    expect(tag().textContent).toBe('Hugging Face · Remote API');
    AppState.currentProvider = 'local';
    ui.updateModelLabel('model');
    expect(tag().textContent).toBe('Local WASM · On-Device');
  });

  it('does nothing when the tag is missing', () => {
    const { ui } = setup();
    tag().remove();
    expect(() => ui.updateWelcomeHint()).not.toThrow();
  });

  it('installs once per UI object', () => {
    const { ui } = setup();
    expect(installTrustUi(ui, document)).toBe(false);
  });
});

describe('narrative error cards', () => {
  it('shows a timeout card with Retry and Switch to Local WASM instead of the old error panel', () => {
    const { ui, base } = setup();
    const onRetry = vi.fn();
    noteSendError(err({ code: 'TIMEOUT' }), 'openrouter');
    ui.showSendError({ message: 'raw', onRetry });
    expect(cards()).toHaveLength(1);
    expect(cards()[0].dataset.kind).toBe('timeout');
    expect(cards()[0].textContent).toContain("The AI provider didn't respond in time.");
    expect(button('retry')).not.toBeNull();
    expect(button('switch-local')).not.toBeNull();
    expect(base.showSendError).not.toHaveBeenCalled();
    button('retry').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(cards()).toHaveLength(0);
  });

  it('builds one card (with the app retry) when a toast and the error panel report the same failure', () => {
    const { ui, base } = setup();
    const onRetry = vi.fn();
    noteSendError(err({ kind: 'NETWORK' }), 'huggingface');
    ui.toast('Request failed', 'error');
    ui.showSendError({ message: 'raw', onRetry });
    expect(cards()).toHaveLength(1);
    expect(cards()[0].dataset.kind).toBe('network');
    expect(base.toast).not.toHaveBeenCalled();
    expect(base.showSendError).not.toHaveBeenCalled();
    button('retry').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('switches to the Local tab from the card', () => {
    const { ui } = setup();
    const localTab = document.querySelector('.ptab[data-provider="local"]');
    const clicked = vi.fn();
    localTab.addEventListener('click', clicked);
    noteSendError(err({ code: 'TIMEOUT' }), 'openrouter');
    ui.showSendError({});
    button('switch-local').click();
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(cards()).toHaveLength(0);
  });

  it('shows an out-of-memory card for the local engine and Manage Models opens the Local models panel', async () => {
    const { ui } = setup();
    const localTab = document.querySelector('.ptab[data-provider="local"]');
    const clicked = vi.fn();
    localTab.addEventListener('click', clicked);
    noteSendError(new RangeError('WebAssembly.Memory(): could not allocate memory'), 'local');
    ui.showSendError({});
    expect(cards()[0].dataset.kind).toBe('memory');
    expect(document.querySelectorAll('.error-card button')).toHaveLength(1);
    AppState.currentProvider = 'openrouter';
    button('manage-models').click();
    expect(clicked).toHaveBeenCalledTimes(1);
    await wait();
    expect(document.activeElement.id).toBe('firstModelBtn');
  });

  it('turns the "Please authenticate first" warning into a key card and Open Key Settings focuses the key field', async () => {
    const { ui, base } = setup();
    ui.toast('Please authenticate first', 'warning');
    expect(base.toast).not.toHaveBeenCalled();
    expect(cards()[0].dataset.kind).toBe('auth');
    button('open-key-settings').click();
    await wait();
    expect(document.activeElement.id).toBe('apiKeyInput');
  });

  it('removes the key card once the user is authenticated', () => {
    const { ui } = setup();
    ui.toast('Please authenticate first', 'warning');
    expect(cards()).toHaveLength(1);
    ui.setAuthState(true, 'OpenRouter authenticated');
    expect(cards()).toHaveLength(0);
  });

  it('opens the mobile drawer when the action needs the sidebar', () => {
    const { ui } = setup();
    ui._isMobile.mockReturnValue(true);
    noteSendError(err({ code: 'AUTH' }), 'openrouter');
    ui.showSendError({});
    button('open-key-settings').click();
    expect(ui.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('clears the card and the recorded failure when the next send starts', () => {
    const { ui, base } = setup();
    noteSendError(err({ code: 'TIMEOUT' }), 'openrouter');
    ui.showSendError({});
    expect(cards()).toHaveLength(1);
    ui.showTyping();
    expect(cards()).toHaveLength(0);
    expect(base.showTyping).toHaveBeenCalledTimes(1);
    ui.toast('boom', 'error');
    expect(base.toast).toHaveBeenCalledWith('boom', 'error');
    expect(cards()).toHaveLength(0);
  });

  it('leaves other failures to the existing UI', () => {
    const { ui, base } = setup();
    noteSendError(err({ code: 'RATE_LIMIT' }), 'openrouter');
    ui.toast('slow down', 'warning');
    ui.showSendError({ message: 'slow down' });
    expect(cards()).toHaveLength(0);
    expect(base.toast).toHaveBeenCalledWith('slow down', 'warning');
    expect(base.showSendError).toHaveBeenCalledTimes(1);
  });

  it('never shows a card for a user Stop', () => {
    const { ui, base } = setup();
    noteSendError(err({ code: 'ABORTED' }), 'openrouter');
    ui.toast('Generation stopped.', 'info');
    ui.toast('later', 'error');
    expect(cards()).toHaveLength(0);
    expect(base.toast).toHaveBeenCalledTimes(2);
  });

  it('ignores a failure that a later success cleared', () => {
    const { ui, base } = setup();
    noteSendError(err({ code: 'TIMEOUT' }), 'openrouter');
    clearSendError();
    ui.toast('Model load failed', 'error');
    expect(cards()).toHaveLength(0);
    expect(base.toast).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale failure so an unrelated toast is not turned into a card', () => {
    const { ui, base } = setup();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    noteSendError(err({ code: 'TIMEOUT' }), 'openrouter');
    now.mockReturnValue(1000 + 6000);
    ui.toast('Model load failed', 'error');
    expect(cards()).toHaveLength(0);
    expect(base.toast).toHaveBeenCalledTimes(1);
  });
});
