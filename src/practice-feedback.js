// Practice feedback: the app measures, the AI only explains. Everything here is pure: payloads carry numbers and
// note names, never recordings, and the AI's answer is checked before it is shown. A sung song's report is
// src/hard-spots.js (spots) with src/spot-words.js (its words); this file keeps the humming feedback.
import { koreanNote } from './notes.js';
import { validateSpotsRequest } from './spot-words.js';

const TEXT_MAX = 80;
const PER_LIST = 2;
const LINKS = ['practice', 'learn'];

// Notes are named the way the app shows them ("2옥 라"), so the AI's words match the screen.
const note = midi => Number.isFinite(midi) ? koreanNote(Math.round(midi)) || null : null;

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

/** Measured times (the video's) as song times: take off the start difference (0 until it is aligned). */
export const songFrames = (frames, offset) => frames.map(frame => ({ songTime: frame.time - offset, midi: frame.midi }));

const cleanText = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= TEXT_MAX ? text : null;
};

/** The AI's humming feedback, kept only where it is short; at most two per list, links checked. */
export function cleanFeedback(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const texts = list => (Array.isArray(list) ? list : []).flatMap(item => { const text = cleanText(item); return text ? [text] : []; }).slice(0, PER_LIST);
  const practice = (Array.isArray(raw.practice) ? raw.practice : []).flatMap(item => {
    const text = cleanText(item?.text);
    return text ? [{ text, link: LINKS.includes(item.link) ? item.link : null }] : [];
  }).slice(0, PER_LIST);
  const feedback = { good: texts(raw.good), improve: texts(raw.improve), practice };
  return feedback.good.length || feedback.improve.length || feedback.practice.length ? feedback : null;
}

const NOTE = /^-?\d옥 [도레미파솔라시]♯?$/;
const COMFORTS = ['comfortable', 'effort', 'unsure', 'pain'];
function invalid(field) { throw new Error(`bad practice request: ${field}`); }
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const noteOrNull = (value, field) => { if (value !== null && !(typeof value === 'string' && NOTE.test(value))) invalid(field); };
const keysOnly = (value, keys, field) => { if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) invalid(field); };
const shortText = (value, max, field) => { if (typeof value !== 'string' || value.length > max) invalid(field); };

/** The server's check of a feedback request: a humming lesson, or a sung song's spots. */
export function validatePracticeRequest(body) {
  if (!isObject(body)) invalid('body');
  if (body.kind === 'spots') return validateSpotsRequest(body);
  if (body.kind !== 'humming') invalid('kind');
  keysOnly(body, ['kind', 'attempts', 'comfortableNotes', 'todayHigh', 'previousHigh', 'comfortableHigh', 'stoppedForPain'], 'humming');
  if (!Array.isArray(body.attempts) || body.attempts.length > 40) invalid('attempts');
  for (const attempt of body.attempts) {
    keysOnly(attempt, ['target', 'sung', 'centsOff', 'comfort', 'reason'], 'attempt');
    noteOrNull(attempt.target, 'target'); noteOrNull(attempt.sung, 'sung');
    if (attempt.centsOff !== null && !(Number.isInteger(attempt.centsOff) && Math.abs(attempt.centsOff) <= 4800)) invalid('centsOff');
    if (!COMFORTS.includes(attempt.comfort)) invalid('comfort');
    shortText(attempt.reason, 40, 'reason');
  }
  if (!Array.isArray(body.comfortableNotes) || body.comfortableNotes.length > 40) invalid('comfortableNotes');
  body.comfortableNotes.forEach(value => noteOrNull(value, 'comfortableNotes'));
  ['todayHigh', 'previousHigh', 'comfortableHigh'].forEach(field => noteOrNull(body[field], field));
  if (typeof body.stoppedForPain !== 'boolean') invalid('stoppedForPain');
  return body;
}
