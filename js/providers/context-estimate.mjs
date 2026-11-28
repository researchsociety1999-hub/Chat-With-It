/**
 * Rough size of the conversation against the model's context window. Pure: no DOM, no AppState.
 * The estimate is characters / 4, the same heuristic AppState.trimHistoryToFitContext uses, so the
 * pill and the app's own trimming agree about what "full" means.
 */

export const DEFAULT_LIMIT = 8192;
export const WARNING_AT = 0.7;
export const CRITICAL_AT = 0.9;

export function estimateTokens(text) {
  return typeof text === 'string' ? Math.ceil(text.length / 4) : 0;
}

/** 'ok' below 70%, 'warning' from 70% to 90% inclusive, 'critical' above 90%. Integer maths, no float edge cases. */
export function contextLevel(used, limit) {
  if (!(limit > 0) || !(used > 0)) return 'ok';
  if (used * 10 > limit * 9) return 'critical';
  if (used * 10 >= limit * 7) return 'warning';
  return 'ok';
}

/**
 * @param {{persona?: string, history?: {content?: string}[], draft?: string, limit?: number}} input
 * @returns {{used: number, limit: number, ratio: number, percent: number, level: 'ok'|'warning'|'critical'}}
 */
export function estimateContext({ persona = '', history = [], draft = '', limit = DEFAULT_LIMIT } = {}) {
  const max = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : DEFAULT_LIMIT;
  let used = estimateTokens(persona) + estimateTokens(draft);
  if (Array.isArray(history)) {
    for (const message of history) used += estimateTokens(message && message.content);
  }
  return { used, limit: max, ratio: used / max, percent: Math.round((used / max) * 100), level: contextLevel(used, max) };
}

/** 0, 999, 1k, 1.2k, 8.2k, 12k, 131k */
export function formatCount(n) {
  const value = Number.isFinite(n) && n > 0 ? n : 0;
  if (value < 1000) return String(Math.round(value));
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** "~1.2k / 8.2k tokens" */
export function formatContextPill({ used, limit }) {
  return `~${formatCount(used)} / ${formatCount(limit)} tokens`;
}
