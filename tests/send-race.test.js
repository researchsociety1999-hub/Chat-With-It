import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../js/app.js';
import { UI } from '../js/ui.js';
import { API } from '../js/api.js';
import { AppState } from '../js/state.js';

function deferred() { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }

describe('Stop then immediate Send', () => {
  beforeEach(() => {
    document.body.innerHTML = '<textarea id="userInput"></textarea><div id="chatAnnouncer"></div>';
    window.DOMPurify = {};
    App._sending = false; App._reqId = 0;
    AppState.selectedModel = 'm'; AppState.currentProvider = 'openrouter';
    vi.spyOn(AppState, 'isAuthenticatedFor').mockReturnValue(true);
    vi.spyOn(AppState, 'canMakeRequest').mockReturnValue({ allowed: true });
    vi.spyOn(AppState, 'recordRequest').mockImplementation(() => {});
    vi.spyOn(AppState, 'addMessage').mockImplementation(() => {});
    for (const k of ['removeRetryButton', 'showChat', 'appendMessage', 'setSendButtonState', 'showTyping', 'removeTyping', 'updateLiveUsage', 'hideUnsavedBanner', 'setChatBusy', 'updateCharCount', 'toast', 'removeStreamBubble']) {
      vi.spyOn(UI, k).mockImplementation(() => {});
    }
    vi.spyOn(App, '_renderAttachments').mockImplementation(() => {});
    vi.spyOn(API, 'createAbortController').mockImplementation(() => {});
  });

  it('old request cleanup does not clobber the new request state', async () => {
    const d1 = deferred(), d2 = deferred();
    const stream = vi.spyOn(API, 'sendMessageStream').mockReturnValueOnce(d1.p).mockReturnValueOnce(d2.p);
    const input = document.getElementById('userInput');

    input.value = 'first';
    const first = App.sendMessage();
    await Promise.resolve();
    expect(App._sending).toBe(true);

    // What the Stop handler does: clear the sending flag, then the user sends again.
    App._sending = false;
    input.value = 'second';
    const second = App.sendMessage();
    await Promise.resolve();
    expect(stream).toHaveBeenCalledTimes(2);
    expect(App._sending).toBe(true);

    UI.setChatBusy.mockClear();
    const err = Object.assign(new Error('aborted'), { code: 'ABORTED' });
    d1.reject(err);
    await first;
    expect(App._sending).toBe(true);
    expect(UI.setChatBusy).not.toHaveBeenCalledWith(false);

    d2.reject(err);
    await second;
    expect(App._sending).toBe(false);
  });
});
