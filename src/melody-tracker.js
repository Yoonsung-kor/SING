// Follows the singer through a karaoke mix (accompaniment, guide melody, echo). Moved here unchanged from the
// 2026-11-17 experiment, where it kept within a semitone of the voice in 87-98% of the sung moments of four real
// karaoke recordings (the app's own detector: 27%). Pure; it runs in a worker. Steps:
// 1) spectral peaks per frame  2) each peak votes for the notes it could be a harmonic of (salience)
// 3) the best few notes per frame  4) one smooth path through them, with "no voice" as a choice (dynamic programming)
// 5) notes that sit exactly on the keyboard and do not move are the machine's, and are dropped.

/** The experiment's settings. Change them only after scoring again in the experiment (tmp/karaoke-lab). */
export const TRACKER_DEFAULTS = Object.freeze({
  rate: 16000, window: 1024, fft: 4096, hop: 320,
  lowMidi: 40, highMidi: 84,          // E2..C6: where the singer can be
  minPeakHz: 60, maxPeakHz: 5000, peakFloorDb: 45,
  lowCut: 150, presence: 1.0,          // quieter bass, a lift around 3 kHz where a voice carries
  harmonics: 20, decay: 0.85, compress: 1,
  binCents: 10, lobeCents: 40,
  candidates: 5,
  jumpCost: 0.12, jumpCap: 8,          // per semitone between neighbouring frames
  unvoiced: 0.2, switchCost: 0.3,      // score of "no voice", and the price of switching
  oddReal: 0.25, aliasPenalty: 0.7,    // octave pairs: the lower note wins when its odd harmonics carry at least oddReal of its strength
  minRun: 3,                           // voiced runs shorter than this many frames are dropped
  machineGrid: 8, machineSpread: 50,   // a note within machineGrid cents of the keyboard and moving less than machineSpread cents is the machine's
  noteFrames: 6,                       // ... when it lasts at least this many frames
});

const PROGRESS_EVERY = 200;

/** In-place complex FFT for one power-of-two size. */
function fftPlan(size) {
  const bits = Math.log2(size);
  if (!Number.isInteger(bits)) throw new Error('fft size must be a power of two');
  const reverse = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / size); sin[i] = Math.sin(2 * Math.PI * i / size); }
  return (re, im) => {
    for (let i = 0; i < size; i++) {
      const j = reverse[i];
      if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (let half = 1; half < size; half <<= 1) {
      const step = size / (half << 1);
      for (let start = 0; start < size; start += half << 1) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = -sin[k * step];
          const a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  };
}

/** Per frame: time (window centre), the best notes with their strength. */
function salience(samples, o, onProgress) {
  const { rate, window: size, fft: N, hop } = o;
  const plan = fftPlan(N);
  const hann = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const binHz = rate / N;
  const kMin = Math.max(2, Math.floor(o.minPeakHz / binHz));
  const kMax = Math.min(N / 2 - 2, Math.ceil(o.maxPeakHz / binHz));
  const weight = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) {
    const f = k * binHz;
    weight[k] = (f * f) / (f * f + o.lowCut * o.lowCut) * (1 + o.presence * Math.exp(-(Math.log2(f / 3000) ** 2) / (2 * 0.8 * 0.8)));
  }
  const mag = new Float64Array(N / 2);
  const bins = Math.round((o.highMidi - o.lowMidi) * 100 / o.binCents) + 1;
  const lobe = o.lobeCents / o.binCents;
  const sal = new Float32Array(bins);
  const salOdd = new Float32Array(bins);
  const frames = [];
  const count = Math.max(0, Math.floor((samples.length - size) / hop) + 1);
  for (let n = 0; n < count; n++) {
    if (n % PROGRESS_EVERY === 0) onProgress(n / count);
    const offset = n * hop;
    for (let i = 0; i < size; i++) re[i] = samples[offset + i] * hann[i];
    re.fill(0, size);
    im.fill(0);
    plan(re, im);
    let top = 0;
    for (let k = kMin - 1; k <= kMax + 1; k++) { mag[k] = Math.hypot(re[k], im[k]) * weight[k]; if (mag[k] > top) top = mag[k]; }
    sal.fill(0);
    salOdd.fill(0);
    const floor = top * 10 ** (-o.peakFloorDb / 20);
    if (top > 0) for (let k = kMin; k <= kMax; k++) {
      const m = mag[k];
      if (m < floor || m <= mag[k - 1] || m < mag[k + 1]) continue;
      const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m), c = Math.log(mag[k + 1] + 1e-12);
      const p = 0.5 * (a - c) / (a - 2 * b + c);
      const freq = (k + p) * binHz;
      let w = Math.exp(b - 0.25 * (a - c) * p) ** o.compress;
      for (let h = 1; h <= o.harmonics; h++, w *= o.decay) {
        const pos = (69 + 12 * Math.log2(freq / h / 440) - o.lowMidi) * 100 / o.binCents;
        if (pos < -lobe) break;
        if (pos > bins - 1 + lobe) continue;
        const from = Math.max(0, Math.ceil(pos - lobe));
        const to = Math.min(bins - 1, Math.floor(pos + lobe));
        for (let bin = from; bin <= to; bin++) {
          const shape = Math.cos((bin - pos) / lobe * Math.PI / 2);
          const add = w * shape * shape;
          sal[bin] += add;
          if (h % 2 === 1) salOdd[bin] += add;
        }
      }
    }
    const cands = [];
    for (let bin = 1; bin < bins - 1; bin++) {
      const value = sal[bin];
      if (value <= 0 || value <= sal[bin - 1] || value < sal[bin + 1]) continue;
      if (cands.length === o.candidates && value <= cands[cands.length - 1].sal) continue;
      const curve = sal[bin - 1] - 2 * value + sal[bin + 1];
      const shift = curve < 0 ? 0.5 * (sal[bin - 1] - sal[bin + 1]) / curve : 0;
      const cand = { midi: o.lowMidi + (bin + shift) * o.binCents / 100, sal: value, odd: salOdd[bin] / value };
      let at = cands.length;
      while (at > 0 && cands[at - 1].sal < value) at--;
      cands.splice(at, 0, cand);
      if (cands.length > o.candidates) cands.pop();
    }
    frames.push({ time: (offset + size / 2) / rate, cands });
  }
  return frames;
}

