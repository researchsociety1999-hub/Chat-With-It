/**
 * Where a reply comes from, per provider. Pure: used by the composer's data source tag
 * (js/trust-ui.js) so the label, its kind and its tooltip are defined in one place.
 */

export const DATA_SOURCES = {
  openrouter: {
    kind: 'remote',
    label: 'OpenRouter · Remote API',
    title: 'Your messages are sent to OpenRouter over HTTPS.',
  },
  huggingface: {
    kind: 'remote',
    label: 'Hugging Face · Remote API',
    title: 'Your messages are sent to Hugging Face over HTTPS.',
  },
  local: {
    kind: 'local',
    label: 'Local WASM · On-Device',
    title: 'The model runs in this browser tab. Your messages are not sent to a provider.',
  },
};

/** Metadata for a provider id; unknown ids fall back to OpenRouter, like API.getProvider(). */
export function dataSourceInfo(provider) {
  return DATA_SOURCES[provider] || DATA_SOURCES.openrouter;
}
