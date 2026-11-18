// A karaoke recording's report, made on the phone: the melody tracker follows the singer through the mix, the
// report keeps only long high notes (the one kind of spot that held up in the mix in the 2026-11-17 experiment),
// and the long notes sung give a range that can suggest a new comfortable top. Pure; it runs in a worker.
import { trackMelody } from './melody-tracker.js';
import { leveled } from './resample.js';
import { findSpots, notesOf, SPOT_RULES } from './hard-spots.js';

// "Kept" for the range: held this long, end within rules.keep of the start.
const KEPT_FOR = 0.8;
// A new comfortable top is suggested only this far above the current one at most.
const SUGGEST_MAX = 4;
// The first voice: the first sound held this long (a cough or a click before it is skipped).
const FIRST_VOICE_FOR = 0.3;

/** The second highest (rounded) pitch: a value found only once may be the tracker's slip. */
function secondHighest(values) {
  const sorted = values.map(Math.round).sort((a, b) => b - a);
  return sorted.length >= 2 ? sorted[1] : null;
}

/** What the long notes reached: topHeld among notes held `held` seconds, keptHigh among notes kept steady 0.8 s. */
export function sungRange(notes, rules = SPOT_RULES) {
  const length = note => note.end - note.start;
  const held = notes.filter(note => length(note) >= rules.held - 1e-9);
  const kept = notes.filter(note => length(note) >= KEPT_FOR - 1e-9 && Math.abs(note.first - note.last) < rules.keep);
  return { topHeld: secondHighest(held.map(note => note.midi)), keptHigh: secondHighest(kept.map(note => note.midi)) };
}

/** A new comfortable top worth asking about: a little above the current one, never set by itself. */
export function suggestHigh({ keptHigh, current }) {
  if (!Number.isInteger(keptHigh) || !Number.isFinite(current)) return null;
  const above = keptHigh - current;
  return above > 0 && above <= SUGGEST_MAX ? keptHigh : null;
}

/** When the singing starts: the start of the first run of voiced frames lasting 0.3 s, or null. */
export function firstVoice(frames) {
  const step = frames.length > 1 ? frames[1].songTime - frames[0].songTime : 0.02;
  let start = null;
  let count = 0;
  for (const frame of frames) {
    if (frame.midi === null || frame.midi === undefined) { start = null; count = 0; continue; }
    if (start === null) start = frame.songTime;
    count++;
    if (count * step >= FIRST_VOICE_FOR - 1e-9) return start;
  }
  return null;
}

/** 16 kHz mono samples of a karaoke take to its report. */
export function analyzeKaraoke(samples, { comfortableHighMidi = null, onProgress = () => {} } = {}) {
  const frames = trackMelody(leveled(samples), { onProgress });
  const result = findSpots(frames, { comfortableHighMidi, source: 'karaoke' });
  if (result.status === 'short') return result;
  const range = sungRange(notesOf(frames));
  return { status: 'ok', voicedSeconds: result.voicedSeconds, spots: result.spots, range, suggestion: suggestHigh({ keptHigh: range.keptHigh, current: comfortableHighMidi }), firstVoice: firstVoice(frames) };
}