/** One path through the candidates: [{ songTime, midi | null, strength }]. Strength is relative to the recording's loud moments. */
function path(frames, o) {
  const tops = frames.map(frame => frame.cands[0]?.sal ?? 0).filter(value => value > 0).sort((a, b) => a - b);
  const reference = tops.length ? tops[Math.floor(tops.length * 0.95)] : 1;
  const K = o.candidates;
  // Octave pairs: when the lower note of a pair an octave apart has real odd harmonics, the upper one is only its even
  // harmonics (a vowel can make those louder), so the lower note takes the larger strength and the upper one is discounted.
  const weights = frames.map(frame => {
    const w = frame.cands.map(cand => cand.sal);
    if (o.oddReal > 0) frame.cands.forEach((low, i) => frame.cands.forEach((high, j) => {
      if (Math.abs(high.midi - low.midi - 12) > 0.4 || low.odd < o.oddReal) return;
      w[i] = Math.max(w[i], high.sal);
      w[j] = high.sal * o.aliasPenalty;
    }));
    return w;
  });
  const score = frames.map(() => new Float64Array(K + 1).fill(-Infinity));
  const back = frames.map(() => new Int8Array(K + 1).fill(-1));
  frames.forEach((frame, t) => {
    for (let j = 0; j <= K; j++) {
      const voiced = j < K;
      if (voiced && !frame.cands[j]) continue;
      const node = voiced ? weights[t][j] / reference : o.unvoiced;
      if (t === 0) { score[t][j] = node; continue; }
      const before = frames[t - 1];
      let best = -Infinity, arg = -1;
      for (let i = 0; i <= K; i++) {
        const prior = score[t - 1][i];
        if (prior === -Infinity) continue;
        let cost;
        if (i < K && voiced) cost = o.jumpCost * Math.min(Math.abs(frame.cands[j].midi - before.cands[i].midi), o.jumpCap);
        else if (i === K && !voiced) cost = 0;
        else cost = o.switchCost;
        if (prior - cost > best) { best = prior - cost; arg = i; }
      }
      score[t][j] = best + node;
      back[t][j] = arg;
    }
  });
  const out = new Array(frames.length);
  let state = frames.length ? score[frames.length - 1].indexOf(Math.max(...score[frames.length - 1])) : -1;
  for (let t = frames.length - 1; t >= 0; t--) {
    const cand = state < K ? frames[t].cands[state] : null;
    out[t] = { songTime: frames[t].time, midi: cand ? cand.midi : null, strength: cand ? weights[t][state] / reference : 0 };
    state = back[t][state];
  }
  // Very short voiced runs are noise, not notes.
  for (let t = 0; t < out.length;) {
    if (out[t].midi === null) { t++; continue; }
    let end = t;
    while (end < out.length && out[end].midi !== null) end++;
    if (end - t < o.minRun) for (let i = t; i < end; i++) out[i].midi = null;
    t = end;
  }
  if (o.machineGrid > 0) dropMachineNotes(out, o);
  return out;
}

const middle = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

/** A karaoke machine's notes sit exactly on the keyboard's pitches and do not move; a singer's drift and wobble.
 * A note (frames within 0.8 semitone of their neighbours) is dropped when it is on the grid AND still. */
function dropMachineNotes(out, o) {
  for (let start = 0; start < out.length;) {
    if (out[start].midi === null) { start++; continue; }
    let end = start + 1;
    while (end < out.length && out[end].midi !== null && Math.abs(out[end].midi - out[end - 1].midi) <= 0.8) end++;
    const midi = [];
    for (let i = start; i < end; i++) midi.push(out[i].midi);
    if (midi.length >= o.noteFrames) {
      const centre = middle(midi);
      const offGrid = Math.abs(centre - Math.round(centre)) * 100;
      const spread = (Math.max(...midi) - Math.min(...midi)) * 100;
      if (offGrid < o.machineGrid && spread < o.machineSpread) for (let i = start; i < end; i++) out[i].midi = null;
    }
    start = end;
  }
}

/** 16 kHz mono samples to a pitch track: [{ songTime, midi | null, strength }], every 20 ms. */
export function trackMelody(samples, { onProgress = () => {}, ...options } = {}) {
  const o = { ...TRACKER_DEFAULTS, ...options };
  const frames = path(salience(samples, o, onProgress), o);
  onProgress(1);
  return frames;
}
