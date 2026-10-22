import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../js/app.js';
import { UI } from '../js/ui.js';
import { API } from '../js/api.js';
import { AppState } from '../js/state.js';

describe('send-time free-model guard', () => {
  beforeEach(() => {
    document.body.innerHTML = '<textarea id="userInput">hi</textarea>'; window.DOMPurify = {};
    App._sending = false;
    vi.spyOn(UI, 'toast').mockImplementation(() => {});
    vi.spyOn(AppState, 'isAuthenticatedFor').mockReturnValue(true);
  });
  it('refuses a model that is not in the free list and sends nothing', async () => {
    AppState.selectedModel = 'paid/model';
    AppState.allModels = [{ id: 'x/free:free' }];
    const send = vi.spyOn(API, 'sendMessageStream');
    await App.sendMessage();
    expect(send).not.toHaveBeenCalled();
    expect(UI.toast).toHaveBeenCalledWith(expect.stringMatching(/free list/i), 'warning');
  });
});
