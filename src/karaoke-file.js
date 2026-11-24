// A karaoke recording picked from the phone: checked for size and length, decoded by the browser, and turned into
// 16 kHz mono samples that stay in memory. Nothing here stores or sends the recording.
import { monoAt16k } from './resample.js';

export const FILE_LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, seconds: 600 });

/** 'too-big' before anything is read, or null. */
export const fileProblem = file => (file?.size > FILE_LIMITS.bytes ? 'too-big' : null);

/** The file's length in seconds from its header (an <audio> element reads only the metadata), or null when the
 * browser cannot tell within three seconds. A whole karaoke session saved as one file is then refused before it is
 * decoded: an hour decoded at once can take more memory than a phone gives a page. */
function mediaDuration(file, { timeoutMs = 3000 } = {}) {
  const AudioImpl = globalThis.Audio;
  const urls = globalThis.URL;
  if (typeof AudioImpl !== 'function' || typeof urls?.createObjectURL !== 'function' || typeof Blob === 'undefined' || !(file instanceof Blob)) return Promise.resolve(null);
  return new Promise(resolve => {
    const url = urls.createObjectURL(file);
    const audio = new AudioImpl();
    let timer = null;
    const done = seconds => {
      clearTimeout(timer);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute('src');
      urls.revokeObjectURL(url);
      resolve(seconds);
    };
    timer = setTimeout(() => done(null), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** { samples } at 16 kHz mono, or { problem: 'unreadable' | 'too-long' | 'unsupported' }. The length is checked from
 * the file's header first when the browser can tell; the decoder is asked for 16 kHz (less memory on a phone), and a
 * browser that cannot decodes at its own rate and the samples are resampled. */
export async function decodeToMono(file, { AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext, durationOf = mediaDuration } = {}) {
  if (typeof AudioContextImpl !== 'function') return { problem: 'unsupported' };
  const seconds = await Promise.resolve(durationOf(file)).catch(() => null);
  if (Number.isFinite(seconds) && seconds > FILE_LIMITS.seconds) return { problem: 'too-long' };
  let context;
  try { context = new AudioContextImpl({ sampleRate: 16000 }); }
  catch {
    try { context = new AudioContextImpl(); } catch { return { problem: 'unsupported' }; }
  }
  try {
    let buffer;
    try { buffer = await context.decodeAudioData(await file.arrayBuffer()); }
    catch { return { problem: 'unreadable' }; }
    if (buffer.duration > FILE_LIMITS.seconds) return { problem: 'too-long' };
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return { samples: monoAt16k(channels, buffer.sampleRate) };
  } finally {
    try { await context.close(); } catch { /* already closed */ }
  }
}

/** "1분 12초쯤", or "42초쯤" under a minute. */
export function spotTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}분 ${total % 60}초쯤` : `${total}초쯤`;
}
