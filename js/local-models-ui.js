/**
 * "Downloaded models" panel inside the Local provider section of the sidebar.
 *
 * Lists the models saved by the Hugging Face download dialog (a small IndexedDB registry, see
 * providers/local-storage-db.js) plus the model loaded in this session, with Load, Unload and Delete.
 * The markup is built here and inserted after #localUnloadBtn, so it shows and hides with #localPanel.
 */

import { UI } from './ui.js';
import { formatBytes } from './providers/hf-gguf.mjs';
import { getModelStore, CHANGE_EVENT } from './providers/local-storage-db.js';
import { deleteCachedModel } from './providers/local-cache.js';
import { createCdnLoader } from './providers/wllama-engine.js';
import {
  loadLocalModelFromHF,
  unloadLocalModel,
  getLoadedLocalModel,
  isLoadingLocalModel,
  onLocalChange,
} from './providers/wllama.js';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

/** True when the loaded engine model is this saved download. */
export function isActiveRecord(record, model) {
  return Boolean(model && model.source && model.source.repo === record.repoId && model.source.file === record.path);
}

/** A loaded model that has no saved row: a file picked from disk, or a download that could not be saved. */
export function isSessionModel(model, records) {
  return Boolean(model && model.local && !records.some((record) => isActiveRecord(record, model)));
}

function actionButton(label, kind, onClick, disabled) {
  const button = el('button', { class: `btn btn-sm ${kind}`, type: 'button', text: label, onclick: onClick });
  if (disabled) button.disabled = true;
  return button;
}

function row({ name, meta, badge, active }, buttons) {
  return el('li', { class: `lm-item${active ? ' active' : ''}` },
    el('div', { class: 'lm-top' },
      el('strong', { class: 'lm-name', text: name }),
      badge ? el('span', { class: 'lm-badge', text: badge }) : null),
    el('div', { class: 'lm-meta', text: meta }),
    el('div', { class: 'lm-actions' }, ...buttons));
}

/**
 * Draw the list. Pure DOM: all state comes in through `view`, all behaviour goes out through `actions`.
 * @param {HTMLElement} list the <ul>
 * @param {{ records: object[], active: object|null, busy: boolean }} view
 * @param {{ load: Function, unload: Function, remove: Function }} actions
 */
export function renderModelList(list, view, actions) {
  const { records, active, busy } = view;
  list.textContent = '';

  if (isSessionModel(active, records)) {
    const size = active.sizeBytes ? ` \u00b7 ${formatBytes(active.sizeBytes)}` : '';
    list.append(row(
      { name: active.fileName || active.name, meta: `Loaded this session, not saved${size}`, badge: 'Active', active: true },
      [actionButton('Unload', 'btn-ghost', () => actions.unload(), busy)]
    ));
  }

  for (const record of records) {
    const isActive = isActiveRecord(record, active);
    const saved = record.savedAt ? ` \u00b7 saved ${new Date(record.savedAt).toLocaleDateString()}` : '';
    const buttons = [
      isActive
        ? actionButton('Unload', 'btn-ghost', () => actions.unload(), busy)
        : actionButton('Load', 'btn-primary', () => actions.load(record), busy),
      actionButton('Delete', 'btn-danger', () => actions.remove(record), busy),
    ];
    list.append(row(
      { name: record.fileName, meta: `${record.repoId} \u00b7 ${formatBytes(record.sizeBytes)}${saved}`, badge: isActive ? 'Active' : null, active: isActive },
      buttons
    ));
  }
}

function userMessage(err) {
  if (err && err.code === 'ABORTED') return 'Cancelled.';
  if (err && err.code === 'ENGINE_MISSING') return 'The local engine is not part of this build yet.';
  return `Could not load the model: ${err && err.message ? err.message : 'unknown error'}`;
}

/**
 * Build the panel and keep it in sync. Returns { panel, refresh }, or null when the Local markup is absent.
 * Dependencies are injectable so tests can run without a browser engine or dialogs.
 */
export function initLocalModels({
  store = getModelStore(),
  confirm = (message, onYes) => UI.confirmModal(message, onYes, { confirmLabel: 'Delete', cancelLabel: 'Keep' }),
  toast = (message, type, ms) => UI.toast(message, type, ms),
  cacheLoader = createCdnLoader(),
} = {}) {
  const anchor = document.getElementById('localUnloadBtn');
  if (!anchor || document.getElementById('localModelsPanel')) return null;

  let libPromise = null;
  const loader = () => libPromise || (libPromise = cacheLoader());

  const list = el('ul', { class: 'lm-list', 'aria-label': 'Downloaded models' });
  const empty = el('div', { class: 'lm-empty', text: 'No downloaded models yet. Use "Get from Hugging Face" above.' });
  const storage = el('div', { class: 'lm-storage', 'aria-live': 'polite' });
  const panel = el('section', { id: 'localModelsPanel', class: 'lm-panel', 'aria-label': 'Downloaded models' },
    el('div', { class: 'lm-head' }, el('strong', { class: 'lm-title', text: 'Downloaded models' })),
    list, empty, storage);
  anchor.insertAdjacentElement('afterend', panel);

  async function loadRecord(record) {
    if (isLoadingLocalModel()) { toast('A model is already loading.', 'warning'); return; }
    const status = document.getElementById('localStatus');
    try {
      await loadLocalModelFromHF({ repo: record.repoId, file: record.path, sizeBytes: record.sizeBytes }, {
        onProgress: ({ loaded, total }) => {
          if (status && total) status.textContent = `Loading ${record.fileName}\u2026 ${formatBytes(loaded)} / ${formatBytes(total)}`;
        },
      });
      await store.touch(record.key).catch(() => {});
      toast(`\u2705 ${record.fileName} is ready`, 'success');
    } catch (err) {
      if (!err || err.code !== 'ABORTED') toast(userMessage(err), 'error', 7000);
    }
  }

  function removeRecord(record) {
    confirm(`Delete ${record.fileName} (${formatBytes(record.sizeBytes)}) from this browser? You can download it again later.`, async () => {
      if (isActiveRecord(record, getLoadedLocalModel())) await unloadLocalModel();
      let note = '';
      try {
        const result = await deleteCachedModel({ repo: record.repoId, file: record.path }, { loader });
        if (!result.supported || !result.deleted) note = ' It was removed from the list, but its file could not be found in the engine cache; clear site data to free that space.';
      } catch (_) {
        note = ' It was removed from the list, but the engine cache could not be cleaned; clear site data to free that space.';
      }
      try { await store.remove(record.key); } catch (_) { /* nothing left to remove */ }
      toast(`Deleted ${record.fileName}.${note}`, note ? 'warning' : 'success', note ? 9000 : undefined);
    });
  }

  async function refresh() {
    let records = [];
    try { records = await store.list(); } catch (_) { /* IndexedDB unavailable: session model only */ }
    const active = getLoadedLocalModel();
    renderModelList(list, { records, active, busy: isLoadingLocalModel() }, {
      load: loadRecord,
      unload: () => unloadLocalModel(),
      remove: removeRecord,
    });
    empty.classList.toggle('hidden', list.childElementCount > 0);
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      navigator.storage.estimate().then(({ usage, quota }) => {
        storage.textContent = quota ? `Browser storage: ${formatBytes(usage || 0)} used of ${formatBytes(quota)}.` : '';
      }).catch(() => {});
    }
  }

  onLocalChange(() => { refresh(); });
  document.addEventListener(CHANGE_EVENT, () => { refresh(); });
  refresh();
  return { panel, refresh };
}
