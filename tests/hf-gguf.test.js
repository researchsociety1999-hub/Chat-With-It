import { describe, expect, it, vi } from 'vitest';
import {
  searchGgufRepos,
  listRepoGgufFiles,
  parseNextCursor,
  parseNextUrl,
  isPublicRepo,
  fitLabel,
  formatBytes,
  formatParams,
  isCoarsePointer,
  shouldConfirmClose,
  BIG_MODEL_BYTES,
  MAX_TREE_PAGES,
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

  it('requests the gguf metadata block and reads the parameter count', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([
      { id: 'org/with-meta', downloads: 1, likes: 1, gguf: { total: 7_615_616_512, architecture: 'qwen2' } },
      { id: 'org/no-meta', downloads: 1, likes: 1 },
    ]));
    const { repos } = await searchGgufRepos('', { fetchImpl });
    const url = decodeURIComponent(String(fetchImpl.mock.calls[0][0]));
    expect(url).toContain('expand[]=gguf');
    expect(repos.find((r) => r.id === 'org/with-meta').params).toBe(7_615_616_512);
    expect(repos.find((r) => r.id === 'org/no-meta').params).toBe(0);
  });

  it('repeats the search without gguf when the Hub rejects that field', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([], { status: 400 }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'org/plain', downloads: 3 }]));
    const { repos } = await searchGgufRepos('', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(fetchImpl.mock.calls[0][0]))).toContain('expand[]=gguf');
    expect(decodeURIComponent(String(fetchImpl.mock.calls[1][0]))).not.toContain('expand[]=gguf');
    expect(repos.map((r) => r.id)).toEqual(['org/plain']);
  });

  it('does not retry on other errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([], { status: 500 }));
    await expect(searchGgufRepos('', { fetchImpl })).rejects.toMatchObject({ code: 'HTTP_500' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

  it('follows tree pagination so shards on a later page still form one model', async () => {
    const next = '<https://huggingface.co/api/models/org/repo/tree/main?recursive=true&limit=1000&cursor=p2>; rel="next"';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        { type: 'file', path: 'split-Q5_K_M-00001-of-00002.gguf', lfs: { size: 300 } },
      ], { link: next }))
      .mockResolvedValueOnce(jsonResponse([
        { type: 'file', path: 'split-Q5_K_M-00002-of-00002.gguf', lfs: { size: 200 } },
        { type: 'file', path: 'small-Q2_K.gguf', lfs: { size: 50 } },
      ]));
    const files = await listRepoGgufFiles('org/repo', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain('cursor=p2');
    expect(files.map((f) => [f.name, f.sizeBytes, f.shards])).toEqual([
      ['small-Q2_K.gguf', 50, 1],
      ['split-Q5_K_M-00001-of-00002.gguf', 500, 2],
    ]);
  });

  it('stops after MAX_TREE_PAGES and never loops on a repeated next link', async () => {
    let n = 0;
    const endless = vi.fn().mockImplementation(async () => {
      n += 1;
      return jsonResponse([], { link: `<https://huggingface.co/api/models/org/repo/tree/main?cursor=c${n}>; rel="next"` });
    });
    await listRepoGgufFiles('org/repo', { fetchImpl: endless });
    expect(endless).toHaveBeenCalledTimes(MAX_TREE_PAGES);

    const same = '<https://huggingface.co/api/models/org/repo/tree/main?recursive=true&limit=1000>; rel="next"';
    const looping = vi.fn().mockResolvedValue(jsonResponse([], { link: same }));
    await listRepoGgufFiles('org/repo', { fetchImpl: looping });
    expect(looping).toHaveBeenCalledTimes(1);
  });
});

describe('parseNextUrl', () => {
  it('returns same-host next links and resolves relative ones', () => {
    expect(parseNextUrl('<https://huggingface.co/api/x?cursor=a>; rel="next"')).toBe('https://huggingface.co/api/x?cursor=a');
    expect(parseNextUrl('</api/models/o/r/tree/main?cursor=b>; rel="next"')).toBe('https://huggingface.co/api/models/o/r/tree/main?cursor=b');
  });

  it('refuses other hosts, other relations and missing headers', () => {
    expect(parseNextUrl('<https://evil.example/api?cursor=a>; rel="next"')).toBeNull();
    expect(parseNextUrl('<https://huggingface.co/api/x>; rel="prev"')).toBeNull();
    expect(parseNextUrl(null)).toBeNull();
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

  it('formats byte sizes in labelled binary units', () => {
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GiB');
    expect(formatBytes(300 * 1024 ** 2)).toBe('300 MiB');
    expect(formatBytes(2048)).toBe('2 KiB');
    expect(formatBytes(BIG_MODEL_BYTES)).toBe('4.0 GiB');
  });

  it('never prints zero or NaN sizes', () => {
    expect(formatBytes(0)).toBe('1 KiB');
    expect(formatBytes(undefined)).toBe('1 KiB');
    expect(formatBytes('abc')).toBe('1 KiB');
  });
});

describe('formatParams', () => {
  it('formats parameter counts and hides unknown ones', () => {
    expect(formatParams(7_615_616_512)).toBe('7.6B params');
    expect(formatParams(70_553_706_496)).toBe('71B params');
    expect(formatParams(1_000_000_000)).toBe('1B params');
    expect(formatParams(360_000_000)).toBe('360M params');
    expect(formatParams(0)).toBe('');
    expect(formatParams(undefined)).toBe('');
    expect(formatParams('x')).toBe('');
  });
});

describe('dialog helpers', () => {
  it('detects touch-first devices from the pointer media query', () => {
    expect(isCoarsePointer({ matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }) })).toBe(true);
    expect(isCoarsePointer({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isCoarsePointer({})).toBe(false);
    expect(isCoarsePointer({ matchMedia: () => { throw new Error('nope'); } })).toBe(false);
    expect(isCoarsePointer(null)).toBe(false);
  });

  it('asks for confirmation only while a download is running', () => {
    expect(shouldConfirmClose({ downloading: true })).toBe(true);
    expect(shouldConfirmClose({ downloading: false })).toBe(false);
    expect(shouldConfirmClose()).toBe(false);
  });
});
