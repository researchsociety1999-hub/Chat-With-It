import { describe, it, expect, vi } from 'vitest';
import {
  ErrorKind,
  isFreeModel,
  isDeprecatedModel,
  buildIndex,
  classifyDispatchError,
  createAvailabilityGate,
  dispatchWithGate,
} from './availability.mjs';

const model = (id, prompt, completion, extra = {}) => ({ id, pricing: { prompt, completion }, ...extra });

const catalogFetch = (data, ok = true, status = 200) =>
  vi.fn(async () => ({
    ok,
    status,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ error: { message: 'boom' } }),
  }));

describe('isFreeModel', () => {
  it('accepts :free ids and zero pricing', () => {
    expect(isFreeModel(model('a/b:free', '1', '1'))).toBe(true);
    expect(isFreeModel(model('a/b', '0', '0'))).toBe(true);
    expect(isFreeModel(model('a/b', 0, 0))).toBe(true);
  });
  it('rejects paid, missing and null pricing', () => {
    expect(isFreeModel(model('a/b', '0.000001', '0'))).toBe(false);
    expect(isFreeModel({ id: 'a/b' })).toBe(false);
    expect(isFreeModel(model('a/b', null, null))).toBe(false);
    expect(isFreeModel(model('a/b', '', ''))).toBe(false);
    expect(isFreeModel(model('a/b', undefined, '0'))).toBe(false);
  });
});

describe('deprecation', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  it('flags past expiration dates only', () => {
    expect(isDeprecatedModel(model('a/b:free', '0', '0', { expiration_date: '2026-10-01' }), now)).toBe(true);
    expect(isDeprecatedModel(model('a/b:free', '0', '0', { expiration_date: '2026-12-01' }), now)).toBe(false);
  });
  it('buildIndex separates deprecated from free and drops embeddings', () => {
    const idx = buildIndex([
      model('a/live:free', '0', '0'),
      model('a/old:free', '0', '0', { expiration_date: '2026-01-01' }),
      model('a/embed-x:free', '0', '0'),
      model('a/paid', '1', '1'),
    ], now);
    expect([...idx.free.keys()]).toEqual(['a/live:free']);
    expect(idx.deprecated.has('a/old:free')).toBe(true);
  });
});

describe('classifyDispatchError', () => {
  const body = (message) => JSON.stringify({ error: { message } });
  it('detects no-endpoint 404s', () => {
    expect(classifyDispatchError(404, body('No endpoints found for x/y:free')).kind).toBe(ErrorKind.NO_ENDPOINTS);
  });
  it('prefers policy block over no-endpoints', () => {
    const msg = 'No endpoints available matching your guardrail restrictions and data policy';
    expect(classifyDispatchError(404, body(msg)).kind).toBe(ErrorKind.POLICY_BLOCKED);
  });
  it('maps the other cases', () => {
    expect(classifyDispatchError(401, body('Invalid API key')).kind).toBe(ErrorKind.AUTH);
    expect(classifyDispatchError(429, body('Provider returned error: overloaded')).kind).toBe(ErrorKind.UPSTREAM_RATE_LIMIT);
    expect(classifyDispatchError(429, body('Rate limit exceeded')).kind).toBe(ErrorKind.RATE_LIMIT);
    expect(classifyDispatchError(404, body('This model is unavailable for free')).kind).toBe(ErrorKind.NOT_FREE);
    expect(classifyDispatchError(404, body('Not Found')).kind).toBe(ErrorKind.MODEL_MISSING);
    expect(classifyDispatchError(500, 'oops').kind).toBe(ErrorKind.SERVER);
  });
});

