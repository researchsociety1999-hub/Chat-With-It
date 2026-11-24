import { describe, expect, it, vi } from 'vitest';
import {
  searchGgufRepos,
  listRepoGgufFiles,
  parseNextCursor,
  isPublicRepo,
  fitLabel,
  formatBytes,
  BIG_MODEL_BYTES,
} from '../js/providers/hf-gguf.mjs';

const jsonResponse = (body, { status = 200, link = null } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: { get: (name) => (String(name).toLowerCase() === 'link' ? link : null) },
});

describe('searchGgufRepos', () => {
  it('asks the Hub for GGUF repos sorted by downloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await searchGgufRepos('qwen', { fetchImpl });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('https://huggingface.co/api/models');
    expect(url).toContain('filter=gguf');
    expect(url).toContain('search=qwen');
    expect(url).toContain('sort=downloads');
    expect(url).toContain('direction=-1');
  });

  it('keeps only public, ungated repositories', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([
      { id: 'org/open-model', downloads: 10, likes: 2, gated: false },
      { id: 'org/gated-auto', downloads: 99, gated: 'auto' },
      { id: 'org/gated-manual', downloads: 99, gated: 'manual' },
      { id: 'org/private-model', downloads: 99, private: true },
      { id: 'org/no-flags', downloads: 5 },
      { id: 'not-a-repo-id', downloads: 5 },
    ]));
    const { repos } = await searchGgufRepos('', { fetchImpl });
    expect(repos.map((r) => r.id)).toEqual(['org/open-model', 'org/no-flags']);
    expect(repos[0]).toMatchObject({ downloads: 10, likes: 2 });
  });

  it('returns the next-page cursor from the Link header', async () => {
    const link = '<https://huggingface.co/api/models?filter=gguf&cursor=abc123>; rel="next"';
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], { link }));
    const { next } = await searchGgufRepos('x', { fetchImpl });
    expect(next).toBe('abc123');
    expect(parseNextCursor(null)).toBeNull();
    expect(parseNextCursor('<https://x.test/?a=1>; rel="prev"')).toBeNull();
  });

  it('maps rate limits, HTTP errors and network failures to codes', async () => {
    await expect(searchGgufRepos('', { fetchImpl: vi.fn().mockResolvedValue(jsonResponse([], { status: 429 })) })).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    await expect(searchGgufRepos('', { fetchImpl: vi.fn().mockResolvedValue(jsonResponse([], { status: 500 })) })).rejects.toMatchObject({ code: 'HTTP_500' });
    await expect(searchGgufRepos('', { fetchImpl: vi.fn().mockRejectedValue(new TypeError('failed to fetch')) })).rejects.toMatchObject({ code: 'NETWORK' });
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    await expect(searchGgufRepos('', { fetchImpl: vi.fn().mockRejectedValue(abort) })).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('isPublicRepo', () => {
  it('treats missing flags as public and gated or private as not', () => {
    expect(isPublicRepo({ id: 'a/b' })).toBe(true);
    expect(isPublicRepo({ id: 'a/b', gated: false })).toBe(true);
    expect(isPublicRepo({ id: 'a/b', gated: 'auto' })).toBe(false);
    expect(isPublicRepo({ id: 'a/b', private: true })).toBe(false);
    expect(isPublicRepo(null)).toBe(false);
  });
});

describe('listRepoGgufFiles', () => {
  const tree = [
    { type: 'file', path: 'README.md', size: 10 },
    { type: 'directory', path: 'sub' },
    { type: 'file', path: 'model-q8_0.gguf', size: 40 },
    { type: 'file', path: 'big-Q4_K_M-00001-of-00002.gguf', size: 10, lfs: { size: 100 } },
    { type: 'file', path: 'big-Q4_K_M-00002-of-00002.gguf', size: 10, lfs: { size: 50 } },
    { type: 'file', path: 'orphan-00002-of-00003.gguf', size: 5 },
    { type: 'file', path: 'mmproj-F16.gguf', size: 20 },
  ];

  it('lists gguf files smallest first, collapsing split models', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(tree));
    const files = await listRepoGgufFiles('org/repo', { fetchImpl });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/models/org/repo/tree/main');
    expect(files.map((f) => f.path)).toEqual(['mmproj-F16.gguf', 'model-q8_0.gguf', 'big-Q4_K_M-00001-of-00002.gguf']);
    const split = files.find((f) => f.shards === 2);
    expect(split).toMatchObject({ sizeBytes: 150, quant: 'Q4_K_M' });
  });

  it('reads the quantization and flags vision projectors without hiding them', async () => {
    const files = await listRepoGgufFiles('org/repo', { fetchImpl: vi.fn().mockResolvedValue(jsonResponse(tree)) });
    expect(files.find((f) => f.name === 'model-q8_0.gguf').quant).toBe('Q8_0');
    expect(files.find((f) => f.name === 'mmproj-F16.gguf')).toMatchObject({ projector: true, quant: 'F16' });
  });

  it('rejects an invalid repository name before any request', async () => {
    const fetchImpl = vi.fn();
    await expect(listRepoGgufFiles('../../etc', { fetchImpl })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fitLabel and formatBytes', () => {
  it('labels size for information only', () => {
    expect(fitLabel(0)).toBe('unknown');
    expect(fitLabel(BIG_MODEL_BYTES + 1)).toBe('large');
    expect(fitLabel(2 * 1024 ** 3, { deviceMemoryGb: 2 })).toBe('tight');
    expect(fitLabel(1 * 1024 ** 3, { deviceMemoryGb: 8 })).toBe('ok');
    expect(fitLabel(1 * 1024 ** 3)).toBe('ok');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(formatBytes(300 * 1024 ** 2)).toBe('300 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
