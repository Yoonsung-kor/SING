// First visit to '뭐 부르지?': pick songs you sing confidently, and their checked top notes become your
// comfortable high. Pure state changes only; app.js does the fetching and saving.
import { normalizeKey, sameSong } from './recommend.js';
import { comfortableHigh, octaveChoice, candidateShift, RANGE_BOUNDS } from './vocal-range.js';
import { createSong, updateSong } from './songs.js';
import { createPlaylist, addSong } from './playlists.js';

export const LIST_NAME = '자신 있는 곡';
export const MAX_PICKS = 20;
const MAX_SONGS = 500;

const keyOf = (title, artist) => `${normalizeKey(title)}|${normalizeKey(artist)}`;
const listKey = name => name.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const defaultShift = (voiceType, vocal) => { const choice = octaveChoice(voiceType, vocal); return choice?.checked ? choice.shift : 0; };
const updatePick = (onb, key, change) => ({ ...onb, picks: onb.picks.map(p => p.key === key ? { ...p, ...change(p) } : p) });

/** Search panel state shared by onboarding and '곡 찾아 담기'. term is the text the last request used. */
export function emptySearch() {
  return { status: 'idle', results: [], source: 'tj', retriedWith: null, artist: null, artistTitle: null, hasMore: false, page: 1, mode: 'search', shown: 20, term: '', loadingMore: false };
}

export function shouldShowOnboarding(state, { demo, initialized }) {
  return Boolean(initialized) && !demo && !state.settings.voice && !state.settings.voiceOnboardingDismissedAt;
}

/** A fresh onboarding; '다시 고르기' starts from the songs the current range was based on. */
export function startOnboarding(state) {
  const voice = state.settings.voice;
  const picks = (voice?.basis ?? []).map(b => ({
    key: keyOf(b.title, b.artist), title: b.title, artist: b.artist, keyOffset: b.keyOffset, octaveShift: b.octaveShift, octaveTouched: true,
    status: b.highestMidi === null ? 'missing' : 'found', range: b.highestMidi === null ? null : { highestMidi: b.highestMidi }, vocal: b.vocal, tjNumber: '',
  }));
  return { kind: 'voice', voiceType: voice?.voiceType ?? null, query: '', scope: 'kor', search: emptySearch(), picks, createList: true, manualMidi: voice?.comfortableHighMidi ?? 64, waiting: false };
}

export function addPick(onb, { title, artist, tjNumber = '' }) {
  const cleanTitle = String(title ?? '').trim(), cleanArtist = String(artist ?? '').trim();
  const key = keyOf(cleanTitle, cleanArtist);
  if (!cleanTitle || onb.picks.length >= MAX_PICKS || onb.picks.some(p => p.key === key)) return { onboarding: onb, key: null };
  const added = { key, title: cleanTitle, artist: cleanArtist, keyOffset: 0, octaveShift: 0, octaveTouched: false, status: 'looking', range: null, vocal: null, tjNumber: /^\d{1,6}$/.test(String(tjNumber)) ? String(tjNumber) : '' };
  return { onboarding: { ...onb, picks: [...onb.picks, added] }, key };
}

/** result: a checked range, null (nothing found) or 'error'. Unknown keys (a pick removed meanwhile) change nothing. */
export function applyLookup(onb, key, result) {
  if (!onb.picks.some(p => p.key === key)) return onb;
  const found = result && typeof result === 'object';
  return updatePick(onb, key, p => {
    const vocal = found ? result.vocal ?? null : p.vocal;
    return { status: result === 'error' ? 'error' : found ? 'found' : 'missing', range: found ? result : null, vocal, octaveShift: p.octaveTouched ? p.octaveShift : defaultShift(onb.voiceType, vocal) };
  });
}

/** A new voice type changes which octave move makes sense, so every pick goes back to the suggestion for it. */
/** A lookup still running after a while: the row says it is taking long. */
export function markSlow(onb, key) {
  return updatePick(onb, key, p => p.status === 'looking' ? { slow: true } : {});
}

export function setVoiceType(onb, voiceType) {
  if (voiceType === onb.voiceType) return onb;
  return { ...onb, voiceType, picks: onb.picks.map(p => ({ ...p, octaveShift: defaultShift(voiceType, p.vocal), octaveTouched: false })) };
}

export function setPickKey(onb, key, keyOffset) {
  const value = Number(keyOffset);
  return Number.isInteger(value) ? updatePick(onb, key, () => ({ keyOffset: clamp(value, -12, 12) })) : onb;
}

export function toggleOctave(onb, key) {
  return updatePick(onb, key, p => {
    const choice = octaveChoice(onb.voiceType, p.vocal);
    return choice ? { octaveShift: p.octaveShift === 0 ? choice.shift : 0, octaveTouched: true } : {};
  });
}

export function removePick(onb, key) {
  return { ...onb, picks: onb.picks.filter(p => p.key !== key) };
}

export function onboardingResult(onb) {
  const basis = onb.picks.map(p => ({ title: p.title, artist: p.artist, highestMidi: p.status === 'found' ? p.range.highestMidi : null, keyOffset: p.keyOffset, octaveShift: p.octaveShift, vocal: p.vocal }));
  return { midi: comfortableHigh(basis), basis };
}

