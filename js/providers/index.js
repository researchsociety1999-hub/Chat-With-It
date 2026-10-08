/**
 * Provider abstraction layer — entry point.
 * Existing api.js remains the runtime path until adapters are fully wired.
 */

export { ErrorCode, providerError, ProviderContract } from './types.js';
export {
  registerProvider,
  getProvider,
  listProviderIds,
  listProviders,
  hasProvider,
} from './registry.js';
export { normalizeModel, dedupeAndSort } from './normalize.js';
