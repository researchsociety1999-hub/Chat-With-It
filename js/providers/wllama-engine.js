/**
 * Loads the wllama engine (llama.cpp compiled to WebAssembly) on demand from a pinned jsDelivr URL.
 *
 * Why a CDN and not an npm dependency: adding a package needs a regenerated package-lock.json,
 * which CI (`npm ci`) requires. Loading lazily also keeps the engine out of dist/app.js; nothing
 * is fetched until the user actually loads a local model.
 *
 * Trade-off: dynamic imports cannot use Subresource Integrity, so the pinned version is the only
 * integrity control. Swap this loader for a bundled import if you prefer to vendor the package.
 */

export const WLLAMA_VERSION = '3.13.0';
export const WLLAMA_BASE_URL = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm`;

/**
 * @param {{ importer?: (url: string) => Promise<any>, baseUrl?: string }} [opts]
 * @returns {() => Promise<{ Wllama: Function, config: { default: string } }>}
 */
export function createCdnLoader({ importer, baseUrl = WLLAMA_BASE_URL } = {}) {
  const load = importer || ((url) => import(/* @vite-ignore */ url));
  return async function loadWllamaFromCdn() {
    const mod = await load(`${baseUrl}/index.js`);
    if (!mod || typeof mod.Wllama !== 'function') {
      throw new Error('The local engine could not be loaded from the CDN.');
    }
    return { Wllama: mod.Wllama, config: { default: `${baseUrl}/wasm/wllama.wasm` } };
  };
}
