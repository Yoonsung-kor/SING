// The report's words. The app sends the AI only what it found (kind, outcome, section, note names) and has its own
// sentence for every spot, so the report never waits for the AI or depends on it. The AI's sentence replaces the
// app's only where it holds up: no note, time, number or quote it was not given, and a break is asked, not stated.
// Shared by the server (checking the answer) and the browser (checking it again).
import { koreanNote } from './notes.js';

const TEXT_MAX = 80;
const KINDS = ['leap', 'high-hold', 'over'];
const OUTCOMES = ['sag', 'kept', 'ask', null];
const NOTE = /^-?\d옥 [도레미파솔라시]♯?$/;
const NOTES_IN_TEXT = /-?\d옥 [도레미파솔라시]♯?/g;
const QUOTES = /[“”‘’"'「」]/;
const TIME = /\d+\s*(분|초)/;
const QUESTION = /[?？]$/;
const ITEM_KEYS = ['id', 'kind', 'outcome', 'section', 'from', 'to', 'over', 'repeated'];

/** What the AI gets for the spots: no times, no lyric lines, no recording. */
export function spotsPayload(song, result, comfortableHighMidi) {
  return {
    kind: 'spots',
    song: { title: song.title, artist: song.artist ?? '' },
    comfortableHigh: Number.isFinite(comfortableHighMidi) ? koreanNote(Math.round(comfortableHighMidi)) || null : null,
    items: (result?.spots ?? []).map(spot => ({ id: spot.id, kind: spot.kind, outcome: spot.outcome, section: spot.section, from: spot.from, to: spot.to, over: spot.over, repeated: spot.repeated })),
  };
}

/** The app's own sentence for a spot. Note names are followed only by words that do not change with the final consonant. */
export function defaultSentence(item) {
  const where = item.section ? `${item.section}에서 ` : '이 자리에서 ';
  let sentence;
  if (item.kind === 'over') sentence = `${where}편한 최고음보다 반음 ${item.over}개 높은 ${item.to}까지 올라갔어요.`;
  else if (item.kind === 'leap') {
    const leap = `${where}${item.from}에서 ${item.to}까지`;
    sentence = item.outcome === 'kept' ? `${leap} 크게 올라가서, 닿은 음을 끝까지 지켰어요.`
      : item.outcome === 'sag' ? `${leap} 크게 올라간 뒤, 닿은 음이 끝으로 갈수록 내려왔어요.`
      : item.outcome === 'ask' ? `${leap} 크게 올라간 자리에서 소리가 잠깐 끊겼어요. 소리가 뒤집힌 느낌이 있었나요?`
      : `${leap} 한 번에 크게 올라가는 자리예요.`;
  } else {
    const high = `${where}높은 음(${item.to})을`;
    sentence = item.outcome === 'kept' ? `${high} 끝까지 지키며 길게 냈어요.`
      : item.outcome === 'sag' ? `${high} 길게 낼 때 끝으로 갈수록 음이 내려왔어요.`
      : item.outcome === 'ask' ? `${high} 길게 낼 때 소리가 잠깐 끊겼어요. 소리가 뒤집힌 느낌이 있었나요?`
      : `${high} 길게 내는 자리예요.`;
  }
  const again = `${sentence} 두 번 다 그랬어요.`;
  return item.repeated && item.outcome !== 'ask' && again.length <= TEXT_MAX ? again : sentence;
}

/** Whether the AI's sentence for this spot says only what the spot holds. */
function holdsUp(text, item, payload) {
  if (typeof text !== 'string') return false;
  const sentence = text.trim();
  if (!sentence || sentence.length > TEXT_MAX) return false;
  const allowed = [item.from, item.to, payload.comfortableHigh].filter(Boolean);
  if ((sentence.match(NOTES_IN_TEXT) ?? []).some(name => !allowed.includes(name))) return false;
  if (QUOTES.test(sentence) || TIME.test(sentence)) return false;
  let rest = sentence;
  for (const name of allowed) rest = rest.split(name).join(' ');
  const given = new Set([...(String(item.section ?? '').match(/\d+/g) ?? []), ...(Number.isInteger(item.over) ? [String(item.over)] : [])]);
  if ((rest.match(/\d+/g) ?? []).some(number => !given.has(number))) return false;
  return item.outcome === 'ask' ? QUESTION.test(sentence) : !QUESTION.test(sentence);
}

/** One sentence per spot, in order: the AI's where it holds up, the app's own otherwise. */
export function cleanSpotWords(raw, payload) {
  const answers = raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : [];
  return payload.items.map(item => {
    const answer = answers.find(entry => entry && typeof entry === 'object' && entry.id === item.id);
    return { id: item.id, text: answer && holdsUp(answer.text, item, payload) ? answer.text.trim() : defaultSentence(item) };
  });
}

function invalid(field) { throw new Error(`bad practice request: ${field}`); }
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value, keys, field) => { if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) invalid(field); };
const isNote = value => typeof value === 'string' && NOTE.test(value);

/** The server's check of a spots request: exactly what spotsPayload makes. */
export function validateSpotsRequest(body) {
  keysOnly(body, ['kind', 'song', 'comfortableHigh', 'items'], 'spots');
  if (body.kind !== 'spots') invalid('kind');
  keysOnly(body.song, ['title', 'artist'], 'song');
  for (const field of ['title', 'artist']) if (typeof body.song[field] !== 'string' || body.song[field].length > 120) invalid(field);
  if (body.comfortableHigh !== null && !isNote(body.comfortableHigh)) invalid('comfortableHigh');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 3) invalid('items');
  const ids = new Set();
  for (const item of body.items) {
    keysOnly(item, ITEM_KEYS, 'item');
    if (typeof item.id !== 'string' || !/^s[1-3]$/.test(item.id) || ids.has(item.id)) invalid('id');
    ids.add(item.id);
    if (!KINDS.includes(item.kind)) invalid('kind');
    if (!OUTCOMES.includes(item.outcome)) invalid('outcome');
    if (typeof item.section !== 'string' || item.section.length > 40) invalid('section');
    if (!isNote(item.to)) invalid('to');
    if (item.kind === 'leap' ? !isNote(item.from) : item.from !== null) invalid('from');
    if (item.over !== null && !(Number.isInteger(item.over) && item.over >= 2 && item.over <= 24)) invalid('over');
    if (item.kind === 'over' && item.over === null) invalid('over');
    if (typeof item.repeated !== 'boolean') invalid('repeated');
  }
  return body;
}
