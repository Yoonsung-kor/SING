// My comfortable high and how a song's checked highest note compares with it.
// Shared by the browser and the server, so it stays free of node: modules.

export const RANGE_BOUNDS = Object.freeze({ min: 55, max: 88 });
const VOICE_TYPES = ['male', 'female'];
const VOCALS = ['male', 'female', 'mixed'];
const OCTAVE_SHIFTS = [-12, 0, 12];
const MAX_BASIS = 20;

const isIso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const isText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const inBounds = value => Number.isInteger(value) && value >= RANGE_BOUNDS.min && value <= RANGE_BOUNDS.max;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** The highest note I actually sang among confident songs whose top note was found. */
export function comfortableHigh(basis) {
  const sung = (Array.isArray(basis) ? basis : [])
    .filter(entry => Number.isInteger(entry?.highestMidi))
    .map(entry => entry.highestMidi + (entry.keyOffset ?? 0) + (entry.octaveShift ?? 0));
  return sung.length ? clamp(Math.max(...sung), RANGE_BOUNDS.min, RANGE_BOUNDS.max) : null;
}

/** Suggested octave move when my key and the original vocal differ (spec 8.1); null when there is none. */
export function octaveChoice(voiceType, vocal) {
  if (voiceType === 'male' && vocal === 'female') return { shift: -12, checked: true };
  if (voiceType === 'female' && vocal === 'male') return { shift: 12, checked: false };
  return null;
}

/** How a recommended song is compared: a man singing a woman's song sings it an octave down. */
export function candidateShift(voiceType, vocal) {
  return voiceType === 'male' && vocal === 'female' ? -12 : 0;
}

/** gap = song top note − my comfortable high, in semitones. */
export function gapZone(gap) {
  if (gap <= 0) return 'easy';
  return gap <= 3 ? 'challenge' : 'hard';
}

export function keyHint(gap) {
  return gap > 0 ? `버거우면 −${Math.min(gap, 12)}키` : null;
}

/** Up to three picks: checked songs that fit the list intent, then unchecked ones; checked misfits are dropped. */
export function pickRecommendations(items, { voice, intent }) {
  const list = Array.isArray(items) ? items : [];
  if (!voice) return { items: list.slice(0, 3), fallback: false };
  if (!['comfortable', 'challenge'].includes(intent)) return { items: [...list.filter(item => item.range), ...list.filter(item => !item.range)].slice(0, 3), fallback: false };
  const fits = item => {
    const gap = item.range.highestMidi + candidateShift(voice.voiceType, item.vocal) - voice.comfortableHighMidi;
    return intent === 'comfortable' ? gap <= 0 : gap >= 1 && gap <= 3;
  };
  const matched = list.filter(item => item.range && fits(item));
  const unchecked = list.filter(item => !item.range);
  const picked = [...matched, ...unchecked].slice(0, 3);
  return { items: picked, fallback: matched.length === 0 && picked.length > 0 };
}

export function validateVoice(voice) {
  const bad = what => { throw new Error(`내 음역 정보가 올바르지 않아요. (${what})`); };
  if (!voice || typeof voice !== 'object' || Array.isArray(voice)) bad('voice');
  if (!inBounds(voice.comfortableHighMidi)) bad('comfortableHighMidi');
  if (!VOICE_TYPES.includes(voice.voiceType)) bad('voiceType');
  if (!['songs', 'manual'].includes(voice.method)) bad('method');
  if (!isIso(voice.updatedAt)) bad('updatedAt');
  if (!Array.isArray(voice.basis) || voice.basis.length > MAX_BASIS) bad('basis');
  for (const entry of voice.basis) {
    if (!entry || typeof entry !== 'object' || !isText(entry.title, 1, 120) || !isText(entry.artist, 0, 120)) bad('basis.title');
    if (entry.highestMidi !== null && !inBounds(entry.highestMidi)) bad('basis.highestMidi');
    if (!Number.isInteger(entry.keyOffset) || entry.keyOffset < -12 || entry.keyOffset > 12) bad('basis.keyOffset');
    if (!OCTAVE_SHIFTS.includes(entry.octaveShift)) bad('basis.octaveShift');
    if (entry.vocal !== null && !VOCALS.includes(entry.vocal)) bad('basis.vocal');
  }
  return voice;
}
