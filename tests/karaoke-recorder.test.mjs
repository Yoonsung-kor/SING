import assert from 'node:assert/strict';
import test from 'node:test';
import { createKaraokeRecorder } from '../src/karaoke-recorder.js';

// A microphone, an audio context with an AudioWorklet, the 'pcm-tap' node and a screen wake lock, all fake.
// feed(seconds) hands the node that much sound in 4096-sample pieces, the way src/pcm-worklet.js posts it.
function fakes({ refuse16k = false, worklet = true } = {}) {
  const log = { contexts: [], closed: 0, modules: [], nodes: [], wakeType: null, wakeReleased: 0 };
  const lease = { acquired: 0, released: 0, async acquire() { this.acquired++; return { id: 'stream' }; }, release() { this.released++; } };
  class FakeContext {
    constructor(options = {}) {
      this.sampleRate = options.sampleRate ?? 48000;
      this.state = 'running';
      this.destination = {};
      if (worklet) this.audioWorklet = { addModule: async url => { log.modules.push(url); } };
      log.contexts.push(this);
    }
    createMediaStreamSource() {
      if (refuse16k && this.sampleRate === 16000) throw new Error('NotSupportedError');
      return { connect() {}, disconnect() {} };
    }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    resume() { return Promise.resolve(); }
    close() { log.closed++; return Promise.resolve(); }
  }
  class FakeNode {
    constructor(context, name) { this.context = context; this.name = name; this.port = { onmessage: null }; log.nodes.push(this); }
    connect() {}
    disconnect() {}
  }
  const wakeLock = { async request(type) { log.wakeType = type; return { release: async () => { log.wakeReleased++; } }; } };
  const feed = seconds => {
    const node = log.nodes.at(-1);
    let left = Math.round(seconds * node.context.sampleRate);
    while (left > 0) {
      const size = Math.min(4096, left);
      node.port.onmessage?.({ data: new Float32Array(size).fill(0.1) });
      left -= size;
    }
  };
  return { lease, FakeContext, FakeNode, wakeLock, log, feed };
}

test('karaoke recorder: collects the tap\'s pieces and hands back 16 kHz mono, then lets go of everything', async () => {
  const { lease, FakeContext, FakeNode, wakeLock, log, feed } = fakes();
  const recorder = createKaraokeRecorder({ lease, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, wakeLock });
  const ticks = [];
  assert.equal(await recorder.start(seconds => ticks.push(seconds)), true);
  assert.equal(recorder.active, true);
  assert.deepEqual(log.modules, ['/src/pcm-worklet.js']);
  assert.equal(log.nodes[0].name, 'pcm-tap');
  assert.equal(log.contexts[0].sampleRate, 16000, '16 kHz is asked for first');
  assert.equal(log.wakeType, 'screen', 'the screen is kept on');
  feed(31);
  assert.deepEqual(ticks, Array.from({ length: 31 }, (_, i) => i + 1), 'one tick per second heard');
  const samples = recorder.stop();
  assert.ok(samples instanceof Float32Array);
  assert.equal(samples.length, 31 * 16000);
  assert.equal(recorder.active, false);
  assert.ok(lease.released >= 1, 'the microphone is let go');
  assert.equal(log.closed, 1);
  assert.equal(log.wakeReleased, 1);
  assert.equal(recorder.stop(), null, 'nothing is kept after stop');
});

test('karaoke recorder: under 30 seconds gives nothing back', async () => {
  const { lease, FakeContext, FakeNode, wakeLock, feed } = fakes();
  const recorder = createKaraokeRecorder({ lease, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, wakeLock });
  await recorder.start();
  feed(29.5);
  assert.equal(recorder.stop(), null);
  assert.ok(lease.released >= 1);
});

