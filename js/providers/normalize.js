/**
 * Normalize heterogeneous provider model payloads into NormalizedModel.
 */

/**
 * @param {object} raw - Provider-native model object or curated entry
 * @param {string} providerId
 * @param {object} [curated] - Optional curated metadata overlay
 * @returns {import('./types.js').NormalizedModel}
 */
export function normalizeModel(raw, providerId, curated = null) {
  if (!raw || !raw.id) {
    throw new Error('normalizeModel: model id is required');
  }

  const id = String(raw.id);
  const name =
    curated?.name ||
    raw.name ||
    id.split('/').pop()?.replace(/-/g, ' ') ||
    id;

  const ctx =
    Number(raw.context_length || raw.ctx || curated?.ctx || 8192) || 8192;

  const type =
    curated?.type ||
    raw.type ||
    (String(raw.architecture?.modality || '').toLowerCase().includes('embedding')
      ? 'embedding'
      : 'chat');

  const pricing =
    raw.pricing && typeof raw.pricing === 'object'
      ? {
          prompt: Number(raw.pricing.prompt),
          completion: Number(raw.pricing.completion),
        }
      : curated?.pricing || undefined;

  /** @type {import('./types.js').NormalizedModel} */
  const model = {
    id,
    provider: providerId,
    name,
    ctx,
    paramTier: curated?.paramTier || raw.paramTier || '?',
    uncensored: !!(curated?.uncensored || raw.uncensored),
    type,
    live: raw.live !== undefined ? !!raw.live : true,
  };

  if (pricing && (Number.isFinite(pricing.prompt) || Number.isFinite(pricing.completion))) {
    model.pricing = pricing;
  }

  if (Array.isArray(curated?.capabilities)) {
    model.capabilities = curated.capabilities;
  }

  return model;
}

/**
 * Deduplicate by id, prefer curated display names, sort by name.
 * @param {import('./types.js').NormalizedModel[]} models
 */
export function dedupeAndSort(models) {
  const seen = new Set();
  const out = [];
  for (const m of models) {
    if (!m?.id || seen.has(m.id)) continue;
    if (m.type === 'embedding') continue;
    seen.add(m.id);
    out.push(m);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export default { normalizeModel, dedupeAndSort };
