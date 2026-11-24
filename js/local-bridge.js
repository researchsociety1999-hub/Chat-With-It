/**
 * Local-provider bridge. Like model-gate.js, it extends the app's real API object (js/api.js)
 * without editing it, so app.js keeps calling API.fetchModels directly.
 *
 *  - registers PROVIDERS.local (a name only: local models have no URL, key or network)
 *  - API.fetchModels('local', filter) returns the model loaded in this browser, if any
 *  - API.estimateCost, UI.updateDiagnostics and UI.updateModelLabel learn about local models
 *
 * Every step is defensive: if a collaborator is missing (for example a test mocks api.js
 * partially) the bridge installs nothing and never throws.
 */

import * as apiModule from './api.js';
import * as uiModule from './ui.js';
import { AppState } from './state.js';
import { getLoadedLocalModel } from './providers/wllama.js';

const NO_MODEL_LABEL = '— load a .gguf file —';

function setLines(el, lines) {
  el.textContent = '';
  lines.forEach((line, i) => {
    if (i) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
}

// app.js reports an empty list as "No free models for this filter"; say what to do instead.
// It writes that text synchronously after our promise resolves, so this runs just after it.
function showEmptyState() {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const sel = document.getElementById('modelSelect');
    if (!sel || AppState.currentProvider !== 'local' || getLoadedLocalModel()) return;
    sel.classList.remove('error', 'loading');
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = 'none';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = NO_MODEL_LABEL;
    sel.appendChild(opt);
  }, 0);
}

export function installLocalBridge() {
  try {
    const { API, PROVIDERS, PARAM_TIERS } = apiModule;
    const UI = uiModule.UI;
    if (!API || !PROVIDERS || API.__localBridge) return false;
    API.__localBridge = true;

    if (!PROVIDERS.local) {
      PROVIDERS.local = {
        name: 'Local model',
        baseUrl: '',
        authKey: '',
        modelEndpoint: '',
        chatEndpoint: '',
        authHeader: '',
        extraHeaders: {},
        badgeClass: 'local',
        badgeLabel: 'LOCAL',
      };
    }

    const baseFetchModels = API.fetchModels.bind(API);
    API.fetchModels = async function fetchModelsWithLocal(providerName = AppState.currentProvider, paramFilter = 'all') {
      if (providerName !== 'local') return baseFetchModels(providerName, paramFilter);
      const model = getLoadedLocalModel();
      let models = model ? [model] : [];
      if (paramFilter && paramFilter !== 'all' && Array.isArray(PARAM_TIERS)) {
        const tier = PARAM_TIERS.find((t) => t.value === paramFilter);
        if (tier) models = models.filter((m) => tier.test(m.paramTier || '?'));
      }
      if (!model) showEmptyState();
      return models;
    };

    if (typeof API.estimateCost === 'function') {
      const baseEstimateCost = API.estimateCost.bind(API);
      API.estimateCost = (model) => (model && model.local
        ? { available: false, label: 'Local · no cost' }
        : baseEstimateCost(model));
    }

    if (UI && typeof UI.updateDiagnostics === 'function') {
      const baseDiagnostics = UI.updateDiagnostics.bind(UI);
      UI.updateDiagnostics = (provider, modelId) => {
        if (provider !== 'local') return baseDiagnostics(provider, modelId);
        const el = document.getElementById('stat-diag');
        if (!el) return undefined;
        const model = getLoadedLocalModel();
        setLines(el, ['Provider: Local (on-device)', `Model: ${model ? model.fileName : 'none'}`]);
        return undefined;
      };
    }

    if (UI && typeof UI.updateModelLabel === 'function') {
      const baseLabel = UI.updateModelLabel.bind(UI);
      UI.updateModelLabel = (modelName) => {
        baseLabel(modelName);
        const badge = document.getElementById('modelBadge');
        if (badge) badge.classList.toggle('local', AppState.currentProvider === 'local');
      };
    }
    return true;
  } catch (_) {
    return false;
  }
}

installLocalBridge();
