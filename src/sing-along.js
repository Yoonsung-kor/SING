// Sing-along measuring: every 50 ms, the note the microphone hears, stamped with the time getTime() gives.
// Nothing is recorded: stop() hands over the frames and lets go of the microphone.
import { MicrophoneLease } from './capture.js';
import { detectPitch, frequencyToMidi } from './pitch.js';

const FRAME_MS = 50;
const CLARITY = 0.85;

/** getTime() returns the playing video's time in seconds, or null while it is not playing (that moment is skipped). */
export function createSingAlong({ lease = new MicrophoneLease(), AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  let generation = 0;
  let context = null;
  let timer = null;
  let frames = [];
  let active = false;

  function stop() {
    generation++;
    clearInterval(timer);
    timer = null;
    lease.release();
    context?.close().catch(() => {});
    context = null;
    active = false;
    const taken = frames;
    frames = [];
    return taken;
  }

  async function start(getTime) {
    if (active) stop();
    const mine = ++generation;
    active = true;
    const stream = await lease.acquire();
    if (mine !== generation || !stream) {
      if (mine === generation) stop();
      else if (stream) lease.release();
      return false;
    }
    context = new AudioContextImpl();
    // Phones may start a context suspended when it is made after the permission prompt; a suspended one hears nothing.
    if (context.state === 'suspended') await context.resume().catch(() => {});
    if (mine !== generation) return false;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(2048);
    const rate = context.sampleRate;
    timer = setInterval(() => {
      const time = getTime();
      if (!Number.isFinite(time)) return;
      analyser.getFloatTimeDomainData(buffer);
      const pitch = detectPitch(buffer, rate);
      frames.push({ time, midi: pitch && pitch.clarity >= CLARITY ? frequencyToMidi(pitch.frequency) : null });
    }, FRAME_MS);
    return true;
  }

  return { start, stop, get active() { return active; } };
}
