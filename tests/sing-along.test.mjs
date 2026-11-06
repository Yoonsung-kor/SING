import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createSingAlong } from '../src/sing-along.js';

// A microphone that hums 220 Hz (2옥 라, MIDI 57) and an audio context that hands those samples to the analyser.
function fakes() {
  const lease = { acquired: 0, released: 0, async acquire() { this.acquired++; return { id: 'stream' }; }, release() { this.released++; } };
  let closed = 0;
  class FakeContext {
    sampleRate = 48000;
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      const rate = this.sampleRate;
      return { fftSize: 0, getFloatTimeDomainData(buffer) { for (let i = 0; i < buffer.length; i++) buffer[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / rate); } };
    }
    close() { closed++; return Promise.resolve(); }
  }
  return { lease, FakeContext, closed: () => closed };
}

test('sing-along: one frame per 50 ms with the song time and the sung note; paused moments are skipped', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const { lease, FakeContext, closed } = fakes();
    const singer = createSingAlong({ lease, AudioContextImpl: FakeContext });
    let songTime = 10;
    assert.equal(await singer.start(() => songTime), true);
    assert.equal(singer.active, true);
    mock.timers.tick(100);
    songTime = null;
    mock.timers.tick(50);
    songTime = 10.2;
    mock.timers.tick(50);
    const frames = singer.stop();
    assert.equal(frames.length, 3);
    assert.deepEqual(frames.map(f => f.time), [10, 10, 10.2]);
    for (const frame of frames) assert.ok(Math.abs(frame.midi - 57) < 0.1, String(frame.midi));
    assert.equal(singer.active, false);
    assert.equal(lease.released, 1);
    assert.equal(closed(), 1);
    mock.timers.tick(200);
    assert.deepEqual(singer.stop(), [], 'nothing after stop');
  } finally { mock.timers.reset(); }
});

test('sing-along: stopping while the microphone is still being asked for leaves nothing running', async () => {
  const { FakeContext } = fakes();
  let resolve;
  const lease = { released: 0, acquire: () => new Promise(r => { resolve = r; }), release() { this.released++; } };
  const singer = createSingAlong({ lease, AudioContextImpl: FakeContext });
  const started = singer.start(() => 0);
  singer.stop();
  resolve({ id: 'late' });
  assert.equal(await started, false);
  assert.equal(singer.active, false);
});

test('sing-along: a context that starts suspended (phones) is resumed before measuring', async () => {
  const { lease } = fakes();
  let resumed = 0;
  class Suspended {
    state = 'suspended'; sampleRate = 48000;
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { getFloatTimeDomainData() {} }; }
    resume() { resumed++; this.state = 'running'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const singer = createSingAlong({ lease, AudioContextImpl: Suspended });
  try {
    assert.equal(await singer.start(() => 0), true);
    assert.equal(resumed, 1);
  } finally { singer.stop(); }
});
