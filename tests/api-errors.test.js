import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API } from '../js/api.js';
import { AppState } from '../js/state.js';

// A fetch that never answers until its signal aborts, like a stalled connection.
const stalledFetch = () => vi.fn((url, { signal }) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
}));

const messages = [{ role: 'user', content: 'hi' }];

describe('API error classification', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    AppState.currentProvider = 'openrouter';
    AppState.apiKey = 'sk-or-test-key';
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    AppState.apiKey = '';
    AppState.abortController = null;
  });

  it('reports a fired timeout as TIMEOUT, not as a user cancellation', async () => {
    globalThis.fetch = stalledFetch();
    const err = await API.fetchWithTimeout('https://example.test', {}, 20).catch((e) => e);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toMatch(/did not respond/);
  });

  it('keeps a user abort as an AbortError', async () => {
    globalThis.fetch = stalledFetch();
    const ctrl = new AbortController();
    const pending = API.fetchWithTimeout('https://example.test', { signal: ctrl.signal }, 1000).catch((e) => e);
    ctrl.abort();
    const err = await pending;
    expect(err.name).toBe('AbortError');
    expect(err.code).toBeUndefined();
  });

  it('sendMessageStream: 60 s without an answer is TIMEOUT', async () => {
    vi.useFakeTimers();
    globalThis.fetch = stalledFetch();
    const pending = API.sendMessageStream(messages, 'm', null).catch((e) => e);
    await vi.advanceTimersByTimeAsync(60001);
    expect((await pending).code).toBe('TIMEOUT');
  });

  it('sendMessageStream: Stop is still ABORTED', async () => {
    globalThis.fetch = stalledFetch();
    API.createAbortController();
    const pending = API.sendMessageStream(messages, 'm', null).catch((e) => e);
    API.cancelRequest();
    expect((await pending).code).toBe('ABORTED');
  });

  it('sendMessageStream: a network failure is tagged NETWORK and has no code (so it is still retried)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await API.sendMessageStream(messages, 'm', null).catch((e) => e);
    expect(err.kind).toBe('NETWORK');
    expect(err.code).toBeUndefined();
  });

  it('sendMessageStream: a connection dropped mid-stream is tagged NETWORK', async () => {
    const body = { getReader: () => ({ read: vi.fn().mockRejectedValue(new TypeError('network error')) }) };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body });
    const err = await API.sendMessageStream(messages, 'm', null).catch((e) => e);
    expect(err.kind).toBe('NETWORK');
    expect(err.code).toBeUndefined();
  });

  it('sendMessageStream: no key is AUTH and does not call fetch', async () => {
    AppState.apiKey = '';
    globalThis.fetch = vi.fn();
    const err = await API.sendMessageStream(messages, 'm', null).catch((e) => e);
    expect(err.code).toBe('AUTH');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sendMessageStream: HTTP 401 is AUTH', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"error":{"message":"Invalid API key"}}', { status: 401 }));
    const err = await API.sendMessageStream(messages, 'm', null).catch((e) => e);
    expect(err.code).toBe('AUTH');
  });
});
