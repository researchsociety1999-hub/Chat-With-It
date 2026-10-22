import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../js/app.js';
import { UI } from '../js/ui.js';
import { API, CURATED_FREE } from '../js/api.js';
import { AppState } from '../js/state.js';

const [A, B] = CURATED_FREE.openrouter.map(m => m.id);
const okResponse = { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };

function fail(code, status, raw, msg = 'x') {
  return Object.assign(new Error(msg), { code, status, raw });
}

describe('failed send: inline error, Retry and ask-first model suggestion', () => {
  let select;
  beforeEach(() => {
    document.body.innerHTML = '<div id="chatBody"></div><textarea id="userInput"></textarea><select id="modelSelect"></select><div id="modelMeta"></div><div id="chatAnnouncer"></div>';
    select = document.getElementById('modelSelect');
    select.innerHTML = `<option value="${A}">A</option><option value="${B}">B</option>`;
    window.DOMPurify = {};
    App._sending = false; App._reqId = 0; App._failedSend = false;
    AppState.chatHistory = [];
    AppState.currentProvider = 'openrouter';
    AppState.selectedModel = B;
    AppState.allModels = [{ id: A, name: 'Model A', ctx: 8192 }, { id: B, name: 'Model B', ctx: 8192 }];
    vi.spyOn(AppState, 'isAuthenticatedFor').mockReturnValue(true);
    vi.spyOn(AppState, 'canMakeRequest').mockReturnValue({ allowed: true });
    vi.spyOn(AppState, 'recordRequest').mockImplementation(() => {});
    for (const k of Object.keys(UI)) {
      if (typeof UI[k] === 'function' && !['el', 'showSendError', 'removeSendError', 'removeRetryButton'].includes(k)) {
        vi.spyOn(UI, k).mockImplementation(() => {});
      }
    }
    vi.spyOn(App, '_renderAttachments').mockImplementation(() => {});
    vi.spyOn(App, 'refreshModels').mockResolvedValue(true);
    vi.spyOn(API, 'createAbortController').mockImplementation(() => {});
    App.setupModelListeners();
  });

  const send = async (text) => { document.getElementById('userInput').value = text; await App.sendMessage(); };
  const buttons = () => [...document.querySelectorAll('#sendError button')].map(b => b.textContent);
  const users = () => AppState.chatHistory.filter(m => m.role === 'user');

  it('a privacy/data-policy block shows an inline error with Retry only: no switch, no list refresh', async () => {
    vi.spyOn(API, 'sendMessageStream').mockRejectedValue(
      fail('MODEL_UNAVAILABLE', 404, 'No endpoints found matching your data policy', 'OpenRouter blocked this free model because of your OpenRouter privacy settings.'));
    await send('hello');
    expect(document.getElementById('sendError')).not.toBeNull();
    expect(document.querySelector('.send-error-text').textContent).toMatch(/privacy settings/i);
    expect(buttons()).toEqual(['↻ Retry']);
    expect(App.refreshModels).not.toHaveBeenCalled();
    expect(AppState.selectedModel).toBe(B);
    expect(API.sendMessageStream).toHaveBeenCalledTimes(1);
  });

  it('a genuinely unavailable model suggests a free model but only switches when clicked', async () => {
    const stream = vi.spyOn(API, 'sendMessageStream')
      .mockRejectedValueOnce(fail('MODEL_MISSING', 404, 'No endpoints found for this model'))
      .mockResolvedValueOnce(okResponse);
    await send('hello');
    expect(stream).toHaveBeenCalledTimes(1);               // no silent retry on another model
    expect(AppState.selectedModel).toBe(B);                // nothing switched yet
    expect(buttons()).toEqual([`Use Model A`, '↻ Retry']);

    document.querySelector('#sendError button').click();   // the explicit "Use Model A"
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(AppState.selectedModel).toBe(A);
    expect(stream.mock.calls[1][1]).toBe(A);               // resent on the chosen model
    expect(users()).toHaveLength(1);                       // the message was not duplicated
    const sentRoles = stream.mock.calls[1][0].map(m => m.role);
    expect(sentRoles.filter(r => r === 'user')).toHaveLength(1);
  });

  it('Retry resends the same message once and clears the error', async () => {
    const stream = vi.spyOn(API, 'sendMessageStream')
      .mockRejectedValueOnce(fail('API_ERROR', 500, 'boom', 'Request failed (500) — please try again.'))
      .mockResolvedValueOnce(okResponse);
    await send('hello');
    expect(buttons()).toEqual(['↻ Retry']);
    document.querySelector('#sendError button').click();
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(users()).toHaveLength(1);
    expect(document.getElementById('sendError')).toBeNull();
  });

  it('a non-free model is never suggested', async () => {
    AppState.allModels = [{ id: B, name: 'Model B' }];      // replacement (A) is not in the free list
    vi.spyOn(API, 'sendMessageStream').mockRejectedValue(fail('MODEL_MISSING', 404, 'No endpoints found for this model'));
    await send('hello');
    expect(buttons()).toEqual(['↻ Retry']);
  });

  it('Hugging Face goes straight to API.sendMessageStream, ungated', async () => {
    AppState.currentProvider = 'huggingface';
    AppState.selectedModel = 'org/hf-model';
    AppState.allModels = [{ id: 'org/hf-model', name: 'HF' }];
    const stream = vi.spyOn(API, 'sendMessageStream').mockResolvedValue(okResponse);
    await send('hello');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls[0][1]).toBe('org/hf-model');
    expect(document.getElementById('sendError')).toBeNull();
  });
});

import { Utils } from '../js/utils.js';
describe('Utils.retryWithBackoff honors shouldRetry', () => {
  it('does not retry an error the predicate rejects (structured API errors)', async () => {
    const fn = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'AUTH' }); });
    await expect(Utils.retryWithBackoff(fn, 3, 1, (e) => !e.code)).rejects.toMatchObject({ code: 'AUTH' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('still retries transient errors with no code, and keeps the old default of always retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce('ok');
    await expect(Utils.retryWithBackoff(fn, 2, 1, (e) => !e.code)).resolves.toBe('ok');
    const g = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    await expect(Utils.retryWithBackoff(g, 2, 1)).resolves.toBe('ok');
  });
});
