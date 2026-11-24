import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMonitor,
  describeCpu,
  estimateModelMemoryBytes,
  pressureRank,
  readMemory,
} from '../js/providers/local-monitor.mjs';
import {
  setEngineLoader,
  loadLocalModel,
  onLocalChange,
  wllamaAdapter,
  __resetLocalEngineForTests,
} from '../js/providers/wllama.js';

class FakeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.disconnected = false;
    FakeObserver.last = this;
  }
  async observe(source, options) { this.observed.push([source, options]); }
  disconnect() { this.disconnected = true; }
}

function harness(extra = {}) {
  let tick = null;
  const clearIntervalFn = vi.fn();
  const monitor = createMonitor({
    perf: { memory: { usedJSHeapSize: 50, jsHeapSizeLimit: 500 } },
    nav: { deviceMemory: 8 },
    PressureObserverCtor: FakeObserver,
    setIntervalFn: (fn) => { tick = fn; return 7; },
    clearIntervalFn,
    ...extra,
  });
  return { monitor, clearIntervalFn, tick: () => tick() };
}

describe('createMonitor', () => {
  it('observes CPU pressure and samples memory on every tick', async () => {
    const { monitor, tick } = harness();
    const seen = [];
    monitor.subscribe((s) => seen.push(s));
    await monitor.start();
    expect(FakeObserver.last.observed[0]).toEqual(['cpu', { sampleInterval: 1000 }]);

    FakeObserver.last.callback([{ state: 'nominal' }, { state: 'fair' }]);
    tick();
    const snap = monitor.getSnapshot();
    expect(snap.cpu).toMatchObject({ supported: true, state: 'fair', history: [1] });
    expect(snap.memory).toEqual({ jsHeapUsed: 50, jsHeapLimit: 500, deviceMemoryGb: 8 });
    expect(snap.heapHistory.length).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('keeps a bounded history', async () => {
    const { monitor, tick } = harness({ historyLength: 3 });
    await monitor.start();
    FakeObserver.last.callback([{ state: 'serious' }]);
    for (let i = 0; i < 6; i += 1) tick();
    expect(monitor.getSnapshot().cpu.history).toEqual([2, 2, 2]);
  });

  it('stops cleanly and forgets its samples', async () => {
    const { monitor, clearIntervalFn } = harness();
    await monitor.start();
    FakeObserver.last.callback([{ state: 'critical' }]);
    monitor.stop();
    expect(FakeObserver.last.disconnected).toBe(true);
    expect(clearIntervalFn).toHaveBeenCalledWith(7);
    expect(monitor.getSnapshot().cpu.state).toBeNull();
    expect(monitor.isRunning()).toBe(false);
  });

  it('reports CPU as unsupported but still samples memory', async () => {
    const { monitor } = harness({ PressureObserverCtor: null });
    await monitor.start();
    const snap = monitor.getSnapshot();
    expect(snap.cpu.supported).toBe(false);
    expect(snap.memory.jsHeapUsed).toBe(50);
  });

  it('falls back to unsupported when observing is refused', async () => {
    class Refusing { async observe() { throw new Error('NotAllowedError'); } disconnect() {} }
    const { monitor } = harness({ PressureObserverCtor: Refusing });
    await monitor.start();
    expect(monitor.getSnapshot().cpu.supported).toBe(false);
  });

  it('does not start twice', async () => {
    const { monitor } = harness();
    await monitor.start();
    const first = FakeObserver.last;
    await monitor.start();
    expect(FakeObserver.last).toBe(first);
  });
});

describe('helpers', () => {
  it('ranks and describes pressure levels', () => {
    expect(pressureRank('nominal')).toBe(0);
    expect(pressureRank('critical')).toBe(3);
    expect(pressureRank('???')).toBe(0);
    expect(describeCpu({ supported: true, state: 'nominal' })).toEqual({ label: 'Low', tone: 'ok' });
    expect(describeCpu({ supported: true, state: 'serious' })).toEqual({ label: 'High', tone: 'warn' });
    expect(describeCpu({ supported: true, state: 'critical' })).toEqual({ label: 'Very high', tone: 'bad' });
    expect(describeCpu({ supported: true, state: null }).label).toMatch(/Waiting/);
    expect(describeCpu({ supported: false })).toEqual({ label: 'Not available', tone: 'muted' });
  });

  it('estimates model memory from the file size', () => {
    expect(estimateModelMemoryBytes(1000)).toBe(1100);
    expect(estimateModelMemoryBytes(0)).toBe(0);
    expect(estimateModelMemoryBytes(undefined)).toBe(0);
  });

  it('tolerates browsers without memory APIs', () => {
    expect(readMemory({ perf: {}, nav: {} })).toEqual({ jsHeapUsed: null, jsHeapLimit: null, deviceMemoryGb: null });
  });
});

describe('live tokens per second', () => {
  beforeEach(() => __resetLocalEngineForTests());
  afterEach(() => __resetLocalEngineForTests());

  it('emits generating events while streaming', async () => {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => { t += 600; return t; });
    class FakeWllama {
      async loadModel() {}
      async exit() {}
      isMultithread() { return false; }
      getNumThreads() { return 1; }
      isSupportWebGPU() { return false; }
      async createChatCompletion() {
        async function* generate() {
          for (const token of ['a', 'b', 'c', 'd']) yield { choices: [{ delta: { content: token } }] };
        }
        return generate();
      }
    }
    setEngineLoader(async () => ({ Wllama: FakeWllama, config: {} }));
    const model = await loadLocalModel(new File(['GGUF'], 'tiny-1b.gguf'));
    const events = [];
    onLocalChange((e) => events.push(e));
    await wllamaAdapter.streamChat({ modelId: model.id, messages: [{ role: 'user', content: 'hi' }] });
    const generating = events.filter((e) => e.kind === 'generating');
    expect(generating.length).toBeGreaterThan(0);
    expect(generating[0].live.tokens).toBeGreaterThan(1);
    expect(generating[0].live.tokensPerSecond).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'run')).toBe(true);
  });
});
