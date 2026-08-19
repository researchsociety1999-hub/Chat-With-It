import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
const serviceWorker = readFileSync(resolve(process.cwd(), 'sw.js'), 'utf8');

describe('deployment configuration', () => {
  it('keeps the repository root as the static output', () => {
    expect(vercel).not.toHaveProperty('outputDirectory');
    expect(vercel.buildCommand).toBe('npm run build');
  });

  it('retains the provider endpoints in the CSP', () => {
    const csp = vercel.headers
      .flatMap(entry => entry.headers)
      .find(header => header.key === 'Content-Security-Policy')?.value;

    expect(csp).toContain('connect-src');
    for (const endpoint of [
      'https://openrouter.ai',
      'https://huggingface.co',
      'https://api-inference.huggingface.co',
      'https://router.huggingface.co',
      'https://vitals.vercel-insights.com',
    ]) {
      expect(csp).toContain(endpoint);
    }
  });

  it('bumps the service-worker cache version for the updated bundle', () => {
    expect(serviceWorker).toMatch(/const CACHE_NAME = 'chatwithit-v13'/);
  });
});
