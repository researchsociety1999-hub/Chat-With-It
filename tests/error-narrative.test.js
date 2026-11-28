import { describe, expect, it } from 'vitest';
import { describeSendError } from '../js/providers/error-narrative.mjs';

const err = (props, message = 'x') => Object.assign(new Error(message), props);
const ids = (narrative) => narrative.actions.map((a) => a.id);

describe('describeSendError', () => {
  it('explains a timeout and offers Retry and Switch to Local WASM', () => {
    const n = describeSendError(err({ code: 'TIMEOUT' }), { provider: 'openrouter' });
    expect(n.kind).toBe('timeout');
    expect(n.message).toBe("The AI provider didn't respond in time.");
    expect(ids(n)).toEqual(['retry', 'switch-local']);
    expect(n.actions.map((a) => a.label)).toEqual(['Retry', 'Switch to Local WASM']);
  });

  it('explains a dropped connection the same way', () => {
    const n = describeSendError(err({ kind: 'NETWORK' }), { provider: 'huggingface' });
    expect(n.kind).toBe('network');
    expect(ids(n)).toEqual(['retry', 'switch-local']);
  });

  it('does not offer to switch to Local when the failing provider is already Local', () => {
    expect(ids(describeSendError(err({ code: 'TIMEOUT' }), { provider: 'local' }))).toEqual(['retry']);
  });

  it('explains an out-of-memory failure of the on-device engine and offers Manage Models', () => {
    for (const e of [
      new RangeError('WebAssembly.Memory(): could not allocate memory'),
      new Error('Out of memory'),
      new Error('memory access out of bounds'),
      new Error('Array buffer allocation failed'),
    ]) {
      const n = describeSendError(e, { provider: 'local' });
      expect(n.kind).toBe('memory');
      expect(n.message).toMatch(/Browser memory limit reached/);
      expect(n.message).toMatch(/smaller quantization/);
      expect(ids(n)).toEqual(['manage-models']);
    }
  });

  it('does not call a remote provider\'s out-of-memory message a browser problem', () => {
    expect(describeSendError(new Error('out of memory'), { provider: 'openrouter' })).toBeNull();
  });

  it('explains a missing or invalid key and offers Open Key Settings', () => {
    const n = describeSendError(err({ code: 'AUTH' }), { provider: 'openrouter' });
    expect(n.kind).toBe('auth');
    expect(n.message).toBe('No valid API key provided for this provider.');
    expect(ids(n)).toEqual(['open-key-settings']);
  });

  it('stays out of the way for everything else', () => {
    expect(describeSendError(null, { provider: 'openrouter' })).toBeNull();
    expect(describeSendError(err({ code: 'ABORTED' }), { provider: 'openrouter' })).toBeNull();
    for (const code of ['RATE_LIMIT', 'UPSTREAM_RATE_LIMIT', 'MODEL_MISSING', 'MODEL_NOT_FREE', 'MODEL_UNAVAILABLE', 'API_ERROR']) {
      expect(describeSendError(err({ code }), { provider: 'openrouter' })).toBeNull();
    }
    expect(describeSendError(new Error('something odd'), { provider: 'local' })).toBeNull();
  });
});
