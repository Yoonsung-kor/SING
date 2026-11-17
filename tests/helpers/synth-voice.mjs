// Test helpers for the melody tracker, copied from the 2026-11-17 karaoke experiment (tmp/karaoke-lab, kept in
// docs/superpowers/plans/karaoke-reference): a synthetic singer whose pitch is known every 5 ms, a plain accompaniment,
// a guide melody, mixing at a chosen loudness, and scoring. The calculations are the experiment's, unchanged;
// tally reads songTime (the tracker's field) as well as time.

export const midiToHz = midi => 440 * 2 ** ((midi - 69) / 12);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A synthetic singer whose pitch is known at every moment: the ground truth for the karaoke experiment.
// It is meant to be harder than a test tone (formants, vibrato, scoops, glides, consonants, echo), not to sound human.

const VOWELS = {
  a: [[800, 80, 1.0], [1150, 90, 0.5], [2900, 120, 0.25], [3900, 130, 0.12]],
  e: [[400, 70, 1.0], [1700, 100, 0.45], [2600, 120, 0.28], [3200, 120, 0.12]],
  i: [[280, 60, 1.0], [2250, 100, 0.35], [2890, 120, 0.3], [3500, 130, 0.12]],
  o: [[450, 70, 1.0], [800, 80, 0.45], [2830, 120, 0.12], [3800, 130, 0.08]],
  u: [[325, 60, 1.0], [700, 80, 0.3], [2700, 120, 0.1], [3800, 130, 0.06]],
};
const SCALE = [0, 2, 4, 5, 7, 9, 11];
export const TRUTH_STEP_S = 0.005;

/** Phrases of 5-9 notes with steps, thirds, drops and a few big upward leaps, then a rest. */
export function makeMelody({ seed = 1, seconds = 60, low = 50, high = 69, key = 0 } = {}) {
  const rand = mulberry32(seed);
  const pitches = [];
  for (let m = low; m <= high; m++) if (SCALE.includes((((m - key) % 12) + 12) % 12)) pitches.push(m);
  const notes = [];
  let t = 0.8;
  let index = Math.floor(pitches.length / 2);
  let phrase = 0;
  while (t < seconds - 4) {
    const count = 5 + Math.floor(rand() * 5);
    for (let n = 0; n < count; n++) {
      const r = rand();
      let move;
      if (n === 0) move = Math.round((rand() - 0.5) * 4);
      else if (r < 0.12) move = 4 + Math.floor(rand() * 3);
      else if (r < 0.2) move = -(3 + Math.floor(rand() * 2));
      else if (r < 0.45) move = rand() < 0.5 ? 2 : -2;
      else move = rand() < 0.5 ? 1 : -1;
      const before = index;
      index = Math.max(0, Math.min(pitches.length - 1, index + move));
      const d = n === count - 1 ? 1.2 + rand() * 1.2 : [0.22, 0.3, 0.4, 0.5, 0.5, 0.7, 0.9][Math.floor(rand() * 7)];
      const gap = n === 0 ? 0 : rand() < 0.55 ? 0.03 + rand() * 0.05 : 0;
      t += gap;
      notes.push({ t, d, midi: pitches[index], vowel: 'aeiou'[Math.floor(rand() * 5)], legato: n > 0 && gap === 0, leap: n > 0 ? pitches[index] - pitches[before] : 0, phrase });
      t += d;
    }
    t += 0.6 + rand() * 1.4;
    phrase++;
  }
  return notes;
}

