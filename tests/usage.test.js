import { describe, expect, it } from 'vitest';
import { API } from '../js/api.js';
import { UI } from '../js/ui.js';

describe('live usage reporting', () => {
  it('uses provider-reported prompt and completion usage', () => {
    expect(API.extractTokenUsage({
      usage: { prompt_tokens: 120, completion_tokens: 45 },
      usageEstimated: false,
    })).toEqual({ promptTokens: 120, completionTokens: 45, estimated: false });
  });

  it('marks completion usage as estimated when provider usage is absent', () => {
    expect(API.extractTokenUsage({ choices: [{ message: { content: 'a'.repeat(40) } }] }))
      .toEqual({ promptTokens: 0, completionTokens: 10, estimated: true });
  });

  it('describes streaming and completed usage in the Stats panel', () => {
    document.body.innerHTML = '<div id="stat-live"></div>';

    UI.updateLiveUsage({ completionTokens: 8, streaming: true });
    expect(document.querySelector('#stat-live').textContent)
      .toBe('Streaming · prompt pending · ~8 output tokens');

    UI.updateLiveUsage({ promptTokens: 120, completionTokens: 45, estimated: false });
    expect(document.querySelector('#stat-live').textContent)
      .toBe('Last turn · 120 prompt · 45 completion');
  });
});
