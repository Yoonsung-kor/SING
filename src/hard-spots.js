// The report's spots: the demanding places in a sung pitch track (a big leap up, a long high note, a note above the
// comfortable top) and how each one went (kept, sagged, or a break to ask about). The app decides all of it here;
// the AI only words it. Pure, and it does not depend on how often the pitch was read (25 ms or 20 ms frames).
import { koreanNote } from './notes.js';

/** Starting values, set against four real songs (2026-11-17); to be re-checked against clean recordings. */
export const SPOT_RULES = Object.freeze({
  noteStep: 0.8, band: 1.5, bridge: 0.11, minNote: 0.15, edge: 0.06,
  leapMin: 5, leapMax: 12.5, leapGap: 1.0, leapFrom: 0.2, leapTo: 0.3,
  held: 0.6, sag: 0.6, keep: 0.35, keepFor: 0.4,
  breakMax: 0.6, breakPitch: 1,
  overComfort: 2, overFar: 7, overFarFor: 0.6, nearComfort: 1,
  minVoiced: 20, maxSpots: 3, apart: 5, sameKind: 2,
});

const EPS = 1e-9;
// A note above the comfortable top must last this long to count (longer still when it is far above: overFarFor).
const OVER_FOR = 0.3;
// The same spot in two choruses: as far apart as this from each chorus's start.
const SAME_PLACE = 1.5;
// A lyric line is named only while the spot is this close to its start (the same 7 s a line gets elsewhere).
const LINE_REACH = 7;

const round = value => Math.round(value * 1e6) / 1e6;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const sounding = frame => Boolean(frame) && Number.isFinite(frame.midi);
const nameOf = midi => koreanNote(Math.round(midi)) || null;

/** The time between pitch readings: the usual step between neighbouring frames. */
function hopOf(frames) {
  if (frames.length < 2) return 0.05;
  const steps = [];
  for (let i = 1; i < frames.length; i++) steps.push(frames[i].songTime - frames[i - 1].songTime);
  return median(steps);
}

/** Notes: runs of sounding frames that stay together. A run ends at a jump, at a silence longer than `bridge`
 * (unless it returns to the same pitch soon: a break), or when its range would pass `band`. */
export function notesOf(frames, rules = SPOT_RULES) {
  const list = Array.isArray(frames) ? frames : [];
  const hop = hopOf(list);
  const runs = [];
  let run = null;
  let last = null;
  for (const frame of list) {
    if (!sounding(frame)) continue;
    const midi = frame.midi;
    if (run) {
      const gap = frame.songTime - last.songTime - hop;
      const step = Math.abs(midi - last.midi);
      const fits = Math.max(run.high, midi) - Math.min(run.low, midi) <= rules.band + EPS;
      const joined = gap <= rules.bridge + EPS && step <= rules.noteStep + EPS;
      const broken = !joined && gap > rules.bridge + EPS && gap <= rules.breakMax + EPS && step <= rules.breakPitch + EPS;
      if (fits && (joined || broken)) {
        if (broken) run.breaks.push({ at: round(last.songTime + hop), seconds: round(gap) });
        run.frames.push(frame);
        run.high = Math.max(run.high, midi);
        run.low = Math.min(run.low, midi);
        last = frame;
        continue;
      }
      runs.push(run);
    }
    run = { frames: [frame], high: midi, low: midi, breaks: [] };
    last = frame;
  }
  if (run) runs.push(run);
  return runs.map(item => shape(item, hop, rules)).filter(note => note.end - note.start >= rules.minNote - EPS);
}

/** Start, end, middle pitch, and the pitch of each third without the first and last `edge` seconds. */
function shape(run, hop, rules) {
  const values = run.frames.map(frame => frame.midi);
  const start = run.frames[0].songTime;
  const lastTime = run.frames.at(-1).songTime;
  const inner = run.frames.filter(frame => frame.songTime >= start + rules.edge - EPS && frame.songTime <= lastTime - rules.edge + EPS).map(frame => frame.midi);
  const body = inner.length >= 6 ? inner : values;
  const third = Math.floor(body.length / 3);
  const midi = median(values);
  const [first, middle, last] = third >= 2
    ? [body.slice(0, third), body.slice(third, body.length - third), body.slice(body.length - third)].map(median)
    : [midi, midi, midi];
  return { start: round(start), end: round(lastTime + hop), midi, first, middle, last, low: run.low, high: run.high, breaks: run.breaks };
}

/** 'sag' (drifted down, the middle on the way), 'ask' (a break in a demanding note), 'kept' (held), or null. */
function outcomeOf(note, { kind, high, length, source, rules }) {
  const drop = note.first - note.last;
  const onTheWay = note.middle <= note.first - 0.25 * drop + EPS && note.middle >= note.last + 0.25 * drop - EPS;
  if (length >= rules.held - EPS && drop >= rules.sag - EPS && onTheWay) return 'sag';
  if (source === 'clean' && note.breaks.length && (kind === 'leap' || high)) return 'ask';
  if (length >= rules.keepFor - EPS && Math.abs(drop) < rules.keep && !note.breaks.length) return 'kept';
  return null;
}

function scoreOf(spot) {
  const base = spot.kind === 'leap' ? 4 + spot.rise / 3
    : spot.kind === 'high-hold' ? 2 + Math.min(spot.length, 3) + Math.min(spot.over ?? 0, 7) / 2
    : 1 + Math.min(spot.over, 7) / 2;
  return base + (spot.outcome === 'sag' ? 4 : spot.outcome === 'ask' ? 1 : 0) + (spot.repeated ? 2 : 0);
}

