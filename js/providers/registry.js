/**
 * Provider registry — single place to register and resolve LLM providers.
 * Keeps UI and AppState free of provider-specific base URLs and headers.
 */

import { ErrorCode, providerError } from './types.js';

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * Register a provider adapter.
 * @param {string} id - e.g. 'openrouter'
 * @param {object} adapter - must implement listModels + streamChat
 */
export function registerProvider(id, adapter) {
  if (!id || typeof id !== 'string') {
    throw new Error('registerProvider: id is required');
  }
  if (!adapter || typeof adapter.listModels !== 'function' || typeof adapter.streamChat !== 'function') {
    throw new Error(`registerProvider: adapter for "${id}" must implement listModels and streamChat`);
  }
  registry.set(id, {
    id,
    name: adapter.name || id,
    badgeClass: adapter.badgeClass || id.slice(0, 2),
    badgeLabel: adapter.badgeLabel || id.slice(0, 2).toUpperCase(),
    ...adapter,
  });
}

/**
 * @param {string} id
 * @returns {object}
 */
export function getProvider(id) {
  const p = registry.get(id);
  if (!p) {
    throw providerError(ErrorCode.INVALID_REQUEST, `Unknown provider: ${id}`);
  }
  return p;
}

/** @returns {string[]} */
export function listProviderIds() {
  return Array.from(registry.keys());
}

/** @returns {Array<{id:string,name:string,badgeClass:string,badgeLabel:string}>} */
export function listProviders() {
  return Array.from(registry.values()).map((p) => ({
    id: p.id,
    name: p.name,
    badgeClass: p.badgeClass,
    badgeLabel: p.badgeLabel,
  }));
}

export function hasProvider(id) {
  return registry.has(id);
}

export default {
  registerProvider,
  getProvider,
  listProviderIds,
  listProviders,
  hasProvider,
};
