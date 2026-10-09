/**
 * Provider abstraction layer — entry point.
 *
 * Existing js/api.js remains the primary runtime path for the UI.
 * Adapters are registered and ready for gradual migration.
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
export { openRouterAdapter } from './openrouter.js';
export { huggingFaceAdapter } from './huggingface.js';
export { bootstrapProviders } from './bootstrap.js';

// Ensure adapters are registered when this module is imported
import './bootstrap.js';