function sectionAt(sections, time) {
  let label = '';
  for (const section of Array.isArray(sections) ? sections : []) if (section.t <= time + 0.05) label = section.label;
  return label;
}

/** The lyric line the time falls in, if it has words and began at most 7 s before (also the karaoke report's rule). */
export function lineAt(lines, time) {
  const list = Array.isArray(lines) ? lines : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].t > time + EPS) continue;
    return list[i].text && time - list[i].t <= LINE_REACH ? i : null;
  }
  return null;
}

/** Every demanding note before any choosing: its kind, how it went, and what choosing needs (rise, length). */
export function spotCandidates(notes, { comfortableHighMidi = null, source = 'clean', rules = SPOT_RULES } = {}) {
  const comfort = Number.isFinite(comfortableHighMidi) ? comfortableHighMidi : null;
  // Without a comfortable top, the top three semitones of what was sung count as high, measured from the long notes:
  // one short slip (a detector's octave jump, a squeak) must not lift the bar over every real high note.
  const long = notes.filter(note => note.end - note.start >= rules.held - EPS);
  const highFrom = comfort !== null ? comfort - rules.nearComfort : Math.max(...(long.length ? long : notes).map(note => note.midi)) - 3;
  const candidates = [];
  notes.forEach((note, i) => {
    const prev = notes[i - 1];
    const length = note.end - note.start;
    const rise = prev ? note.midi - prev.last : 0;
    const leap = Boolean(prev) && note.start - prev.end <= rules.leapGap + EPS && rise >= rules.leapMin - EPS && rise <= rules.leapMax + EPS
      && prev.end - prev.start >= rules.leapFrom - EPS && length >= rules.leapTo - EPS;
    const high = note.midi >= highFrom - EPS;
    const above = comfort !== null ? Math.round(note.midi) - comfort : null;
    const over = above !== null && above >= rules.overComfort && length >= (above > rules.overFar ? rules.overFarFor : OVER_FOR) - EPS ? above : null;
    let kind = leap ? 'leap' : high && length >= rules.held - EPS ? 'high-hold' : over !== null ? 'over' : null;
    if (source === 'karaoke' && kind !== 'high-hold') kind = null;
    if (!kind) return;
    candidates.push({ kind, outcome: outcomeOf(note, { kind, high, length, source, rules }), time: note.start, end: note.end, from: kind === 'leap' ? nameOf(prev.midi) : null, to: nameOf(note.midi), over, rise, length, repeated: false });
  });
  return candidates;
}

export function findSpots(frames, { comfortableHighMidi = null, sections = [], lines = [], source = 'clean', rules = SPOT_RULES } = {}) {
  const list = Array.isArray(frames) ? frames : [];
  const voicedSeconds = round(list.filter(sounding).length * hopOf(list));
  if (voicedSeconds < rules.minVoiced) return { status: 'short', voicedSeconds };
  const candidates = spotCandidates(notesOf(list, rules), { comfortableHighMidi, source, rules });

  // The same spot in two choruses is told once, as happening both times.
  const choruses = (Array.isArray(sections) ? sections : []).map((section, i) => ({ ...section, until: sections[i + 1]?.t ?? Infinity })).filter(section => section.kind === 'chorus');
  const chorusOf = time => choruses.findIndex(chorus => chorus.t <= time + 0.05 && time + 0.05 < chorus.until);
  const distinct = [];
  for (const spot of candidates) {
    const chorus = chorusOf(spot.time);
    const offset = chorus >= 0 ? spot.time - choruses[chorus].t : null;
    const twin = chorus < 0 ? null : distinct.find(other => other.chorus >= 0 && other.chorus !== chorus && other.kind === spot.kind && other.outcome === spot.outcome && Math.abs(other.offset - offset) <= SAME_PLACE);
    if (twin) { twin.repeated = true; continue; }
    distinct.push({ ...spot, chorus, offset });
  }

  // Strongest first; five seconds apart; two of a kind; three in all.
  const ranked = distinct.map(spot => ({ ...spot, score: scoreOf(spot) })).sort((a, b) => b.score - a.score || a.time - b.time);
  const fits = (spot, among) => among.every(other => Math.abs(other.time - spot.time) >= rules.apart - EPS) && among.filter(other => other.kind === spot.kind).length < rules.sameKind;
  const chosen = [];
  for (const spot of ranked) {
    if (chosen.length >= rules.maxSpots) break;
    if (fits(spot, chosen)) chosen.push(spot);
  }
  // Three spots and none of them went well: the best well-sung one takes the weakest place.
  if (chosen.length === rules.maxSpots && !chosen.some(spot => spot.outcome === 'kept')) {
    const good = ranked.find(spot => spot.outcome === 'kept' && !chosen.includes(spot) && fits(spot, chosen.slice(0, 2)));
    if (good) chosen.splice(chosen.length - 1, 1, good);
  }

  const spots = chosen.sort((a, b) => a.time - b.time).map((spot, i) => ({
    id: `s${i + 1}`, kind: spot.kind, outcome: spot.outcome, time: spot.time, end: spot.end,
    lineId: lineAt(lines, spot.time), section: sectionAt(sections, spot.time),
    from: spot.from, to: spot.to, over: spot.over, repeated: spot.repeated,
  }));
  return { status: 'ok', voicedSeconds, spots };
}
