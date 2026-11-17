// Any recording to what the melody tracker reads: one channel at 16 kHz, at a steady level.
// Both steps are the 2026-11-17 experiment's: this resampler scored the same as ffmpeg's there (within 0.3 points).
const TARGET = 16000;

/** Channels (same length) averaged into one, then read at 16 kHz: a moving average as wide as one output
 * sample, then linear interpolation. 16 kHz input is only averaged. */
export function monoAt16k(channels, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new Error(`sample rate ${sampleRate} is not supported`);
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  const ratio = sampleRate / TARGET;
  // Already 16 kHz: only the averaging of channels (a running sum would add rounding noise for nothing).
  if (ratio === 1) return mono;
  const width = Math.max(1, Math.round(ratio));
  const smooth = new Float32Array(length);
  let sum = 0;
  for (let i = 0; i < length; i++) { sum += mono[i]; if (i >= width) sum -= mono[i - width]; smooth[i] = sum / Math.min(i + 1, width); }
  const out = new Float32Array(Math.floor(length / ratio));
  for (let n = 0; n < out.length; n++) {
    const position = n * ratio + (width - 1) / 2;
    const i = Math.min(length - 1, Math.floor(position));
    const j = Math.min(length - 1, i + 1);
    out[n] = smooth[i] + (smooth[j] - smooth[i]) * (position - i);
  }
  return out;
}

/** The recording's loud moments (95th percentile of 50 ms pieces) brought to 0.1 RMS, never past 0.95. */
export function leveled(samples, rate = TARGET) {
  const size = Math.round(rate * 0.05);
  const levels = [];
  for (let i = 0; i + size <= samples.length; i += size) {
    let sum = 0;
    for (let j = i; j < i + size; j++) sum += samples[j] * samples[j];
    levels.push(Math.sqrt(sum / size));
  }
  levels.sort((a, b) => a - b);
  const loud = levels[Math.floor(levels.length * 0.95)] || 1;
  let peak = 0;
  for (const v of samples) if (Math.abs(v) > peak) peak = Math.abs(v);
  const gain = Math.min(0.1 / loud, 0.95 / (peak || 1));
  return Float32Array.from(samples, v => v * gain);
}
