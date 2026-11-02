// Rules shared by the browser (building requests, key suggestions) and the server (checking AI output).
import { isValidRecItem, PLAYLIST_LIMITS } from './playlists.js';
import { noteName } from './pitch.js';
import { RANGE_BOUNDS } from './vocal-range.js';

const LETTERS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ACCIDENTALS = { '': 0, '#': 1, '♯': 1, b: -1, '♭': -1 };
const MAX_CANDIDATES = 8;
const INTENTS = ['comfortable', 'challenge', 'any'];
const VOCALS = ['male', 'female', 'mixed'];
const VOICE_TYPES = ['male', 'female'];
const BAD_REQUEST = '추천 요청이 올바르지 않아요.';

function fail(message) { throw new Error(message); }
const trimmed = value => typeof value === 'string' ? value.trim() : '';
function isHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch { return false; }
}
const isText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const isMidiOrNull = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 127);

export function normalizeKey(text) {
  return String(text ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, '')
    .replace(/[\s\p{P}]/gu, '');
}

export function sameSong(a, b) {
  if (normalizeKey(a.title) !== normalizeKey(b.title)) return false;
  const artistA = normalizeKey(a.artist), artistB = normalizeKey(b.artist);
  return !artistA || !artistB || artistA === artistB;
}

export function parseNoteName(text) {
  const match = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/u.exec(trimmed(text));
  if (!match) return null;
  return (Number(match[3]) + 1) * 12 + LETTERS[match[1].toLowerCase()] + ACCIDENTALS[match[2]];
}

function shortReason(text) {
  const reason = trimmed(text).slice(0, 80);
  return /[\uD800-\uDBFF]$/u.test(reason) ? reason.slice(0, -1) : reason;
}

const textOrNull = value => typeof value === 'string' ? value.trim() : null;
function toClaim(highest) {
  if (!highest || typeof highest !== 'object') return null;
  return { chestHighest: textOrNull(highest.chestHighest), falsettoHighest: textOrNull(highest.falsettoHighest), lowest: textOrNull(highest.lowest), sourceUrl: textOrNull(highest.sourceUrl), sourceQuote: textOrNull(highest.sourceQuote) };
}

/** Up to 8 real-looking candidates with their unchecked highest-note claims; the server checks the claims next. */
export function toCandidates(raw, exclude) {
  const intent = INTENTS.includes(raw?.intent) ? raw.intent : 'any';
  const candidates = [];
  for (const item of Array.isArray(raw?.items) ? raw.items : []) {
    if (candidates.length >= MAX_CANDIDATES) break;
    if (!item || typeof item !== 'object') continue;
    const candidate = { title: trimmed(item.title), artist: trimmed(item.artist), reason: shortReason(item.reason), songUrl: trimmed(item.songUrl), claim: toClaim(item.highest), vocal: VOCALS.includes(item.vocal) ? item.vocal : null };
    if (!isValidRecItem({ ...candidate, range: null })) continue;
    if ([...exclude, ...candidates].some(other => sameSong(other, candidate))) continue;
    candidates.push(candidate);
  }
  return { intent, candidates };
}

export function suggestKey(playlistSongs, candidateHighestMidi) {
  if (!Number.isInteger(candidateHighestMidi)) return null;
  const tops = playlistSongs.filter(song => Number.isInteger(song.highestMidi)).map(song => song.highestMidi + song.keyOffset).sort((a, b) => a - b);
  if (!tops.length) return null;
  const middle = Math.floor(tops.length / 2);
  const reference = tops.length % 2 ? tops[middle] : Math.round((tops[middle - 1] + tops[middle]) / 2);
  return Math.max(-12, Math.min(12, reference - candidateHighestMidi));
}

export function buildRecommendationRequest(state, playlistId) {
  const playlist = state.playlists.find(p => p.id === playlistId);
  if (!playlist) fail('플레이리스트를 찾지 못했어요.');
  const byId = new Map(state.songs.map(song => [song.id, song]));
  const songs = playlist.songIds.map(id => byId.get(id)).filter(Boolean);
  if (songs.length < PLAYLIST_LIMITS.minSongsForRecs) fail('곡을 3개 이상 담으면 추천받을 수 있어요.');
  const titleArtist = ({ title, artist }) => ({ title, artist });
  return {
    playlistName: playlist.name,
    songs: songs.map(song => ({ title: song.title, artist: song.artist, keyOffset: song.keyOffset, lowestMidi: song.lowestMidi, highestMidi: song.highestMidi, fromAi: song.origin === 'ai' })),
    // Cards already on screen are excluded too, so '다른 곡 추천 받기' really asks for different songs.
    exclude: [...state.songs, ...(playlist.recommendations?.items || [])].map(titleArtist),
    rejected: playlist.rejected.map(titleArtist),
    voice: state.settings?.voice ? { comfortableHigh: noteName(state.settings.voice.comfortableHighMidi).scientific, voiceType: state.settings.voice.voiceType } : null,
  };
}

export function validateRangeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isText(body.title, 1, 120) || !isText(body.artist, 0, 120)) fail(BAD_REQUEST);
  return { title: body.title.trim(), artist: body.artist.trim() };
}

// The browser sends my comfortable high as a note name; the server works in MIDI.
function toVoice(voice) {
  if (voice === undefined || voice === null) return null;
  const midi = parseNoteName(voice?.comfortableHigh);
  if (midi === null || midi < RANGE_BOUNDS.min || midi > RANGE_BOUNDS.max || !VOICE_TYPES.includes(voice.voiceType)) fail(BAD_REQUEST);
  return { comfortableHighMidi: midi, voiceType: voice.voiceType };
}

const isTitleArtist = entry => entry && isText(entry.title, 1, 120) && isText(entry.artist, 0, 120);

export function validateRecommendationRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isText(body.playlistName, 1, PLAYLIST_LIMITS.nameMax)) fail(BAD_REQUEST);
  const { songs, exclude, rejected } = body;
  if (!Array.isArray(songs) || songs.length < PLAYLIST_LIMITS.minSongsForRecs || songs.length > 500
    || !songs.every(song => isTitleArtist(song) && Number.isInteger(song.keyOffset) && song.keyOffset >= -12 && song.keyOffset <= 12
      && isMidiOrNull(song.lowestMidi) && isMidiOrNull(song.highestMidi) && typeof song.fromAi === 'boolean')) fail(BAD_REQUEST);
  if (!Array.isArray(exclude) || exclude.length > 700 || !exclude.every(isTitleArtist)) fail(BAD_REQUEST);
  if (!Array.isArray(rejected) || rejected.length > PLAYLIST_LIMITS.maxRejected || !rejected.every(isTitleArtist)) fail(BAD_REQUEST);
  return { ...body, voice: toVoice(body.voice) };
}
