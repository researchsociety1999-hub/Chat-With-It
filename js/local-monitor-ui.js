/**
 * "Local runtime" card in the Stats panel: CPU pressure, estimated model memory, JS heap, tokens/s.
 * The card is injected above Diagnostics (no index.html change), is visible only for the Local
 * provider, and the sampler runs only while a local model is loaded.
 */

import { AppState } from './state.js';
import { createMonitor, describeCpu, estimateModelMemoryBytes } from './providers/local-monitor.mjs';
import { formatBytes } from './providers/hf-gguf.mjs';
import { getLoadedLocalModel, getLastRun, onLocalChange } from './providers/wllama.js';

const GB = 1024 ** 3;
const monitor = createMonitor();
const refs = {};
let card = null;
let live = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function statRow(label, key) {
  const value = el('span', { text: '\u2014' });
  refs[key] = value;
  return el('div', { class: 'stat-row' }, el('span', { text: label }), value);
}

function barRow(key) {
  const fill = el('div', { class: 'stat-bar', style: 'width:0' });
  refs[key] = fill;
  return el('div', { class: 'stat-bar-wrap' }, fill);
}

function build() {
  const anchor = document.getElementById('stat-diag');
  const diagnosticsCard = anchor && anchor.closest('.card');
  if (!diagnosticsCard || document.getElementById('localRuntimeCard')) return false;

  refs.chart = el('div', { class: 'chart', 'aria-hidden': 'true' });
  refs.cpuNote = el('div', { class: 'rt-note' });
  refs.memNote = el('div', { class: 'rt-note' });
  card = el('div', { id: 'localRuntimeCard', class: 'card hidden', role: 'group', 'aria-label': 'Local runtime' },
    el('div', { class: 'card-title', text: 'Local runtime' }),
    statRow('Status', 'status'),
    statRow('CPU pressure', 'cpu'),
    refs.chart,
    refs.cpuNote,
    statRow('Model memory (est.)', 'mem'),
    barRow('memBar'),
    refs.memNote,
    statRow('JS heap', 'heap'),
    barRow('heapBar'),
    statRow('Speed', 'speed'),
    statRow('First token', 'first'),
    statRow('Load time', 'load'),
    statRow('Engine', 'engine'));
  diagnosticsCard.before(card);
  return true;
}

function render(snap = monitor.getSnapshot()) {
  if (!card) return;
  card.classList.toggle('hidden', AppState.currentProvider !== 'local');

  const model = getLoadedLocalModel();
  refs.status.textContent = model ? '\u25cf Loaded' : '\u25cb No model';

  const cpu = describeCpu(snap.cpu);
  refs.cpu.textContent = cpu.label;
  refs.cpu.setAttribute('data-tone', cpu.tone);
  refs.chart.textContent = '';
  for (const rank of snap.cpu.history) {
    refs.chart.append(el('div', { class: 'chart-bar', style: `height:${6 + rank * 12}px` }));
  }
  refs.cpuNote.textContent = snap.cpu.supported
    ? 'A pressure level for the whole device, not a percentage.'
    : 'CPU pressure is only reported by Chromium desktop browsers.';

  const estimate = estimateModelMemoryBytes(model && model.sizeBytes);
  refs.mem.textContent = estimate ? `\u2248 ${formatBytes(estimate)}` : '\u2014';
  const deviceGb = snap.memory.deviceMemoryGb;
  refs.memBar.style.width = estimate && deviceGb ? `${Math.min(100, Math.round((estimate / (deviceGb * GB)) * 100))}%` : '0';
  refs.memNote.textContent = deviceGb
    ? `Model file plus overhead, against about ${deviceGb} GB of device memory (browsers report at most 8 GB).`
    : 'Model file plus overhead. The browser does not report device memory.';

  const { jsHeapUsed, jsHeapLimit } = snap.memory;
  if (jsHeapUsed != null && jsHeapLimit) {
    refs.heap.textContent = `${formatBytes(jsHeapUsed)} / ${formatBytes(jsHeapLimit)}`;
    refs.heapBar.style.width = `${Math.min(100, Math.round((jsHeapUsed / jsHeapLimit) * 100))}%`;
  } else {
    refs.heap.textContent = 'Not available';
    refs.heapBar.style.width = '0';
  }

  const run = live || getLastRun();
  refs.speed.textContent = run && run.tokensPerSecond ? `${run.tokensPerSecond} tok/s` : '\u2014';
  const last = getLastRun();
  refs.first.textContent = last && last.firstTokenMs != null ? `${last.firstTokenMs} ms` : '\u2014';
  refs.load.textContent = model && model.loadMs ? `${(model.loadMs / 1000).toFixed(1)} s` : '\u2014';
  const rt = model && model.runtime;
  refs.engine.textContent = rt ? `${rt.threads} thread${rt.threads === 1 ? '' : 's'}${rt.webgpu ? ' \u00b7 WebGPU' : ''}` : '\u2014';
}

function init() {
  if (!build()) return;
  monitor.subscribe(render);
  onLocalChange((evt) => {
    if (evt.kind === 'loaded') monitor.start();
    else if (evt.kind === 'loading' || evt.kind === 'unloaded') { live = null; monitor.stop(); }
    else if (evt.kind === 'error' && !getLoadedLocalModel()) { live = null; monitor.stop(); }
    else if (evt.kind === 'generating') live = evt.live;
    else if (evt.kind === 'run') live = null;
    render();
  });
  // app.js owns the tab click; look again after it has switched provider.
  document.querySelectorAll('.ptab').forEach((btn) => {
    btn.addEventListener('click', () => setTimeout(() => render(), 0));
  });
  window.addEventListener('load', () => render());
  if (getLoadedLocalModel()) monitor.start();
  render();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
