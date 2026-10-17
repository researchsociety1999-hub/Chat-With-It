#!/usr/bin/env node
/**
 * Validate the app's curated model list against OpenRouter's live catalog.
 *
 *   node scripts/validate-models.mjs --curated path/to/curated.json
 *   OPENROUTER_API_KEY=sk-... node scripts/validate-models.mjs --curated curated.json --probe 3
 *
 * --curated  JSON file: an array of {"id": "..."} objects (or plain id strings).
 * --probe N  send up to N one-token requests to curated free models to catch 404
 *            "no endpoints" errors. Needs OPENROUTER_API_KEY. Free models have daily
 *            request limits, so keep N small.
 *
 * Exit code 1 when any curated model is missing, not free, deprecated or fails a probe.
 */
import { readFileSync } from 'node:fs';
import {
  BASE,
  DEPRECATED_IDS,
  ErrorKind,
  fetchCatalog,
  buildIndex,
  classifyDispatchError,
} from '../js/providers/availability.mjs';

function parseArgs(argv) {
  const out = { curated: null, probe: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--curated') out.curated = argv[++i];
    else if (argv[i] === '--probe') out.probe = Number(argv[++i]) || 0;
  }
  return out;
}

function loadCurated(path) {
  if (!path) return [];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return (Array.isArray(data) ? data : data.models || []).map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean);
}

async function probe(id, key) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Title': 'ChatWithIt validator' },
    body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, ...classifyDispatchError(res.status, await res.text().catch(() => '')) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const curated = loadCurated(args.curated);
  const problems = [];

  const raw = await fetchCatalog();
  const index = buildIndex(raw);
  console.log(`Live catalog: ${index.total} models, ${index.free.size} free, ${index.deprecated.size} deprecated`);
  if (index.free.size === 0) {
    console.error('Live catalog has no free models; refusing to judge the curated list.');
    process.exit(2);
  }

  for (const id of curated) {
    if (index.deprecated.has(id) || Object.prototype.hasOwnProperty.call(DEPRECATED_IDS, id)) {
      problems.push(`DEPRECATED  ${id} -> ${index.deprecated.get(id) || DEPRECATED_IDS[id] || 'no replacement listed'}`);
    } else if (!index.free.has(id)) {
      problems.push(`NOT FREE/MISSING  ${id}`);
    }
  }

  if (args.probe > 0) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      console.error('--probe needs OPENROUTER_API_KEY in the environment.');
      process.exit(2);
    }
    const targets = curated.filter((id) => index.free.has(id)).slice(0, args.probe);
    for (const id of targets) {
      const r = await probe(id, key);
      console.log(`probe ${id}: ${r.ok ? 'ok' : r.kind}`);
      if (!r.ok && r.kind !== ErrorKind.RATE_LIMIT) problems.push(`PROBE ${r.kind}  ${id}: ${r.message}`);
    }
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(curated.length ? 'All curated models are live and free.' : 'No curated list supplied; catalog check only.');
}

main().catch((err) => {
  console.error(`validate-models failed: ${err.kind || 'ERROR'} ${err.message}`);
  process.exit(2);
});
