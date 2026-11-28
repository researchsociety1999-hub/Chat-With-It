import { describe, expect, it } from 'vitest';
import { dataSourceInfo, DATA_SOURCES } from '../js/providers/data-source.mjs';

describe('dataSourceInfo', () => {
  it('labels each provider and says whether messages leave the device', () => {
    expect(dataSourceInfo('openrouter')).toMatchObject({ label: 'OpenRouter · Remote API', kind: 'remote' });
    expect(dataSourceInfo('huggingface')).toMatchObject({ label: 'Hugging Face · Remote API', kind: 'remote' });
    expect(dataSourceInfo('local')).toMatchObject({ label: 'Local WASM · On-Device', kind: 'local' });
  });

  it('renders as a pill without literal brackets', () => {
    for (const info of Object.values(DATA_SOURCES)) expect(info.label).not.toMatch(/[\[\]]/);
  });

  it('explains in the tooltip where messages go', () => {
    expect(dataSourceInfo('openrouter').title).toMatch(/OpenRouter over HTTPS/);
    expect(dataSourceInfo('huggingface').title).toMatch(/Hugging Face over HTTPS/);
    expect(dataSourceInfo('local').title).toMatch(/not sent to a provider/);
  });

  it('falls back to OpenRouter for an unknown provider id', () => {
    expect(dataSourceInfo('nope').label).toBe('OpenRouter · Remote API');
    expect(dataSourceInfo(undefined).kind).toBe('remote');
  });
});
