/**
 * Hugging Face GGUF popup: search public GGUF repositories, pick a file and download it straight
 * into the on-device engine with live progress. Built with DOM APIs (like UI.confirmModal), so
 * index.html only needs the Load GGUF box this attaches a button to.
 */

import { UI } from './ui.js';
import { searchGgufRepos, listRepoGgufFiles, fitLabel, formatBytes, BIG_MODEL_BYTES } from './providers/hf-gguf.mjs';
import { loadLocalModelFromHF, isLoadingLocalModel } from './providers/wllama.js';

const s = { dialog: null, ui: {}, query: '', cursor: null, repo: null, searchCtrl: null, dlCtrl: null, searchTimer: null };

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

const compact = (n) => new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
const setStatus = (text) => { if (s.ui.status) s.ui.status.textContent = text; };

function showReposMode() {
  s.repo = null;
  s.ui.back.classList.add('hidden');
  s.ui.list.textContent = '';
}

function renderRepos(repos) {
  for (const repo of repos) {
    s.ui.list.append(el('button', { class: 'hf-row', type: 'button', onclick: () => showFiles(repo.id) },
      el('strong', { text: repo.id }),
      el('span', { class: 'muted', text: `\u2193 ${compact(repo.downloads)} \u00b7 \u2665 ${compact(repo.likes)}` })));
  }
}

