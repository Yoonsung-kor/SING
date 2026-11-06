// Practice feedback: the app measures, the AI only explains. Everything here is pure: payloads carry numbers,
// note names, section names and line ids — never recordings or lyric text — and the AI's answer is checked
// so it can only point at lines it was given.
import { noteName } from './pitch.js';

const FRAME_S = 0.05;
const GAP_S = 0.4;
const SUNG = 0.3;
const TEXT_MAX = 80;
const PER_LIST = 2;
const LINKS = ['practice', 'learn'];

const round1 = value => Math.round(value * 10) / 10;
const round2 = value => Math.round(value * 100) / 100;
const note = midi => Number.isFinite(midi) ? noteName(Math.round(midi))?.scientific ?? null : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** One humming lesson as numbers and note names. */
export function hummingPayload(session, { previousHighMidi = null, comfortableHighMidi = null } = {}) {
  const attempts = session.attempts.map(attempt => ({
    target: note(attempt.targetMidi),
    sung: note(attempt.midi),
    centsOff: Number.isInteger(attempt.targetMidi) && Number.isInteger(attempt.midi) && Number.isFinite(attempt.cents)
      ? Math.round((attempt.midi - attempt.targetMidi) * 100 + attempt.cents) : null,
    comfort: attempt.comfort,
    reason: attempt.reason,
  }));
  const comfortable = [...new Set(session.attempts.filter(a => a.verified && a.comfort === 'comfortable' && Number.isInteger(a.midi)).map(a => a.midi))].sort((a, b) => a - b);
  return {
    kind: 'humming',
    attempts,
    comfortableNotes: comfortable.map(note),
    todayHigh: note(comfortable.at(-1)),
    previousHigh: note(previousHighMidi),
    comfortableHigh: note(comfortableHighMidi),
    stoppedForPain: session.stopReason === 'pain' || session.attempts.some(a => a.comfort === 'pain'),
  };
}

/** Per lyric line (non-empty text, from its start to the next line): how it was sung. */
export function lineMetrics(frames, lines, { comfortableHighMidi = null } = {}) {
  const stats = [];
  lines.forEach((line, id) => {
    if (!line.text) return;
    const start = line.t;
    const end = lines[id + 1]?.t ?? Infinity;
    const inside = frames.filter(frame => frame.songTime >= start && frame.songTime < end);
    if (!inside.length) return;
    const voicedMidi = inside.filter(frame => frame.midi !== null).map(frame => frame.midi);
    let pairs = 0;
    let jumps = 0;
    let gaps = 0;
    let silentFrom = null;
    inside.forEach((frame, i) => {
      const previous = inside[i - 1];
      if (frame.midi !== null && previous?.midi !== null && previous) { pairs++; if (Math.abs(frame.midi - previous.midi) >= 1) jumps++; }
      if (frame.midi === null && silentFrom === null) silentFrom = frame.songTime;
      const silenceEnds = frame.midi !== null || i === inside.length - 1;
      if (silentFrom !== null && silenceEnds) {
        const last = frame.midi === null ? frame.songTime : previous.songTime;
        if (last - silentFrom + FRAME_S > GAP_S) gaps++;
        silentFrom = null;
      }
    });
    stats.push({
      id, start, end,
      voiced: round2(voicedMidi.length / inside.length),
      top: note(voicedMidi.length ? Math.max(...voicedMidi) : null),
      overComfort: Number.isFinite(comfortableHighMidi) && voicedMidi.length ? round2(voicedMidi.filter(m => m > comfortableHighMidi).length / voicedMidi.length) : 0,
      wobble: pairs ? round2(jumps / pairs) : 0,
      gaps,
      median: median(voicedMidi),
    });
  });
  return stats;
}

export const sungLines = stats => stats.filter(line => line.voiced >= SUNG).length;

/** The first two choruses: the nth sung line of one against the nth of the other, in semitones (at most 6 pairs). */
export function chorusDiffs(stats, sections) {
  const ranges = sections.map((section, i) => ({ section, end: sections[i + 1]?.t ?? Infinity })).filter(({ section }) => section.kind === 'chorus').slice(0, 2);
  if (ranges.length < 2) return [];
  const sungIn = ({ section, end }) => stats.filter(line => line.start >= section.t && line.start < end && line.voiced >= SUNG && line.median !== null);
  const [first, second] = ranges.map(sungIn);
  const pairs = [];
  for (let n = 0; n < Math.min(first.length, second.length, 6); n++) pairs.push({ ids: [first[n].id, second[n].id], semitones: round1(first[n].median - second[n].median) });
  return pairs;
}

/** The song-side payload: section names and per-line numbers; lyric text stays on the device. */
export function songPayload(song, sections, stats, diffs, comfortableHighMidi) {
  const sectionAt = time => {
    let label = '';
    for (const section of sections) if (section.t <= time + 0.05) label = section.label;
    return label;
  };
  return {
    kind: 'song',
    song: { title: song.title, artist: song.artist },
    comfortableHigh: note(comfortableHighMidi),
    lines: stats.map(line => ({ id: line.id, section: sectionAt(line.start), voiced: line.voiced, top: line.top, overComfort: line.overComfort, wobble: line.wobble, gaps: line.gaps })),
    chorusDiffs: diffs,
  };
}

const cleanText = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= TEXT_MAX ? text : null;
};

/** The AI's answer, kept only where it is short and (for a song) points at a line it was given. */
export function cleanFeedback(raw, { kind, lineIds = [] }) {
  if (!raw || typeof raw !== 'object') return null;
  const known = new Set(lineIds);
  const pointed = list => (Array.isArray(list) ? list : []).flatMap(item => {
    if (kind !== 'song') { const text = cleanText(item); return text ? [text] : []; }
    const text = cleanText(item?.text);
    return text && Number.isInteger(item.lineId) && known.has(item.lineId) ? [{ lineId: item.lineId, text }] : [];
  }).slice(0, PER_LIST);
  const practice = (Array.isArray(raw.practice) ? raw.practice : []).flatMap(item => {
    const text = cleanText(item?.text);
    return text ? [{ text, link: LINKS.includes(item.link) ? item.link : null }] : [];
  }).slice(0, PER_LIST);
  const feedback = { good: pointed(raw.good), improve: pointed(raw.improve), practice };
  return feedback.good.length || feedback.improve.length || feedback.practice.length ? feedback : null;
}
