/**
 * Local tab behaviour: show/hide the key controls, the Load GGUF panel, loading status, unload.
 * All markup lives in index.html; if it is missing this module does nothing.
 *
 * Status and the model list follow the engine's events, so a picked file and a Hugging Face
 * download behave the same. app.js already re-runs refreshModels() on 'cwi:profile-activated',
 * so that event is reused until app.js gets a dedicated listener.
 */

import { AppState } from './state.js';
import { UI } from './ui.js';
import './hf-gguf-ui.js';
import { initLocalModels } from './local-models-ui.js';
import { formatBytes } from './providers/hf-gguf.mjs';
import { createCdnLoader } from './providers/wllama-engine.js';
import {
  loadLocalModel,
  unloadLocalModel,
  getLoadedLocalModel,
  isLoadingLocalModel,
  isEngineConfigured,
  setEngineLoader,
  onLocalChange,
} from './providers/wllama.js';

const BIG_FILE_BYTES = 4 * 1024 ** 3;
const LOCAL_HINT = 'Running on-device \u00b7 nothing leaves this browser \u00b7 speed depends on your CPU';
const HIDE_WHEN_LOCAL = ['apiKeyInput', 'authBtn', 'authHint', 'clearAuthBtn'];

let originalHint = null;

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  const el = $('localStatus');
  if (el) el.textContent = text;
}

function userMessage(err) {
  if (err && err.code === 'ABORTED') return 'Cancelled.';
  if (err && err.code === 'ENGINE_MISSING') return 'The local engine is not part of this build yet.';
  if (err && (err.code === 'INVALID_REQUEST' || err.code === 'BUSY')) return err.message;
  return `Could not load the model: ${err && err.message ? err.message : 'unknown error'}`;
}

function refreshModelList() {
  document.dispatchEvent(new CustomEvent('cwi:profile-activated'));
}

/** On phones the Local controls live in the slide-in drawer; once a model is loaded, show the chat. */
function closeDrawerIfOpen() {
  try {
    const sidebar = $('sidebar');
    if (sidebar && sidebar.classList.contains('open') && window.matchMedia('(max-width: 1100px)').matches) UI.toggleSidebar();
  } catch (_) { /* never let a layout nicety break model loading */ }
}

function syncButtons() {
  const loaded = Boolean(getLoadedLocalModel());
  const busy = isLoadingLocalModel();
  $('localUnloadBtn')?.classList.toggle('hidden', !loaded);
  const pick = $('localPickBtn');
  if (pick) pick.disabled = busy;
  const hf = $('hfDownloadBtn');
  if (hf) hf.disabled = busy;
}

function onEngineEvent(evt) {
  if (evt.kind === 'loading') {
    const size = evt.file.size ? ` (${formatBytes(evt.file.size)})` : '';
    setStatus(`Loading ${evt.file.name}${size}\u2026 The engine is fetched from cdn.jsdelivr.net on first use.`);
  } else if (evt.kind === 'loaded') {
    const m = evt.model;
    const size = m.sizeBytes ? ` \u00b7 ${formatBytes(m.sizeBytes)}` : '';
    setStatus(`Loaded ${m.name}${size} \u00b7 ${m.ctx.toLocaleString()} ctx \u00b7 ${(m.loadMs / 1000).toFixed(1)} s`);
    refreshModelList();
    closeDrawerIfOpen();
  } else if (evt.kind === 'unloaded') {
    setStatus('No model loaded.');
    refreshModelList();
  } else if (evt.kind === 'error') {
    setStatus(userMessage(evt.error));
  }
  syncButtons();
}

function applyProvider(provider) {
  const local = provider === 'local';
  document.querySelectorAll('.ptab').forEach((btn) => {
    const on = btn.dataset.provider === provider;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  HIDE_WHEN_LOCAL.forEach((id) => $(id)?.classList.toggle('hidden', local));
  document.querySelector('.profiles-wrapper')?.classList.toggle('hidden', local);
  $('localPanel')?.classList.toggle('hidden', !local);

  const hint = $('freeTierHint');
  if (hint) {
    if (originalHint === null) originalHint = hint.textContent;
    if (local) hint.textContent = LOCAL_HINT;
    else if (hint.textContent === LOCAL_HINT) hint.textContent = originalHint;
  }
  if (local) UI.setAuthState(true, 'On-device \u00b7 no key needed');
}

async function handleFile(file) {
  if (!file) return;
  const run = async () => {
    try {
      await loadLocalModel(file);
      UI.toast('\u2705 Local model loaded', 'success');
    } catch (err) {
      if (!err || err.code !== 'ABORTED') UI.toast(userMessage(err), 'error', 7000);
    }
  };
  if (file.size > BIG_FILE_BYTES) {
    UI.confirmModal(
      `${file.name} is ${formatBytes(file.size)}. Files over 4 GiB may fail to load in this browser build and can use most of your memory. Try anyway?`,
      run,
      { confirmLabel: 'Try anyway', cancelLabel: 'Cancel' }
    );
  } else {
    run();
  }
}

function init() {
  if (!isEngineConfigured()) setEngineLoader(createCdnLoader());

  const input = $('localFileInput');
  const pick = $('localPickBtn');
  const unload = $('localUnloadBtn');
  if (!input || !pick || !unload) return;

  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    handleFile(file);
  });
  unload.addEventListener('click', () => unloadLocalModel());

  // app.js owns the tab click; run after it so this layer has the last word on the Local view.
  document.querySelectorAll('.ptab').forEach((btn) => {
    btn.addEventListener('click', () => setTimeout(() => applyProvider(btn.dataset.provider), 0));
  });
  onLocalChange(onEngineEvent);
  initLocalModels();
  // AppState.init() restores the saved provider after modules load, so apply once the page is ready.
  window.addEventListener('load', () => applyProvider(AppState.currentProvider));
  syncButtons();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
