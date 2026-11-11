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

// The analyser hears a steady D3 (146.83 Hz) on the reads where `voiced(read)` is true, silence otherwise.
function humWhen(voiced) {
  let reads = 0;
  globalThis.AudioContext = class extends Context {
    createAnalyser() {
      return { fftSize: 4096, disconnect() {}, getFloatTimeDomainData(samples) {
        if (!voiced(reads++)) { samples.fill(0); return; }
        for (let i = 0; i < samples.length; i++) samples[i] = 0.1 * Math.sin(2 * Math.PI * 146.83 * i / 48000);
      } };
    }
  };
}
const humAfter = silentReads => humWhen(read => read >= silentReads);
async function advance(t, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 60) { t.mock.timers.tick(60); await tick(); }
}

test('on a phone it takes a moment to start humming: the three seconds start when the voice does', async t => {
  browserAudio(t);
  delete globalThis.MediaRecorder;
  humAfter(34); // about two seconds before the hum starts
  const engine = new AudioEngine();
  engine.lease = new MicrophoneLease({ getUserMedia: async () => mic() });
  t.after(() => engine.cancel());
  const recording = engine.record();
  await tick();
  await advance(t, 5400);
  const result = await recording;
  assert.equal(result.measurement.reliable, true, result.measurement.reason);
  assert.equal(result.measurement.midi, 50);
});

test('a blip of noise before the hum does not start the three seconds (seen on a phone)', async t => {
  browserAudio(t);
  delete globalThis.MediaRecorder;
  humWhen(read => read === 5 || read === 6 || read >= 40); // two noisy reads, then the hum at about 2.4 s
  const engine = new AudioEngine();
  engine.lease = new MicrophoneLease({ getUserMedia: async () => mic() });
  t.after(() => engine.cancel());
  const recording = engine.record();
  await tick();
  await advance(t, 6000);
  const result = await recording;
  assert.equal(result.measurement.reliable, true, result.measurement.reason);
  assert.equal(result.measurement.midi, 50);
});

test('with no voice the recording waits a little longer, then says it could not hear enough', async t => {
  browserAudio(t);
  delete globalThis.MediaRecorder;
  humAfter(Infinity);
  const engine = new AudioEngine();
  engine.lease = new MicrophoneLease({ getUserMedia: async () => mic() });
  t.after(() => engine.cancel());
  let settled = false;
  const recording = engine.record().then(result => { settled = true; return result; });
  await tick();
  await advance(t, 3600);
  assert.equal(settled, false, 'still listening for a voice after three seconds');
  await advance(t, 900);
  const result = await recording;
  assert.equal(result.measurement.reliable, false);
  assert.equal(result.measurement.reason, 'insufficient-voicing');
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
