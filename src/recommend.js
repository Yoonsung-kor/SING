// Rules shared by the browser (building requests, key suggestions) and the server (checking AI output).
import { isValidRecItem, PLAYLIST_LIMITS } from './playlists.js';

const LETTERS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ACCIDENTALS = { '': 0, '#': 1, '♯': 1, b: -1, '♭': -1 };
// A vocal top note outside G3–E6 almost always means an octave-notation mix-up in the source.
const RANGE_BOUNDS = Object.freeze({ lowestMin: 36, highestMin: 55, highestMax: 88 });
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

export function toRange(range) {
  if (!range || typeof range !== 'object') return null;
  const lowestMidi = parseNoteName(range.lowest), highestMidi = parseNoteName(range.highest);
  if (lowestMidi === null || highestMidi === null || lowestMidi < RANGE_BOUNDS.lowestMin || lowestMidi > highestMidi
    || highestMidi < RANGE_BOUNDS.highestMin || highestMidi > RANGE_BOUNDS.highestMax) return null;
  const sourceUrl = trimmed(range.sourceUrl);
  if (!isHttps(sourceUrl)) return null;
  return { lowestMidi, highestMidi, sourceUrl, sourceNotation: trimmed(range.sourceNotation).slice(0, 40) };
}

function shortReason(text) {
  const reason = trimmed(text).slice(0, 80);
  return /[\uD800-\uDBFF]$/u.test(reason) ? reason.slice(0, -1) : reason;
}

export function toRecItems(raw, exclude) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const accepted = [];
  for (const item of items) {
    if (accepted.length >= PLAYLIST_LIMITS.recCount) break;
    if (!item || typeof item !== 'object') continue;
    const candidate = { title: trimmed(item.title), artist: trimmed(item.artist), reason: shortReason(item.reason), songUrl: trimmed(item.songUrl), range: toRange(item.range) };
    if (!isValidRecItem(candidate)) continue;
    if ([...exclude, ...accepted].some(other => sameSong(other, candidate))) continue;
    accepted.push(candidate);
  }
  return accepted;
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
  };
}

export function validateRangeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isText(body.title, 1, 120) || !isText(body.artist, 0, 120)) fail(BAD_REQUEST);
  return { title: body.title.trim(), artist: body.artist.trim() };
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
  return body;
}
