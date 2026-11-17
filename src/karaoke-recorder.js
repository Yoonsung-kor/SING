// Recording at the karaoke room inside the app (plan N Task 7): the microphone's sound is kept in memory as it
// arrives and handed back as 16 kHz mono when the singing stops. Nothing is stored or sent. The screen is kept on
// while it records; the page stops the recording itself when the screen is left (see app.js).
import { MicrophoneLease } from './capture.js';
import { monoAt16k } from './resample.js';

const WORKLET_URL = '/src/pcm-worklet.js';
// Shorter than this is not a song; nothing is handed back.
const MIN_SECONDS = 30;

/** Opens an audio context on the stream: 16 kHz first (a third of the memory), else the context's own rate. */
function openContext(AudioContextImpl, stream) {
  for (const options of [{ sampleRate: 16000 }, null]) {
    let context = null;
    try {
      context = options ? new AudioContextImpl(options) : new AudioContextImpl();
      return { context, source: context.createMediaStreamSource(stream) };
    } catch (error) {
      context?.close?.().catch?.(() => {});
      if (!options) throw error;
    }
  }
  return null;
}

/**
 * start(onTick) resolves true once recording (false when this browser cannot record, or it was stopped meanwhile);
 * onTick(seconds) follows the sound heard, once a second. At maxSeconds it stops by itself (active turns false
 * before that last tick) and keeps the sound until stop(). stop() lets go of everything and returns the sound as
 * 16 kHz mono, or null under 30 seconds.
 */
export function createKaraokeRecorder({
  lease = new MicrophoneLease(),
  AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  AudioWorkletNodeImpl = globalThis.AudioWorkletNode,
  wakeLock = globalThis.navigator?.wakeLock,
  maxSeconds = 600,
} = {}) {
  let generation = 0;
  let context = null;
  let node = null;
  let screen = null;
  let pieces = [];
  let heard = 0;
  let rate = 0;
  let active = false;

  /** The microphone, the context and the screen lock go; what was heard stays until stop(). */
  function letGo() {
    lease.release();
    if (node) node.port.onmessage = null;
    context?.close().catch(() => {});
    screen?.release?.().catch?.(() => {});
    context = node = screen = null;
    active = false;
  }

  function stop() {
    generation++;
    letGo();
    const taken = pieces;
    const length = heard;
    pieces = [];
    heard = 0;
    if (!rate || length < MIN_SECONDS * rate) return null;
    const all = new Float32Array(length);
    let offset = 0;
    for (const piece of taken) {
      all.set(piece, offset);
      offset += piece.length;
    }
    return monoAt16k([all], rate);
  }

  function take(piece, onTick) {
    const limit = Math.round(maxSeconds * rate);
    const kept = piece.length > limit - heard ? piece.subarray(0, limit - heard) : piece;
    const before = Math.floor(heard / rate);
    pieces.push(kept);
    heard += kept.length;
    const after = Math.floor(heard / rate);
    if (heard >= limit) letGo();
    if (after > before) onTick(after);
  }

  async function start(onTick = () => {}) {
    if (active) stop();
    if (!AudioContextImpl || !AudioWorkletNodeImpl) return false;
    const mine = ++generation;
    active = true;
    pieces = [];
    heard = 0;
    rate = 0;
    let stream;
    try {
      stream = await lease.acquire();
    } catch (error) {
      if (mine === generation) active = false;
      throw error;
    }
    if (mine !== generation || !stream) {
      if (mine === generation) stop();
      else if (stream) lease.release();
      return false;
    }
    const opened = openContext(AudioContextImpl, stream);
    context = opened.context;
    if (context.state === 'suspended') await context.resume().catch(() => {});
    if (mine !== generation) return false;
    if (!context.audioWorklet) { stop(); return false; }
    try {
      await context.audioWorklet.addModule(WORKLET_URL);
    } catch (error) {
      if (mine === generation) stop();
      throw error;
    }
    if (mine !== generation) return false;
    rate = context.sampleRate;
    node = new AudioWorkletNodeImpl(context, 'pcm-tap');
    node.port.onmessage = ({ data }) => { if (mine === generation && active) take(data, onTick); };
    opened.source.connect(node);
    // The tap is pulled through a silent gain, so it runs on every browser and nothing is heard.
    const silent = context.createGain();
    silent.gain.value = 0;
    node.connect(silent);
    silent.connect(context.destination);
    let lock = null;
    try { lock = (await wakeLock?.request('screen')) ?? null; } catch { lock = null; }
    if (mine !== generation || !active) { lock?.release?.().catch?.(() => {}); return mine === generation; }
    screen = lock;
    return true;
  }

  return { start, stop, get active() { return active; } };
}
