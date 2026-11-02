export const PLAYLIST_LIMITS = Object.freeze({ maxPlaylists: 50, nameMax: 30, minSongsForRecs: 3, recCount: 3, maxRejected: 200 });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY = [['want', '불러볼 곡'], ['practicing', '연습 중'], ['comfortable', '익숙한 곡']];
const SONG_ERROR = '플레이리스트의 곡 정보가 올바르지 않아요.';
const REC_ERROR = '플레이리스트의 추천 정보가 올바르지 않아요.';

function fail(message) { throw new Error(message); }
function isoNow(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) fail('날짜가 올바르지 않아요.');
  return now.toISOString();
}
function isIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function isText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}
function isHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch { return false; }
}
function isMidi(value) { return Number.isInteger(value) && value >= 0 && value <= 127; }
const nameKey = name => name.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '');

function checkName(playlists, name, exceptId = null) {
  if (typeof name !== 'string' || !name.trim()) fail('플레이리스트 이름을 적어 주세요.');
  const trimmed = name.trim();
  if (trimmed.length > PLAYLIST_LIMITS.nameMax) fail('플레이리스트 이름은 30자까지예요.');
  if (playlists.some(p => p.id !== exceptId && nameKey(p.name) === nameKey(trimmed))) fail('같은 이름의 플레이리스트가 있어요.');
  return trimmed;
}
const touch = (playlist, changes, now) => ({ ...playlist, ...changes, updatedAt: isoNow(now) });

export function createPlaylist(playlists, name, now = new Date()) {
  if (playlists.length >= PLAYLIST_LIMITS.maxPlaylists) fail('플레이리스트는 50개까지 만들 수 있어요.');
  const timestamp = isoNow(now);
  return { id: crypto.randomUUID(), name: checkName(playlists, name), songIds: [], recommendations: null, rejected: [], createdAt: timestamp, updatedAt: timestamp };
}

export function renamePlaylist(playlists, id, name, now = new Date()) {
  const trimmed = checkName(playlists, name, id);
  return playlists.map(p => p.id === id ? touch(p, { name: trimmed }, now) : p);
}

export function addSong(playlist, songId, now = new Date()) {
  if (playlist.songIds.includes(songId)) return playlist;
  return touch(playlist, { songIds: [...playlist.songIds, songId] }, now);
}

export function removeSong(playlist, songId, now = new Date()) {
  if (!playlist.songIds.includes(songId)) return playlist;
  return touch(playlist, { songIds: playlist.songIds.filter(id => id !== songId) }, now);
}

export function applyMembership(playlists, songId, selectedIds, now = new Date()) {
  return playlists.map(p => selectedIds.includes(p.id) ? addSong(p, songId, now) : removeSong(p, songId, now));
}

export function removeSongEverywhere(playlists, songId, now = new Date()) {
  return playlists.map(p => removeSong(p, songId, now));
}

export function migrateLegacyStatuses(songs, now = new Date()) {
  const playlists = [];
  for (const [status, name] of LEGACY) {
    const songIds = songs.filter(song => song.status === status).map(song => song.id);
    if (songIds.length) playlists.push({ ...createPlaylist(playlists, name, now), songIds });
  }
  return playlists;
}

export function setRecommendations(playlist, items, now = new Date()) {
  return touch(playlist, { recommendations: { fetchedAt: isoNow(now), items } }, now);
}

export function takeRecommendation(playlist, index, now = new Date()) {
  const items = playlist.recommendations?.items || [];
  const item = items[index];
  if (!item) fail('이미 지나간 추천이에요. 화면을 새로 고쳐 주세요.');
  return { item, playlist: touch(playlist, { recommendations: { ...playlist.recommendations, items: items.filter((_, i) => i !== index) } }, now) };
}

export function rejectRecommendation(playlist, index, now = new Date()) {
  const { item, playlist: next } = takeRecommendation(playlist, index, now);
  const rejected = [...next.rejected, { title: item.title, artist: item.artist }].slice(-PLAYLIST_LIMITS.maxRejected);
  return { ...next, rejected };
}

export function isValidRecItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (!isText(item.title, 1, 120) || !isText(item.artist, 0, 120) || !isText(item.reason, 1, 80) || !isHttps(item.songUrl)) return false;
  const range = item.range;
  if (range === null) return true;
  return Boolean(range) && isMidi(range.lowestMidi) && isMidi(range.highestMidi) && range.lowestMidi <= range.highestMidi
    && isHttps(range.sourceUrl) && isText(range.sourceNotation, 0, 40);
}

export function validatePlaylist(playlist, songIdSet) {
  if (!playlist || typeof playlist !== 'object' || Array.isArray(playlist)) fail('플레이리스트 정보가 올바르지 않아요.');
  if (typeof playlist.id !== 'string' || !UUID.test(playlist.id)) fail('플레이리스트 ID가 올바르지 않아요.');
  if (!isText(playlist.name, 1, PLAYLIST_LIMITS.nameMax) || playlist.name !== playlist.name.trim()) fail('플레이리스트 이름을 확인해 주세요.');
  if (!isIso(playlist.createdAt) || !isIso(playlist.updatedAt)) fail('플레이리스트 날짜가 올바르지 않아요.');
  if (!Array.isArray(playlist.songIds) || playlist.songIds.length > 500
    || new Set(playlist.songIds).size !== playlist.songIds.length
    || playlist.songIds.some(id => !songIdSet.has(id))) fail(SONG_ERROR);
  const recs = playlist.recommendations;
  if (recs !== null && (!recs || typeof recs !== 'object' || !isIso(recs.fetchedAt) || !Array.isArray(recs.items)
    || recs.items.length > PLAYLIST_LIMITS.recCount || !recs.items.every(isValidRecItem))) fail(REC_ERROR);
  if (!Array.isArray(playlist.rejected) || playlist.rejected.length > PLAYLIST_LIMITS.maxRejected
    || !playlist.rejected.every(r => r && isText(r.title, 1, 120) && isText(r.artist, 0, 120))) fail(REC_ERROR);
  return playlist;
}