/** The sung signal and its pitch every 5 ms (midi, 0 where there is no voice). `deviate(note, n)` detunes a note in semitones. */
export function renderVoice(notes, rate, { seed = 7, seconds, deviate = () => 0 } = {}) {
  const rand = mulberry32(seed);
  const total = Math.ceil(seconds * rate);
  const out = new Float32Array(total);
  const step = Math.round(rate * TRUTH_STEP_S);
  const truth = new Float32Array(Math.ceil(total / step));
  const TWO_PI = 2 * Math.PI;
  let phase = 0;
  let previous = null;
  notes.forEach((note, n) => {
    const start = Math.round(note.t * rate);
    const length = Math.round(note.d * rate);
    const target = note.midi + deviate(note, n);
    const vibRate = 5.2 + rand();
    const vibDepth = note.d > 0.45 ? 0.25 + rand() * 0.35 : 0;
    const vibPhase = rand() * TWO_PI;
    const driftPhase = rand() * TWO_PI;
    const driftDepth = 0.05 + rand() * 0.1;
    const scoop = note.legato ? 0 : -(0.4 + rand() * 0.8);
    const from = note.legato ? previous : null;
    const level = 0.6 + 0.4 * rand() + (target - 57) * 0.012;
    const formants = VOWELS[note.vowel];
    const next = notes[n + 1];
    const holds = Boolean(next?.legato);
    let amps = null;
    for (let i = 0; i < length && start + i < total; i++) {
      const time = i / rate;
      let midi = target;
      if (from !== null) { const g = Math.min(1, time / 0.07); midi = from + (target - from) * (0.5 - 0.5 * Math.cos(Math.PI * g)); }
      else midi += scoop * Math.exp(-time / 0.045);
      const vib = vibDepth * Math.min(1, Math.max(0, (time - 0.22) / 0.3));
      midi += vib * Math.sin(TWO_PI * vibRate * time + vibPhase) + driftDepth * Math.sin(TWO_PI * 0.7 * time + driftPhase);
      const f0 = midiToHz(midi);
      phase += TWO_PI * f0 / rate;
      if (phase > TWO_PI) phase -= TWO_PI;
      if (i % 64 === 0) {
        const count = Math.min(40, Math.floor(7500 / f0));
        amps = new Float32Array(count);
        for (let k = 1; k <= count; k++) {
          let gain = 0.03;
          for (const [F, B, A] of formants) gain += A / Math.sqrt(1 + ((k * f0 - F) / (B * 1.2)) ** 2);
          amps[k - 1] = gain / k;
        }
      }
      const attack = note.legato ? 1 : Math.min(1, time / 0.03);
      const release = holds ? 1 : Math.min(1, (note.d - time) / 0.06);
      let sample = 0;
      for (let k = 0; k < amps.length; k++) sample += amps[k] * Math.sin((k + 1) * phase);
      out[start + i] += level * attack * release * sample;
      if ((start + i) % step === 0 && attack * release > 0.25) truth[(start + i) / step] = midi;
    }
    // A consonant: a short hiss just before a note that does not glide in.
    if (n > 0 && !note.legato) {
      const hiss = Math.round(0.035 * rate);
      let last = 0;
      for (let i = Math.max(0, start - hiss); i < start; i++) { const white = rand() * 2 - 1; out[i] += 0.05 * level * (white - last); last = white; }
    }
    previous = target;
  });
  return { samples: out, truth };
}

/** A guide-melody instrument playing the written notes exactly (no vibrato, no detuning). */
export function renderGuide(notes, rate, { seconds, timbre = 'flute' } = {}) {
  const partials = { flute: [1, 0.35, 0.12, 0.05], vibes: [1, 0.08, 0.3, 0.05], lead: [1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14, 0.12, 0.11, 0.1] }[timbre];
  const out = new Float32Array(Math.ceil(seconds * rate));
  for (const note of notes) {
    const f = midiToHz(note.midi);
    const start = Math.round(note.t * rate);
    const length = Math.round(note.d * rate);
    for (let i = 0; i < length && start + i < out.length; i++) {
      const time = i / rate;
      const env = Math.min(1, time / 0.01) * Math.min(1, (note.d - time) / 0.04) * (timbre === 'vibes' ? Math.exp(-time / 0.5) : 1);
      let sample = 0;
      for (let k = 0; k < partials.length; k++) sample += partials[k] * Math.sin(2 * Math.PI * (k + 1) * f * time);
      out[start + i] += env * sample;
    }
  }
  return out;
}

/** A karaoke microphone's echo (a repeating delay) and a small room's first reflections. */
export function karaokeEcho(samples, rate, { delay = 0.17, feedback = 0.4, amount = 0.5 } = {}) {
  const d = Math.round(delay * rate);
  const tail = new Float32Array(samples.length);
  for (let i = d; i < samples.length; i++) tail[i] = feedback * (samples[i - d] + tail[i - d]);
  const base = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) base[i] = samples[i] + amount * tail[i];
  const out = Float32Array.from(base);
  for (const [time, gain] of [[0.013, 0.35], [0.029, 0.28], [0.047, 0.2], [0.071, 0.14]]) {
    const s = Math.round(time * rate);
    for (let i = s; i < out.length; i++) out[i] += gain * base[i - s];
  }
  return out;
}

/** RMS of the parts of a signal that are sounding (10 ms frames above a tenth of the loudest). */
export function activeRms(samples, rate) {
  const size = Math.round(rate * 0.01);
  const levels = [];
  for (let i = 0; i + size <= samples.length; i += size) {
    let sum = 0;
    for (let j = i; j < i + size; j++) sum += samples[j] * samples[j];
    levels.push(sum / size);
  }
  const top = Math.max(...levels);
  const active = levels.filter(level => level > top * 0.01);
  return Math.sqrt(active.reduce((a, b) => a + b, 0) / Math.max(1, active.length));
}

