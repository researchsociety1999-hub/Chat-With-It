/**
 * Free-model routing helpers.
 * Rule-based only — never suggests paid models. Future learned routing can
 * implement the same pickFreeModel(candidates, policy) shape.
 */

/**
 * @typedef {'general'|'coding'|'reasoning'|'long_context'|'fast'} RouteIntent
 */

/**
 * Infer a coarse intent from the user text (best-effort, not ML).
 * @param {string} text
 * @returns {RouteIntent}
 */
export function inferIntent(text = '') {
  const t = String(text).toLowerCase();
  if (/\b(code|bug|refactor|typescript|javascript|python|sql|css|html|compile|stack.?trace)\b/.test(t)) {
    return 'coding';
  }
  if (/\b(reason|prove|math|logic|step.?by.?step|think|why)\b/.test(t)) {
    return 'reasoning';
  }
  if (t.length > 4000 || /\b(long.?context|entire|document|transcript)\b/.test(t)) {
    return 'long_context';
  }
  if (/\b(quick|short|brief|tl;?dr|fast)\b/.test(t)) {
    return 'fast';
  }
  return 'general';
}

/**
 * Score a free model for an intent. Higher is better.
 * @param {{ id: string, name?: string, ctx?: number, paramTier?: string, uncensored?: boolean }} model
 * @param {RouteIntent} intent
 */
export function scoreFreeModel(model, intent = 'general') {
  if (!model?.id) return -Infinity;
  const id = model.id.toLowerCase();
  const name = String(model.name || '').toLowerCase();
  const ctx = Number(model.ctx) || 8192;
  // Soft context preference — keep capped low so intent tags still win.
  let score = Math.min(ctx / 8000, 24);

  const coding = /code|coder|devstral|deepseek-chat|qwen2\.5-coder/.test(id + name);
  const reasoning = /r1|reason|qwq|prover|thinking/.test(id + name);
  const small = /1\.5b|1b|0\.6b|3b|4b|7b|8b/.test(String(model.paramTier || id).toLowerCase());

  if (intent === 'coding' && coding) score += 100;
  if (intent === 'reasoning' && reasoning) score += 100;
  if (intent === 'long_context') score += Math.min(ctx / 4000, 80);
  if (intent === 'fast' && small) score += 60;
  if (intent === 'general') score += 10;

  // Prefer clearly free-tagged ids
  if (id.endsWith(':free')) score += 5;
  return score;
}

/**
 * Pick the best free candidate, skipping excluded / cooldown ids.
 * @param {Array} models free-only list
 * @param {{ intent?: RouteIntent, exclude?: string[], isUsable?: (id: string) => boolean }} [opts]
 * @returns {object|null}
 */
export function pickFreeModel(models, opts = {}) {
  const { intent = 'general', exclude = [], isUsable = () => true } = opts;
  const skip = new Set(exclude);
  const usable = (Array.isArray(models) ? models : []).filter(
    (m) => m?.id && !skip.has(m.id) && isUsable(m.id) && m.type !== 'embedding',
  );
  if (!usable.length) return null;
  usable.sort((a, b) => scoreFreeModel(b, intent) - scoreFreeModel(a, intent));
  return usable[0];
}

/**
 * Suggest an alternate free model after a failure (ask-first UI).
 */
export function suggestFreeAlternative(models, failedId, opts = {}) {
  return pickFreeModel(models, {
    ...opts,
    exclude: [failedId, ...(opts.exclude || [])],
  });
}
