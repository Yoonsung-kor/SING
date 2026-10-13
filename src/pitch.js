/**
 * Experimental monophonic pitch measurements, not a voice-quality diagnosis.
 * Thresholds are prototype settings to validate on the user's Android microphone.
 * Supply roughly one 4096-sample frame per 50 ms; keep null detections in the
 * summary so a short voiced fragment cannot masquerade as a sustained take.
 */
const MIN_FREQUENCY = 70;
const MAX_FREQUENCY = 1000;
// Period interpolation can lie just outside a band edge for an in-range tone.
// Admit at most 5 cents of estimation error there and clamp ONLY to band edges.
const EDGE_TOLERANCE_RATIO = 2 ** (5 / 1200);
const MIN_RMS = 0.008;
const MIN_CLARITY = 0.85;
const MIN_VOICED_FRAMES = 10;
const MIN_VOICED_RATIO = 0.45;
const MAX_CENTRAL_SPREAD_CENTS = 80;
const MAX_MEDIAN_DEVIATION_CENTS = 25;
const MAX_JUMP_CENTS = 300;

const KOREAN_NOTES = ['도', '도♯', '레', '레♯', '미', '파', '파♯', '솔', '솔♯', '라', '라♯', '시'];
const SCIENTIFIC_NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function frequencyToMidi(frequency) {
  return Number.isFinite(frequency) && frequency > 0
    ? 69 + 12 * Math.log2(frequency / 440)
    : NaN;
}

export function midiToFrequency(midi) {
  if (!Number.isFinite(midi)) return NaN;
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  return Number.isFinite(frequency) && frequency > 0 ? frequency : NaN;
}

export function noteName(midi) {
  if (!Number.isFinite(midi)) return null;
  const rounded = Math.round(midi);
  if (!Number.isSafeInteger(rounded)) return null;
  const pitchClass = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  const name = KOREAN_NOTES[pitchClass];
  const scientific = `${SCIENTIFIC_NOTES[pitchClass]}${octave}`;
  return { name, octave, label: `${name} · ${scientific}`, scientific };
}

/**
 * A cumulative-normalized difference detector with interpolated period minima.
 * Averaging before decimation bounds work to about 12000 samples/second. This
 * modest anti-alias filter is intended for isolated humming, not mixed music.
 */
export function detectPitch(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || samples.length < 512
      || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  let sum = 0;
  let sumSquares = 0;
  let clipped = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) return null;
    sum += value;
    sumSquares += value * value;
    if (Math.abs(value) >= 0.999) clipped += 1;
  }
  // Removing DC prevents a constant microphone offset from counting as sound.
  const mean = sum / samples.length;
  const rms = Math.sqrt(Math.max(0, sumSquares / samples.length - mean * mean));
  if (rms < MIN_RMS || clipped / samples.length > 0.05) return null;

  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const reducedRate = sampleRate / stride;
  const length = Math.floor(samples.length / stride);
  const maxLag = Math.ceil(reducedRate / MIN_FREQUENCY) + 1;
  if (maxLag < 3 || length < 2 * maxLag + 1) return null;

  const signal = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    let total = 0;
    for (let j = 0; j < stride; j += 1) total += samples[i * stride + j];
    signal[i] = total / stride - mean;
  }

  // Use equal-size windows at every lag, avoiding a bias toward longer periods.
  const windowLength = length - maxLag;
  const differences = new Float64Array(maxLag + 1);
  const normalized = new Float64Array(maxLag + 1);
  normalized[0] = 1;
  let cumulativeDifference = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let difference = 0;
    for (let i = 0; i < windowLength; i += 1) {
      const delta = signal[i] - signal[i + lag];
      difference += delta * delta;
    }
    differences[lag] = difference;
    cumulativeDifference += difference;
    normalized[lag] = cumulativeDifference > 0
      ? difference * lag / cumulativeDifference
      : 1;
  }

  const candidates = [];
  let bestDifference = Infinity;
  // Also examine periods ABOVE 1000 Hz. If that is the strongest early period,
  // reject it rather than accidentally reporting an in-range subharmonic.
  for (let lag = 2; lag < maxLag; lag += 1) {
    const left = normalized[lag - 1];
    const middle = normalized[lag];
    const right = normalized[lag + 1];
    if (middle > left || middle > right) continue;
    const curvature = left - 2 * middle + right;
    const offset = curvature > 0
      ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature)))
      : 0;
    const value = Math.max(0, middle + (right - left) * offset / 2 + curvature * offset * offset / 2);
    // The cumulative denominator biases normalized parabolic interpolation
    // toward a slightly shorter period. Refine frequency on raw differences.
    const rawCurvature = differences[lag - 1] - 2 * differences[lag] + differences[lag + 1];
    const periodOffset = rawCurvature > 0
      ? Math.max(-0.5, Math.min(0.5, (differences[lag - 1] - differences[lag + 1]) / (2 * rawCurvature)))
      : 0;
    candidates.push({ period: lag + periodOffset, difference: value });
    bestDifference = Math.min(bestDifference, value);
  }
  if (bestDifference > 1 - MIN_CLARITY) return null;

  // Choose the first nearly-best period, not simply the first periodic peak:
  // a louder second harmonic can create a shallower half-period minimum.
  // Never repair a detected octave by referring to a target or previous take.
  const threshold = Math.min(1 - MIN_CLARITY, bestDifference + 0.02);
  const candidate = candidates.find(item => item.difference <= threshold);
  if (!candidate) return null;
  const estimate = reducedRate / candidate.period;
  if (!Number.isFinite(estimate)
      || estimate < MIN_FREQUENCY / EDGE_TOLERANCE_RATIO
      || estimate > MAX_FREQUENCY * EDGE_TOLERANCE_RATIO) return null;
  const frequency = Math.max(MIN_FREQUENCY, Math.min(MAX_FREQUENCY, estimate));
  return { frequency, clarity: Math.min(1, 1 - candidate.difference), rms };
}

