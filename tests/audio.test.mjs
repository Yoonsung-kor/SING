import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.js';
import { MicrophoneLease } from '../src/capture.js';

class Context {
  state = 'running'; sampleRate = 48000;
  currentTime = 0; destination = {};
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createBufferSource() {
    const source = { playbackRate: {value:1}, started:false, connect(){}, disconnect(){}, start(){this.started=true;}, stop(){} };
    this.source = source;
    return source;
  }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 4096, getFloatTimeDomainData(samples) { samples.fill(0); }, disconnect() {} }; }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
class Recorder {
  static instances = [];
  static isTypeSupported() { return true; }
  constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; Recorder.instances.push(this); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; }
  dispatchStop() { this.onstop?.(); }
}
const mic = () => {
  const track = { stops: 0, onended: null, stop() { this.stops++; } };
  return { track, getTracks: () => [track] };
};
async function tick() { await new Promise(resolve => setImmediate(resolve)); }
function browserAudio(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  globalThis.AudioContext = Context;
  globalThis.MediaRecorder = Recorder;
  Recorder.instances = [];
  t.after(() => { delete globalThis.AudioContext; delete globalThis.MediaRecorder; });
}

test('late recorder stop never releases a replacement recording', async t => {
  browserAudio(t);
  const streams = [mic(), mic()];
  const engine = new AudioEngine();
  engine.lease = new MicrophoneLease({ getUserMedia: async () => streams.shift() });
  t.after(() => { engine.cancel(); Recorder.instances.forEach(r => r.dispatchStop()); });
  const first = engine.record({ duration: 10000 });
  await tick();
  engine.cancel();
  const second = engine.record({ duration: 10000 });
  await tick();
  const active = engine.lease.stream;
  Recorder.instances[0].dispatchStop();
  assert.equal(await first, null);
  assert.equal(active.track.stops, 0, 'old stop must not stop current microphone');
  assert.ok(engine.cancelPending, 'new recording must still be cancellable');
  engine.cancel();
  Recorder.instances[1].dispatchStop();
  assert.equal(await second, null);
});

test('a cancelled permission rejection cannot cancel a new request', async t => {
  browserAudio(t);
  let rejectFirst;
  let requests = 0;
  const active = mic();
  const engine = new AudioEngine();
  engine.lease = new MicrophoneLease({ getUserMedia: () => ++requests === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve(active) });
  t.after(() => { engine.cancel(); Recorder.instances.forEach(r => r.dispatchStop()); });
  const first = engine.record();
  const firstHandled = first.catch(() => null);
  await tick();
  engine.cancel();
  const second = engine.record({ duration: 10000 });
  await tick();
  rejectFirst(new Error('permission denied'));
  await firstHandled;
  assert.equal(active.track.stops, 0);
  engine.cancel();
  Recorder.instances[0].dispatchStop();
  assert.equal(await second, null);
});

test('piano reference plays a recorded buffer at the requested tuning and resolves at note end', async t => {
  browserAudio(t);
  const buffer = { duration: 2 };
  const engine = new AudioEngine({ piano: { load: async () => ({ buffer, playbackRate: 2 ** (1 / 12) }) } });
  t.after(() => engine.cancel());
  const played = engine.tone(61);
  await tick();
  const source = engine.context.source;
  assert.equal(source.buffer, buffer);
  assert.equal(source.started, true);
  assert.equal(source.playbackRate.value, 2 ** (1 / 12));
  source.onended();
  assert.equal(await played, true);
});

test('cancelling a reference while its piano sample loads prevents late sound', async t => {
  browserAudio(t);
  let ready;
  const engine = new AudioEngine({ piano: { load: () => new Promise(resolve => { ready = resolve; }) } });
  const played = engine.tone(60);
  await tick();
  const context = engine.context;
  engine.cancel();
  ready({ buffer: {}, playbackRate: 1 });
  assert.equal(await played, false);
  assert.equal(context.source, undefined);
});
