import { describe, expect, it } from 'vitest';
import { API } from '../js/api.js';

describe('API.estimateCost (honest free-model pricing)', () => {
  it('labels :free models without inventing dollars', () => {
    expect(API.estimateCost({ id: 'x/y:free' })).toEqual({
      available: false,
      label: 'Free (provider may still rate-limit)',
    });
  });

  it('labels zero pricing as free', () => {
    expect(API.estimateCost({ id: 'x/y', pricing: { prompt: 0, completion: 0 } }).label)
      .toMatch(/free/i);
  });

  it('returns unavailable when pricing is missing', () => {
    expect(API.estimateCost({ id: 'x/y' })).toEqual({
      available: false,
      label: 'Cost unavailable',
    });
  });

  it('returns numeric rates only when paid pricing is present', () => {
    expect(API.estimateCost({ id: 'x/y', pricing: { prompt: 0.001, completion: 0.002 } }))
      .toEqual({ available: true, prompt: 0.001, completion: 0.002 });
  });
});