test('karaoke recorder: stops by itself at maxSeconds, lets go of the microphone and keeps what it heard', async () => {
  const { lease, FakeContext, FakeNode, wakeLock, log, feed } = fakes();
  const recorder = createKaraokeRecorder({ lease, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, wakeLock, maxSeconds: 40 });
  const ticks = [];
  await recorder.start(seconds => ticks.push({ seconds, active: recorder.active }));
  feed(45);
  assert.equal(recorder.active, false);
  assert.deepEqual(ticks.at(-1), { seconds: 40, active: false }, 'the last tick comes after it stopped');
  assert.ok(lease.released >= 1);
  assert.equal(log.closed, 1);
  assert.equal(recorder.stop().length, 40 * 16000);
});

test('karaoke recorder: records without a wake lock, or when the wake lock is refused', async () => {
  for (const wakeLock of [undefined, { request: () => Promise.reject(new Error('NotAllowedError')) }]) {
    const { lease, FakeContext, FakeNode, feed } = fakes();
    const recorder = createKaraokeRecorder({ lease, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, wakeLock });
    assert.equal(await recorder.start(), true);
    feed(30);
    assert.equal(recorder.stop().length, 30 * 16000);
  }
});

test('karaoke recorder: a browser without AudioWorklet gets false and the microphone is not left on', async () => {
  const noNode = fakes();
  const withoutNode = createKaraokeRecorder({ lease: noNode.lease, AudioContextImpl: noNode.FakeContext, AudioWorkletNodeImpl: undefined, wakeLock: noNode.wakeLock });
  assert.equal(await withoutNode.start(), false);
  assert.equal(noNode.lease.acquired, 0, 'no microphone prompt for a browser that cannot record');
  const noWorklet = fakes({ worklet: false });
  const withoutWorklet = createKaraokeRecorder({ lease: noWorklet.lease, AudioContextImpl: noWorklet.FakeContext, AudioWorkletNodeImpl: noWorklet.FakeNode, wakeLock: noWorklet.wakeLock });
  assert.equal(await withoutWorklet.start(), false);
  assert.equal(withoutWorklet.active, false);
  assert.ok(noWorklet.lease.released >= 1);
  assert.equal(noWorklet.log.closed, 1);
});

test('karaoke recorder: a context that cannot take the microphone at 16 kHz falls back to its own rate, still 16 kHz out', async () => {
  const { lease, FakeContext, FakeNode, wakeLock, log, feed } = fakes({ refuse16k: true });
  const recorder = createKaraokeRecorder({ lease, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, wakeLock });
  assert.equal(await recorder.start(), true);
  assert.deepEqual(log.contexts.map(context => context.sampleRate), [16000, 48000]);
  assert.equal(log.closed, 1, 'the refused context is closed');
  feed(31);
  const samples = recorder.stop();
  assert.ok(Math.abs(samples.length - 31 * 16000) <= 1, String(samples.length));
});

test('karaoke recorder: stopping while the microphone is still being asked for leaves nothing running', async () => {
  const { FakeContext, FakeNode, wakeLock, log } = fakes();
  let resolve;
  const lease = { released: 0, acquire: () => new Promise(r => { resolve = r; }), release() { this.released++; } };
  const recorder = createKaraokeRecorder({ lease, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, wakeLock });
  const started = recorder.start();
  assert.equal(recorder.stop(), null);
  resolve({ id: 'late' });
  assert.equal(await started, false);
  assert.equal(recorder.active, false);
  assert.equal(log.contexts.length, 0, 'no audio context was made');
  assert.ok(lease.released >= 2, 'the late microphone is let go too');
});

test('pcm-tap: posts the first input channel in 4096-sample pieces', async () => {
  const posted = [];
  const registered = {};
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: data => posted.push(data) }; } };
  globalThis.registerProcessor = (name, processor) => { registered[name] = processor; };
  try {
    await import('../src/pcm-worklet.js');
    const tap = new registered['pcm-tap']();
    for (let block = 0; block < 40; block++) {
      const samples = Float32Array.from({ length: 128 }, (_, i) => block * 128 + i);
      assert.equal(tap.process([[samples, new Float32Array(128)]]), true, 'keeps running');
    }
    assert.equal(tap.process([[]]), true, 'an input with no channel is skipped');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].length, 4096);
    assert.equal(posted[0][0], 0);
    assert.equal(posted[0][4095], 4095);
  } finally {
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
  }
});