async function runSearch(reset) {
  if (s.searchCtrl) s.searchCtrl.abort();
  const ctrl = new AbortController();
  s.searchCtrl = ctrl;
  if (reset) { s.cursor = null; s.ui.list.textContent = ''; }
  setStatus('Searching\u2026');
  try {
    const { repos, next } = await searchGgufRepos(s.query, { cursor: reset ? undefined : s.cursor, signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    renderRepos(repos);
    s.cursor = next;
    s.ui.more.classList.toggle('hidden', !next);
    setStatus(repos.length || s.ui.list.childElementCount
      ? 'Public GGUF models, most downloaded first. Gated repositories are not listed.'
      : 'No public GGUF models found.');
  } catch (err) {
    if (err.code === 'ABORTED') return;
    setStatus(err.message);
  }
}

function fileTags(f) {
  const tags = [];
  if (f.quant) tags.push(['hf-tag', f.quant]);
  tags.push(['hf-tag', f.sizeBytes ? formatBytes(f.sizeBytes) : 'size unknown']);
  if (f.shards > 1) tags.push(['hf-tag', `split \u00d7${f.shards}`]);
  if (f.projector) tags.push(['hf-tag warn', 'vision projector, not a chat model']);
  const fit = fitLabel(f.sizeBytes, { deviceMemoryGb: navigator.deviceMemory });
  if (fit === 'large') tags.push(['hf-tag warn', 'large for a browser']);
  if (fit === 'tight') tags.push(['hf-tag warn', 'may exceed device memory']);
  return el('div', { class: 'hf-tags' }, ...tags.map(([cls, text]) => el('span', { class: cls, text })));
}

function renderFiles(repoId, files) {
  s.ui.list.textContent = '';
  for (const f of files) {
    const start = () => download(repoId, f);
    const ask = () => {
      if (f.sizeBytes > BIG_MODEL_BYTES) {
        UI.confirmModal(
          `${f.name} is ${formatBytes(f.sizeBytes)}. Models over 4 GB may fail to load in this browser and can use most of your memory. Download anyway?`,
          start,
          { confirmLabel: 'Download anyway', cancelLabel: 'Cancel' }
        );
      } else {
        start();
      }
    };
    s.ui.list.append(el('div', { class: 'hf-row hf-file' },
      el('div', {}, el('strong', { text: f.name }), fileTags(f)),
      el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Download', onclick: ask })));
  }
}

async function showFiles(repoId) {
  if (s.searchCtrl) s.searchCtrl.abort();
  const ctrl = new AbortController();
  s.searchCtrl = ctrl;
  s.repo = repoId;
  s.ui.list.textContent = '';
  s.ui.more.classList.add('hidden');
  s.ui.back.classList.remove('hidden');
  setStatus(`Loading files of ${repoId}\u2026`);
  try {
    const files = await listRepoGgufFiles(repoId, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    if (!files.length) { setStatus(`${repoId} has no .gguf files.`); return; }
    setStatus(`${repoId} \u00b7 ${files.length} file${files.length === 1 ? '' : 's'}, smallest first`);
    renderFiles(repoId, files);
  } catch (err) {
    if (err.code === 'ABORTED') return;
    setStatus(err.message);
  }
}

function showProgress(name) {
  s.ui.progress.classList.remove('hidden');
  s.ui.progressName.textContent = `Downloading ${name}`;
  s.ui.progressText.textContent = 'Starting\u2026';
  s.ui.bar.style.width = '0%';
  s.ui.barTrack.setAttribute('aria-valuenow', '0');
}

const hideProgress = () => s.ui.progress.classList.add('hidden');

async function download(repoId, f) {
  if (isLoadingLocalModel() || s.dlCtrl) { UI.toast('A model is already loading.', 'warning'); return; }
  const ctrl = new AbortController();
  s.dlCtrl = ctrl;
  showProgress(f.name);
  let last = { t: performance.now(), bytes: 0 };
  let speed = 0;
  try {
    await loadLocalModelFromHF({ repo: repoId, file: f.path, sizeBytes: f.sizeBytes }, {
      signal: ctrl.signal,
      onProgress: ({ loaded, total }) => {
        const now = performance.now();
        const dt = (now - last.t) / 1000;
        if (dt >= 0.5) { speed = (loaded - last.bytes) / dt; last = { t: now, bytes: loaded }; }
        const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        s.ui.bar.style.width = `${pct}%`;
        s.ui.barTrack.setAttribute('aria-valuenow', String(pct));
        s.ui.progressText.textContent = `${formatBytes(loaded)} / ${total ? formatBytes(total) : '?'} \u00b7 ${pct}%${speed > 0 ? ` \u00b7 ${formatBytes(speed)}/s` : ''}`;
      },
    });
    UI.toast('\u2705 Model downloaded and loaded', 'success');
    s.dialog.close();
  } catch (err) {
    if (err.code === 'ABORTED') {
      setStatus('Download cancelled.');
    } else {
      const message = `Download failed: ${err.message}. If the repository is gated, accept its license on huggingface.co first.`;
      setStatus(message);
      UI.toast(message, 'error', 8000);
    }
  } finally {
    s.dlCtrl = null;
    hideProgress();
  }
}

function build() {
  const search = el('input', { type: 'search', placeholder: '\ud83d\udd0d Search GGUF models (for example qwen, llama, gemma)\u2026', 'aria-label': 'Search Hugging Face GGUF models', autocomplete: 'off', spellcheck: 'false' });
  search.addEventListener('input', () => {
    clearTimeout(s.searchTimer);
    s.searchTimer = setTimeout(() => { s.query = search.value; showReposMode(); runSearch(true); }, 350);
  });

  const back = el('button', { class: 'btn btn-sm btn-ghost hidden', type: 'button', text: '\u2190 All models', onclick: () => { showReposMode(); runSearch(true); } });
  const status = el('div', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { class: 'hf-list' });
  const more = el('button', { class: 'btn btn-sm hidden', type: 'button', text: 'Load more', onclick: () => runSearch(false) });

  const progressName = el('span');
  const progressText = el('b');
  const bar = el('div');
  const barTrack = el('div', { class: 'hf-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Download progress' }, bar);
  const cancel = el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Cancel download', onclick: () => { if (s.dlCtrl) s.dlCtrl.abort(); } });
  const progress = el('div', { class: 'hf-progress hidden' }, el('div', { class: 'hf-progress-row' }, progressName, progressText), barTrack, cancel);

  const close = el('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close', text: '\u2715', onclick: () => s.dialog.close() });
  const box = el('div', { class: 'hf-box' },
    el('div', { class: 'hf-head' }, el('strong', { id: 'hfTitle', text: '\u2b07 Download a GGUF model from Hugging Face' }), close),
    search, back, status, list, more, progress);

  s.dialog = el('dialog', { class: 'hf-modal', 'aria-labelledby': 'hfTitle' }, box);
  s.dialog.addEventListener('close', () => {
    clearTimeout(s.searchTimer);
    if (s.searchCtrl) s.searchCtrl.abort();
    if (s.dlCtrl) s.dlCtrl.abort();
  });
  document.body.append(s.dialog);
  s.ui = { search, back, status, list, more, progress, progressName, progressText, bar, barTrack };
}

function openDialog() {
  if (typeof HTMLDialogElement === 'undefined') { UI.toast('This browser does not support the download dialog.', 'error'); return; }
  if (!s.dialog) build();
  if (!s.dialog.open) s.dialog.showModal();
  if (!s.ui.list.childElementCount) runSearch(true);
  s.ui.search.focus();
}

function mount() {
  const pick = document.getElementById('localPickBtn');
  if (!pick || document.getElementById('hfDownloadBtn')) return;
  pick.insertAdjacentElement('afterend', el('button', { id: 'hfDownloadBtn', class: 'btn btn-sm', type: 'button', text: '\u2b07 Get from Hugging Face', onclick: openDialog }));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
