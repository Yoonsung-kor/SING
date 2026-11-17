// A karaoke recording picked from the phone: checked for size and length, decoded by the browser, and turned into
// 16 kHz mono samples that stay in memory. Nothing here stores or sends the recording.
import { monoAt16k } from './resample.js';

export const FILE_LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, seconds: 600 });

/** 'too-big' before anything is read, or null. */
export const fileProblem = file => (file?.size > FILE_LIMITS.bytes ? 'too-big' : null);

/** { samples } at 16 kHz mono, or { problem: 'unreadable' | 'too-long' | 'unsupported' }. The decoder is asked
 * for 16 kHz first (less memory on a phone); a browser that cannot, decodes at its own rate and the samples are resampled. */
export async function decodeToMono(file, { AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  if (typeof AudioContextImpl !== 'function') return { problem: 'unsupported' };
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
