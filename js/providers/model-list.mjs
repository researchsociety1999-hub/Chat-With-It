/**
 * Pure helpers for building the model list. No DOM, no AppState, no storage.
 * Used by js/api.js (the code path app.js actually calls).
 */

const SIZE_RE = /(?:^|[\/\-_: ])(\d+(?:\.\d+)?)b(?=$|[\/\-_: ])/i;

/** Size buckets in billions of parameters: [min, max). */
export const TIER_RANGES = {
  tiny:  [0, 4],
  small: [4, 10],
  mid:   [10, 35],
  large: [35, 105],
  giant: [105, Infinity],
};

/** '8B' -> 8, '0.6B' -> 0.6, '?' -> NaN. */
export function paramBillions(tier) {
  const m = /^(\d+(?:\.\d+)?)B$/i.exec(String(tier || ''));
  return m ? parseFloat(m[1]) : NaN;
}

/**
 * Best-effort size from a model id such as "meta-llama/Llama-3.1-8B-Instruct".
 * Returns '?' when the id carries no plain "<n>b" token (e.g. Mixtral-8x7B, e4b).
 */
export function inferParamTier(id) {
  const tail = String(id || '').split('/').pop();
  const m = SIZE_RE.exec(tail);
  if (!m) return '?';
  const n = parseFloat(m[1]);
  if (!(n > 0) || n > 2000) return '?';
  return `${n}B`;
}

/** Curated size wins; a '?' or missing curated size falls back to inference. */
export function resolveParamTier(curatedTier, id) {
  return curatedTier && curatedTier !== '?' ? curatedTier : inferParamTier(id);
}

/** Does a model's paramTier fall in the selected size bucket? Unknown ('?') only matches 'all'. */
export function tierMatches(value, paramTier) {
  if (!value || value === 'all') return true;
  const range = TIER_RANGES[value];
  const n = paramBillions(paramTier);
  return Boolean(range) && Number.isFinite(n) && n >= range[0] && n < range[1];
}

/**
 * Live Hugging Face models that are not in the curated list.
 * Hugging Face has no free/paid split, so these are labelled "(unverified)".
 * Embedding models and ids already known are skipped.
 */
export function buildLiveHuggingFaceExtras(liveModels, knownIds = new Set()) {
  const seen = new Set(knownIds);
  const out = [];
  for (const lm of Array.isArray(liveModels) ? liveModels : []) {
    const id = lm && lm.id;
    if (!id || seen.has(id)) continue;
    const modality = String(lm?.architecture?.modality || '').toLowerCase();
    if (lm.type === 'embedding' || modality.includes('embedding') || String(id).toLowerCase().includes('embed')) continue;
    seen.add(id);
    const short = String(id).split('/').pop();
    out.push({
      id: String(id),
      name: `${lm.name || short} (unverified)`,
      ctx: Number(lm.context_length || lm.context_window) || 8192,
      paramTier: inferParamTier(id),
      uncensored: false,
      type: 'chat',
      live: true,
      curated: false,
    });
  }
  return out;
}