const rangeFields = range => ({ highestMidi: range.highestMidi, falsettoHighestMidi: range.falsettoHighestMidi, lowestMidi: range.lowestMidi, rangeSourceUrl: range.sourceUrl, rangeQuote: range.sourceQuote, vocal: range.vocal });

/** Saves my range; with the checkbox on, also saves the songs and puts them in the '자신 있는 곡' list.
 *  manualMidi: the user fixed the result by hand, so that value wins but the picks still count. */
export function commitOnboarding(state, onb, now = new Date(), { manualMidi } = {}) {
  if (!onb.voiceType) throw new Error('주로 부르는 키를 골라 주세요.');
  const { midi: found, basis } = onboardingResult(onb);
  const manual = Number.isFinite(manualMidi);
  const midi = manual ? clamp(Math.round(manualMidi), RANGE_BOUNDS.min, RANGE_BOUNDS.max) : found;
  if (midi === null) throw new Error('최고음을 찾은 곡이 한 곡은 있어야 해요.');
  const settings = { ...state.settings, voice: { comfortableHighMidi: midi, voiceType: onb.voiceType, method: manual ? 'manual' : 'songs', updatedAt: now.toISOString(), basis } };
  if (!onb.createList) return { ...state, settings };
  const { songs, ids } = savePicksToSongs(state, onb.picks, now);
  let playlists = state.playlists;
  let listIndex = playlists.findIndex(p => listKey(p.name) === listKey(LIST_NAME));
  if (listIndex < 0) { playlists = [...playlists, createPlaylist(playlists, LIST_NAME, now)]; listIndex = playlists.length - 1; }
  const list = ids.reduce((p, id) => addSong(p, id, now), playlists[listIndex]);
  playlists = playlists.map((p, i) => i === listIndex ? list : p);
  return { ...state, songs, playlists, settings };
}

/** Saves picks as songs (new arrays; state is untouched if this throws). Songs already saved are reused. */
export function savePicksToSongs(state, picks, now = new Date()) {
  const songs = [...state.songs];
  const ids = [];
  for (const p of picks) {
    // Only values the server checked (they carry the quote) are written into songs; '다시 고르기' snapshots are not.
    const verified = p.status === 'found' && p.range?.sourceQuote ? p.range : null;
    const index = songs.findIndex(song => sameSong(song, p));
    if (index >= 0) {
      const existing = songs[index];
      const fields = {};
      if (verified && !existing.rangeQuote && existing.highestMidi === null) Object.assign(fields, rangeFields(verified));
      if (existing.keyOffset === 0 && p.keyOffset !== 0) fields.keyOffset = p.keyOffset;
      if (existing.octaveShift === 0 && p.octaveShift !== 0) fields.octaveShift = p.octaveShift;
      if (!existing.tjNumber && p.tjNumber) fields.tjNumber = p.tjNumber;
      if (Object.keys(fields).length) songs[index] = updateSong(existing, fields, now);
      ids.push(existing.id);
      continue;
    }
    if (songs.length >= MAX_SONGS) throw new Error('곡은 500곡까지 담을 수 있어요.');
    const song = createSong({ title: p.title, artist: p.artist, keyOffset: p.keyOffset, octaveShift: p.octaveShift, vocal: p.vocal, tjNumber: p.tjNumber ?? '', ...(verified ? rangeFields(verified) : {}), origin: 'user' }, now);
    songs.push(song);
    ids.push(song.id);
  }
  return { songs, ids };
}

/** '곡 찾아 담기': the same search and pick rows as onboarding, without a voice type or a result. */
export function startPicker(state, playlistId = null) {
  return { kind: 'songs', playlistId, query: '', scope: 'kor', search: emptySearch(), picks: [], waiting: false };
}

/** Saves the picked songs (into the list when one was chosen). Octaves follow my range the way recommendations do. */
export function commitPicks(state, picker, now = new Date()) {
  if (!picker.picks.length) throw new Error('담을 곡을 골라 주세요.');
  const list = picker.playlistId ? state.playlists.find(p => p.id === picker.playlistId) : null;
  if (picker.playlistId && !list) throw new Error('담을 플레이리스트를 찾지 못했어요. 목록에서 다시 골라 주세요.');
  const voice = state.settings.voice;
  const picks = picker.picks.map(p => ({ ...p, octaveShift: voice ? candidateShift(voice.voiceType, p.vocal) : 0 }));
  const { songs, ids } = savePicksToSongs(state, picks, now);
  const playlists = list ? state.playlists.map(p => p.id === list.id ? ids.reduce((acc, id) => addSong(acc, id, now), p) : p) : state.playlists;
  return { ...state, songs, playlists };
}

export function commitManual(state, { midi, voiceType }, now = new Date()) {
  if (!['male', 'female'].includes(voiceType)) throw new Error('주로 부르는 키를 골라 주세요.');
  const voice = { comfortableHighMidi: clamp(Math.round(midi), RANGE_BOUNDS.min, RANGE_BOUNDS.max), voiceType, method: 'manual', updatedAt: now.toISOString(), basis: state.settings.voice?.basis ?? [] };
  return { ...state, settings: { ...state.settings, voice } };
}

export function dismissOnboarding(state, now = new Date()) {
  return { ...state, settings: { ...state.settings, voiceOnboardingDismissedAt: now.toISOString() } };
}