describe('gate', () => {
  const curated = [{ id: 'a/one:free' }, { id: 'a/two:free' }];

  it('allows curated models while no live catalog exists (offline)', async () => {
    const gate = createAvailabilityGate({ curated, fetchImpl: vi.fn(async () => { throw new Error('offline'); }) });
    const r = await gate.ensureFresh();
    expect(r.ok).toBe(false);
    expect(gate.check('a/one:free')).toMatchObject({ ok: true, unverified: true });
    expect(gate.check('x/unknown:free').ok).toBe(false);
  });

  it('blocks models missing from the live free list and suggests a replacement', async () => {
    const gate = createAvailabilityGate({
      curated,
      fetchImpl: catalogFetch([model('a/two:free', '0', '0'), model('a/three:free', '0', '0')]),
    });
    await gate.ensureFresh();
    expect(gate.check('a/one:free')).toMatchObject({ ok: false, reason: 'NOT_IN_FREE_LIST', replacement: 'a/two:free' });
    expect(gate.check('a/two:free').ok).toBe(true);
  });

  it('ignores an empty live catalog instead of trusting it', async () => {
    const gate = createAvailabilityGate({ curated, fetchImpl: catalogFetch([model('a/paid', '1', '1')]) });
    const r = await gate.ensureFresh();
    expect(r.ok).toBe(false);
    expect(gate.hasLiveCatalog).toBe(false);
  });

  it('negative-caches failed models until the window passes', async () => {
    let t = 0;
    const gate = createAvailabilityGate({ curated, now: () => t, fetchImpl: catalogFetch([model('a/one:free', '0', '0'), model('a/two:free', '0', '0')]) });
    await gate.ensureFresh();
    gate.markUnavailable('a/one:free', 1000);
    expect(gate.check('a/one:free').reason).toBe('RECENTLY_FAILED');
    t = 2000;
    expect(gate.check('a/one:free').ok).toBe(true);
  });
});

describe('dispatchWithGate', () => {
  const live = [model('a/one:free', '0', '0'), model('a/two:free', '0', '0'), model('a/three:free', '0', '0')];
  const mk = () => createAvailabilityGate({ curated: [{ id: 'a/one:free' }, { id: 'a/two:free' }], fetchImpl: catalogFetch(live) });
  const noEndpoints = () => Object.assign(new Error('x'), { kind: ErrorKind.NO_ENDPOINTS });

  it('falls back on a no-endpoints error and reports the switch', async () => {
    const onFallback = vi.fn();
    const send = vi.fn(async (id) => { if (id === 'a/one:free') throw noEndpoints(); return 'ok'; });
    const out = await dispatchWithGate({ gate: mk(), modelId: 'a/one:free', send, onFallback });
    expect(out).toMatchObject({ modelId: 'a/two:free', result: 'ok', fellBackFrom: ['a/one:free'] });
    expect(onFallback).toHaveBeenCalledWith({ from: 'a/one:free', to: 'a/two:free', reason: ErrorKind.NO_ENDPOINTS });
  });

  it('does not fall back on auth or policy errors', async () => {
    for (const kind of [ErrorKind.AUTH, ErrorKind.POLICY_BLOCKED, ErrorKind.RATE_LIMIT]) {
      const send = vi.fn(async () => { throw Object.assign(new Error('x'), { kind }); });
      await expect(dispatchWithGate({ gate: mk(), modelId: 'a/one:free', send })).rejects.toMatchObject({ kind });
      expect(send).toHaveBeenCalledTimes(1);
    }
  });

  it('does not fall back after output has started streaming', async () => {
    const send = vi.fn(async (_id, ctx) => { ctx.markOutput(); throw noEndpoints(); });
    await expect(dispatchWithGate({ gate: mk(), modelId: 'a/one:free', send })).rejects.toMatchObject({ kind: ErrorKind.NO_ENDPOINTS });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('respects autoFallback:false and maxFallbacks', async () => {
    const send = vi.fn(async () => { throw noEndpoints(); });
    await expect(dispatchWithGate({ gate: mk(), modelId: 'a/one:free', send, autoFallback: false })).rejects.toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    const send2 = vi.fn(async () => { throw noEndpoints(); });
    await expect(dispatchWithGate({ gate: mk(), modelId: 'a/one:free', send: send2, maxFallbacks: 1 })).rejects.toBeTruthy();
    expect(send2).toHaveBeenCalledTimes(2);
  });

  it('pre-flight swaps a model that is not in the free list before sending', async () => {
    const send = vi.fn(async () => 'ok');
    const out = await dispatchWithGate({ gate: mk(), modelId: 'z/gone:free', send });
    expect(out.fellBackFrom).toEqual(['z/gone:free']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never swaps an aborted request', async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error('x'), { kind: ErrorKind.ABORTED }); });
    await expect(dispatchWithGate({ gate: mk(), modelId: 'a/one:free', send })).rejects.toMatchObject({ kind: ErrorKind.ABORTED });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
