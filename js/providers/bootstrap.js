/**
 * Register built-in providers once at app load.
 * Safe to import multiple times — registry overwrites by id.
 */

import { registerProvider } from './registry.js';
import { openRouterAdapter } from './openrouter.js';
import { huggingFaceAdapter } from './huggingface.js';

let bootstrapped = false;

export function bootstrapProviders() {
  if (bootstrapped) return;
  registerProvider('openrouter', openRouterAdapter);
  registerProvider('huggingface', huggingFaceAdapter);
  bootstrapped = true;
}

// Auto-register on module load for convenience
bootstrapProviders();

export default bootstrapProviders;
