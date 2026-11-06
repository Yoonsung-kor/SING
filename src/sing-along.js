// Sing-along measuring: every 50 ms, the note the microphone hears, stamped with where the song is.
// Nothing is recorded: stop() hands over the frames and lets go of the microphone.
import { MicrophoneLease } from './capture.js';
import { detectPitch, frequencyToMidi } from './pitch.js';

const FRAME_MS = 50;
const CLARITY = 0.85;

/** getSongTime() returns the song's time in seconds, or null while the song is not playing (that moment is skipped). */
export function createSingAlong({ lease = new MicrophoneLease(), AudioContextImpl = globalThis.AudioContext } = {}) {
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

  async function start(getSongTime) {
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
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(2048);
    const rate = context.sampleRate;
    timer = setInterval(() => {
      const songTime = getSongTime();
      if (!Number.isFinite(songTime)) return;
      analyser.getFloatTimeDomainData(buffer);
      const pitch = detectPitch(buffer, rate);
      frames.push({ songTime, midi: pitch && pitch.clarity >= CLARITY ? frequencyToMidi(pitch.frequency) : null });
    }, FRAME_MS);
    return true;
  }

  return { start, stop, get active() { return active; } };
}
