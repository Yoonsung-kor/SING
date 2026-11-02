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