/** voice + accompaniment with the voice `ratioDb` above the accompaniment (while it sounds), scaled to stay under clipping. */
export function mixAt(voice, accompaniment, rate, ratioDb, extras = []) {
  const length = Math.min(voice.length, accompaniment.length);
  const gain = activeRms(accompaniment.subarray(0, length), rate) * 10 ** (ratioDb / 20) / activeRms(voice, rate);
  const mix = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    let value = accompaniment[i] + gain * voice[i];
    for (const extra of extras) value += extra[i] ?? 0;
    mix[i] = value;
    if (Math.abs(value) > peak) peak = Math.abs(value);
  }
  if (peak > 0.9) for (let i = 0; i < length; i++) mix[i] *= 0.9 / peak;
  return mix;
}

const CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];   // C, G, Am, F (roots in octave 2-3)

export function renderBacking(seconds, rate, { seed = 5 } = {}) {
  const rand = mulberry32(seed);
  const out = new Float32Array(Math.ceil(seconds * rate));
  const tone = (midi, from, to, partials, level) => {
    const f = midiToHz(midi);
    for (let i = Math.round(from * rate); i < Math.round(to * rate) && i < out.length; i++) {
      const t = i / rate - from;
      const env = Math.min(1, t / 0.05) * Math.min(1, (to - from - t) / 0.08);
      let sample = 0;
      for (let k = 1; k <= partials; k++) sample += Math.sin(2 * Math.PI * k * f * t) / k;
      out[i] += level * env * sample;
    }
  };
  for (let bar = 0; bar * 2 < seconds; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    for (const midi of chord) tone(midi + 12, bar * 2, bar * 2 + 2, 6, 0.12);   // pad, octave 3-4
    tone(chord[0] - 12, bar * 2, bar * 2 + 1, 8, 0.3);                          // bass, twice a bar
    tone(chord[0] - 12, bar * 2 + 1, bar * 2 + 2, 8, 0.3);
  }
  for (let beat = 0; beat * 0.25 < seconds; beat++) {                           // hi-hat: short noise
    const start = Math.round(beat * 0.25 * rate);
    let last = 0;
    for (let i = start; i < start + Math.round(0.03 * rate) && i < out.length; i++) { const white = rand() * 2 - 1; out[i] += 0.08 * (white - last) * (1 - (i - start) / (0.03 * rate)); last = white; }
  }
  return out;
}

/** Scales a signal so its loud moments (95th percentile of 50 ms frames) sit at 0.1 RMS, as a phone's gain control roughly would. */
export function normalized(samples, rate) {
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

/** Counts over the judged frames. truthAt(time) gives midi, 0 (no voice) or NaN (not judged). */
export function tally(frames, truthAt) {
  const c = { voiced: 0, heard: 0, hit50: 0, hit100: 0, octave: 0, silent: 0, alarm: 0 };
  for (const frame of frames) {
    const truth = truthAt(frame.songTime ?? frame.time);
    if (Number.isNaN(truth)) continue;
    if (truth === 0) { c.silent++; if (frame.midi !== null) c.alarm++; continue; }
    c.voiced++;
    if (frame.midi === null) continue;
    c.heard++;
    const off = Math.abs(frame.midi - truth);
    if (off <= 0.5) c.hit50++;
    if (off <= 1) c.hit100++;
    else if (Math.abs(((frame.midi - truth) % 12 + 18) % 12 - 6) <= 1) c.octave++;
  }
  return c;
}

export const pooled = list => list.reduce((sum, c) => { for (const key of Object.keys(c)) sum[key] = (sum[key] ?? 0) + c[key]; return sum; }, {});

const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;

export const rates = c => ({
  voicedFrames: c.voiced, silentFrames: c.silent,
  within100: pct(c.hit100, c.voiced), within50: pct(c.hit50, c.voiced), heard: pct(c.heard, c.voiced),
  rightWhenHeard: pct(c.hit100, c.heard), octaveSlips: pct(c.octave, c.voiced), falseVoice: pct(c.alarm, c.silent),
});

/** A 5 ms truth track (midi, 0 = no voice, NaN = unknown) as truthAt(): a frame is judged only where its
 * neighbourhood (±guard seconds) is all voice or all silence. */
export function truthFromTrack(truth, stepSeconds, guard = 0.03) {
  const reach = Math.round(guard / stepSeconds);
  const kind = value => Number.isNaN(value) ? 2 : value > 0 ? 1 : 0;
  return time => {
    const index = Math.round(time / stepSeconds);
    if (index < 0 || index >= truth.length) return NaN;
    const here = kind(truth[index]);
    if (here === 2) return NaN;
    for (let i = Math.max(0, index - reach); i <= Math.min(truth.length - 1, index + reach); i++) if (kind(truth[i]) !== here) return NaN;
    return truth[index];
  };
}
