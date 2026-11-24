/**
 * Local tab behaviour: show/hide the key controls, the Load GGUF panel, loading status, unload.
 * All markup lives in index.html; if it is missing this module does nothing.
 *
 * Model-list refresh: app.js already re-runs refreshModels() on the 'cwi:profile-activated'
 * event, so this reuses it until app.js gets a dedicated listener.
 */

import { AppState } from './state.js';
import { UI } from './ui.js';
import {
  loadLocalModel,
  unloadLocalModel,
  getLoadedLocalModel,
  isLoadingLocalModel,
  onLocalChange,
} from './providers/wllama.js';

const BIG_FILE_BYTES = 4 * 1024 ** 3;
const LOCAL_HINT = 'Running on-device · nothing leaves this browser · speed depends on your CPU';
const HIDE_WHEN_LOCAL = ['apiKeyInput', 'authBtn', 'authHint', 'clearAuthBtn'];

let originalHint = null;

const $ = (id) => document.getElementById(id);

function formatBytes(bytes) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function setStatus(text) {
  const el = $('localStatus');
  if (el) el.textContent = text;
}

function userMessage(err) {
  if (err && err.code === 'ENGINE_MISSING') return 'The local engine is not part of this build yet.';
  if (err && (err.code === 'INVALID_REQUEST' || err.code === 'BUSY')) return err.message;
  return `Could not load the model: ${err && err.message ? err.message : 'unknown error'}`;
}

function refreshModelList() {
  document.dispatchEvent(new CustomEvent('cwi:profile-activated'));
}

function syncButtons() {
  const loaded = Boolean(getLoadedLocalModel());
  const busy = isLoadingLocalModel();
  $('localUnloadBtn')?.classList.toggle('hidden', !loaded);
  const pick = $('localPickBtn');
  if (pick) pick.disabled = busy;
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
  if (local) UI.setAuthState(true, 'On-device · no key needed');
}

async function handleFile(file) {
  if (!file) return;
  const run = async () => {
    setStatus(`Loading ${file.name} (${formatBytes(file.size)})…`);
    syncButtons();
    try {
      const model = await loadLocalModel(file);
      setStatus(`Loaded ${model.name} · ${formatBytes(model.sizeBytes)} · ${model.ctx.toLocaleString()} ctx · ${(model.loadMs / 1000).toFixed(1)} s`);
      UI.toast('✅ Local model loaded', 'success');
      refreshModelList();
    } catch (err) {
      const message = userMessage(err);
      setStatus(message);
      UI.toast(message, 'error', 7000);
    } finally {
      syncButtons();
    }
  };
  if (file.size > BIG_FILE_BYTES) {
    UI.confirmModal(
      `${file.name} is ${formatBytes(file.size)}. Files over 4 GB may fail to load in this browser build and can use most of your memory. Try anyway?`,
      run,
      { confirmLabel: 'Try anyway', cancelLabel: 'Cancel' }
    );
  } else {
    run();
  }
}

function init() {
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
  unload.addEventListener('click', async () => {
    await unloadLocalModel();
    setStatus('No model loaded.');
    syncButtons();
    refreshModelList();
  });

  // app.js owns the tab click; run after it so this layer has the last word on the Local view.
  document.querySelectorAll('.ptab').forEach((btn) => {
    btn.addEventListener('click', () => setTimeout(() => applyProvider(btn.dataset.provider), 0));
  });
  onLocalChange(syncButtons);
  // AppState.init() restores the saved provider after modules load, so apply once the page is ready.
  window.addEventListener('load', () => applyProvider(AppState.currentProvider));
  syncButtons();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
