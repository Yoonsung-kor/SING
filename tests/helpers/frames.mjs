// A sung pitch track for tests: parts of { d (seconds), midi } where midi is a number, null (silence)
// or t => number (t is the time inside the part). Frames come every `hop` seconds, as the app reads them.
export function sing(parts, { hop = 0.025, start = 0 } = {}) {
  const frames = [];
  let at = start;
  for (const part of parts) {
    const count = Math.round(part.d / hop);
    for (let i = 0; i < count; i++) {
      const local = i * hop;
      const midi = part.midi === null ? null : typeof part.midi === 'function' ? part.midi(local) : part.midi;
      frames.push({ songTime: Math.round((at + local) * 1e6) / 1e6, midi });
    }
    at += count * hop;
  }
  return frames;
}

export const rest = d => ({ d, midi: null });
export const glide = (from, to, d) => t => from + (to - from) * t / d;