function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function unconfirmed(reason) {
  return { reliable: false, midi: null, frequency: null, cents: null, reason };
}

/**
 * A conservative summary of a short single-note attempt. 80-cent central spread,
 * 25-cent median deviation, and 300-cent jumps are experimental acceptance gates;
 * they are not measures of healthy or correct vocal technique.
 * All sampled frames (including silence/null) must be passed to this function.
 */
export function summarizePitch(frames) {
  if (!Array.isArray(frames) || frames.length === 0) return unconfirmed('insufficient-voicing');
  const pitches = [];
  for (const frame of frames) {
    if (frame && Number.isFinite(frame.frequency)
        && frame.frequency >= MIN_FREQUENCY && frame.frequency <= MAX_FREQUENCY
        && Number.isFinite(frame.clarity) && frame.clarity >= MIN_CLARITY && frame.clarity <= 1
        && Number.isFinite(frame.rms) && frame.rms >= MIN_RMS) {
      pitches.push(frequencyToMidi(frame.frequency));
    }
  }
  if (pitches.length < MIN_VOICED_FRAMES || pitches.length / frames.length < MIN_VOICED_RATIO) {
    return unconfirmed('insufficient-voicing');
  }
  // A large temporal jump invalidates the attempt even if only one frame jumps.
  // Ignored frames are never synthesized, shifted by octaves, or imputed.
  for (let i = 1; i < pitches.length; i += 1) {
    if (Math.abs(pitches[i] - pitches[i - 1]) * 100 > MAX_JUMP_CENTS) {
      return unconfirmed('unstable-pitch');
    }
  }
  const sorted = [...pitches].sort((a, b) => a - b);
  const medianMidi = quantile(sorted, 0.5);
  const deviations = pitches.map(value => Math.abs(value - medianMidi) * 100).sort((a, b) => a - b);
  const spread = (quantile(sorted, 0.9) - quantile(sorted, 0.1)) * 100;
  if (spread > MAX_CENTRAL_SPREAD_CENTS || quantile(deviations, 0.5) > MAX_MEDIAN_DEVIATION_CENTS) {
    return unconfirmed('unstable-pitch');
  }
  const midi = Math.round(medianMidi);
  return {
    reliable: true,
    midi,
    frequency: midiToFrequency(medianMidi),
    cents: (medianMidi - midi) * 100,
    reason: 'stable',
  };
}
