/**
 * Live device monitor for the on-device model. Pure module: no DOM, no AppState; every browser API
 * is injectable so it can be tested.
 *
 * What a web page can and cannot see:
 *  - CPU: the Compute Pressure API reports a pressure LEVEL (nominal, fair, serious, critical),
 *    not a percentage, and only in Chromium desktop browsers. The level reflects the whole device.
 *  - Memory: performance.memory (Chromium only) reports the JS heap, which does not include the
 *    WebAssembly memory the model lives in. navigator.deviceMemory is a coarse, capped hint (max 8).
 *    The model's footprint is therefore an estimate from the file size.
 */

export const PRESSURE_LEVELS = ['nominal', 'fair', 'serious', 'critical'];

export function pressureRank(state) {
  return Math.max(0, PRESSURE_LEVELS.indexOf(state));
}

/** Rough resident size: the weights plus about 10% for the KV cache and runtime buffers. */
export function estimateModelMemoryBytes(sizeBytes) {
  const n = Number(sizeBytes) || 0;
  return n > 0 ? Math.round(n * 1.1) : 0;
}

export function readMemory({ perf = globalThis.performance, nav = globalThis.navigator } = {}) {
  const m = perf && perf.memory;
  return {
    jsHeapUsed: m && Number.isFinite(m.usedJSHeapSize) ? m.usedJSHeapSize : null,
    jsHeapLimit: m && Number.isFinite(m.jsHeapSizeLimit) ? m.jsHeapSizeLimit : null,
    deviceMemoryGb: nav && Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
  };
}

/** Human label and colour tone for a CPU snapshot part: { supported, state }. */
export function describeCpu(cpu) {
  if (!cpu || !cpu.supported) return { label: 'Not available', tone: 'muted' };
  if (!cpu.state) return { label: 'Waiting\u2026', tone: 'muted' };
  const table = { nominal: ['Low', 'ok'], fair: ['Moderate', 'ok'], serious: ['High', 'warn'], critical: ['Very high', 'bad'] };
  const [label, tone] = table[cpu.state] || [cpu.state, 'muted'];
  return { label, tone };
}

/**
 * @param {object} [opts]
 * @param {Performance} [opts.perf]
 * @param {Navigator} [opts.nav]
 * @param {Function|null} [opts.PressureObserverCtor] pass null to simulate an unsupported browser
 * @param {number} [opts.intervalMs]
 * @param {number} [opts.historyLength]
 */
export function createMonitor({
  perf,
  nav,
  PressureObserverCtor,
  intervalMs = 1000,
  historyLength = 30,
  setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearIntervalFn = (id) => clearInterval(id),
} = {}) {
  const Ctor = PressureObserverCtor === undefined ? globalThis.PressureObserver : PressureObserverCtor;
  const listeners = new Set();
  const fresh = () => ({
    cpu: { supported: typeof Ctor === 'function', state: null, history: [] },
    memory: readMemory({ perf, nav }),
    heapHistory: [],
  });
  let snap = fresh();
  let timer = null;
  let observer = null;
  let running = false;

  const push = (arr, value) => { arr.push(value); if (arr.length > historyLength) arr.shift(); };

  function getSnapshot() {
    return {
      cpu: { ...snap.cpu, history: [...snap.cpu.history] },
      memory: { ...snap.memory },
      heapHistory: [...snap.heapHistory],
    };
  }

  function notify() {
    const view = getSnapshot();
    for (const fn of listeners) {
      try { fn(view); } catch (_) { /* a broken listener never stops sampling */ }
    }
  }

  function sample() {
    snap.memory = readMemory({ perf, nav });
    if (snap.memory.jsHeapUsed != null) push(snap.heapHistory, snap.memory.jsHeapUsed);
    if (snap.cpu.state) push(snap.cpu.history, pressureRank(snap.cpu.state));
    notify();
  }

  async function start() {
    if (running) return;
    running = true;
    if (typeof Ctor === 'function') {
      try {
        observer = new Ctor((records) => {
          const last = records && records[records.length - 1];
          if (last && last.state) snap.cpu.state = last.state;
        });
        await observer.observe('cpu', { sampleInterval: intervalMs });
      } catch (_) {
        snap.cpu.supported = false;
        observer = null;
      }
    }
    if (!running) {
      if (observer) { try { observer.disconnect(); } catch (_) { /* ignore */ } observer = null; }
      return;
    }
    timer = setIntervalFn(sample, intervalMs);
    sample();
  }

  function stop() {
    running = false;
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    if (observer) { try { observer.disconnect(); } catch (_) { /* ignore */ } observer = null; }
    snap = fresh();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { start, stop, subscribe, getSnapshot, isRunning: () => running };
}
