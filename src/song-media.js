// A song's videos, sections, start offsets and pins, kept on the song as an optional `media` field.
// Every function returns new objects; none of them touches the network. Lyric text never reaches this module.
import { SECTION_KINDS } from './sections.js';

export const AUTO_DAYS = 30;
export const NONE_DAYS = 7;
export const MAX_CANDIDATES = 3;
export const MAX_PINS = 50;
export const PIN_TEXT_MAX = 60;
export const MAX_SECTIONS = 100;
export const MAX_STARTS = 20;
export const MAX_TIME = 3600;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const SIDES = ['mv', 'karaoke'];
const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID = '곡 영상 정보가 올바르지 않아요.';

export const emptyMedia = () => ({ mv: null, karaoke: null, sections: null, starts: {}, pins: [] });
export const readMedia = song => song?.media ? { ...emptyMedia(), ...song.media } : emptyMedia();

function fail() { throw new Error(INVALID); }
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, required, optional = []) => Object.keys(value).every(key => required.includes(key) || optional.includes(key)) && required.every(key => key in value);
const isTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const inRange = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const isVideoId = value => typeof value === 'string' && VIDEO_ID.test(value);

function checkSide(entry, side) {
  if (entry === null) return;
  if (!isObject(entry)) fail();
  if (entry.none === true) { if (!keysAre(entry, ['none', 'foundAt']) || !isTime(entry.foundAt)) fail(); return; }
  const karaoke = side === 'karaoke';
  if (!keysAre(entry, ['videoId', 'source', 'foundAt', 'candidates'], karaoke ? ['kind'] : [])) fail();
  if (!isVideoId(entry.videoId) || !['auto', 'pasted'].includes(entry.source) || !isTime(entry.foundAt)) fail();
  if (karaoke && !['basic', 'mr', 'unknown'].includes(entry.kind)) fail();
  const { candidates } = entry;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > MAX_CANDIDATES) fail();
  for (const candidate of candidates) {
    if (!isObject(candidate) || !keysAre(candidate, ['videoId'], karaoke ? ['kind'] : []) || !isVideoId(candidate.videoId)) fail();
    if (candidate.kind !== undefined && !['basic', 'mr'].includes(candidate.kind)) fail();
  }
  if (!candidates.some(candidate => candidate.videoId === entry.videoId)) fail();
}

function checkSections(sections) {
  if (sections === null) return;
  if (!isObject(sections)) fail();
  if (sections.none === true) { if (!keysAre(sections, ['none', 'checkedAt']) || !isTime(sections.checkedAt)) fail(); return; }
  if (!keysAre(sections, ['duration', 'items', 'checkedAt']) || !inRange(sections.duration, 0, MAX_TIME) || !isTime(sections.checkedAt)) fail();
  if (!Array.isArray(sections.items) || sections.items.length > MAX_SECTIONS) fail();
  for (const item of sections.items) {
    if (!isObject(item) || !keysAre(item, ['t', 'label', 'kind']) || !inRange(item.t, 0, MAX_TIME)) fail();
    if (typeof item.label !== 'string' || !item.label || item.label.length > 20 || !SECTION_KINDS.includes(item.kind)) fail();
  }
}

export function validateMedia(media) {
  if (!isObject(media) || !keysAre(media, ['mv', 'karaoke', 'sections', 'starts', 'pins'])) fail();
  SIDES.forEach(side => checkSide(media[side], side));
  checkSections(media.sections);
  if (!isObject(media.starts)) fail();
  const starts = Object.entries(media.starts);
  if (starts.length > MAX_STARTS || starts.some(([id, offset]) => !isVideoId(id) || !inRange(offset, -MAX_TIME, MAX_TIME))) fail();
  if (!Array.isArray(media.pins) || media.pins.length > MAX_PINS) fail();
  const ids = new Set();
  for (const pin of media.pins) {
    if (!isObject(pin) || !keysAre(pin, ['id', 'videoId', 't', 'text']) || typeof pin.id !== 'string' || !pin.id || pin.id.length > 64 || ids.has(pin.id)) fail();
    if (!isVideoId(pin.videoId) || !inRange(pin.t, 0, MAX_TIME) || typeof pin.text !== 'string' || !pin.text.trim() || pin.text.length > PIN_TEXT_MAX) fail();
    ids.add(pin.id);
  }
}

const olderThan = (iso, days, now) => now.getTime() - Date.parse(iso) >= days * DAY_MS;

/** Drops what the rules say is stale: auto videos after 30 days, "none" after 7. Unchanged media comes back as the same object. */
export function expireMedia(media, now) {
  const next = { ...media };
  let changed = false;
  for (const side of SIDES) {
    const entry = media[side];
    if ((entry?.none && olderThan(entry.foundAt, NONE_DAYS, now)) || (entry?.source === 'auto' && olderThan(entry.foundAt, AUTO_DAYS, now))) { next[side] = null; changed = true; }
  }
  if (media.sections?.none && olderThan(media.sections.checkedAt, NONE_DAYS, now)) { next.sections = null; changed = true; }
  return changed ? next : media;
}

export const mediaNeeds = media => ({ mv: media.mv === null, karaoke: media.karaoke === null, sections: media.sections === null });

function autoEntry(side, chosen, candidates, foundAt) {
  return { videoId: chosen.videoId, ...(side === 'karaoke' ? { kind: chosen.kind ?? 'unknown' } : {}), source: 'auto', foundAt, candidates };
}

export function withCandidates(media, side, candidates, now) {
  const list = candidates.slice(0, MAX_CANDIDATES);
  const foundAt = now.toISOString();
  return { ...media, [side]: list.length ? autoEntry(side, list[0], list, foundAt) : { none: true, foundAt } };
}

/** A candidate that will not play goes away; the next one takes its place, and none are left at the end. */
export function dropCandidate(media, side, videoId, now) {
  const entry = media[side];
  if (!entry || entry.none) return media;
  if (entry.source === 'pasted') return entry.videoId === videoId ? { ...media, [side]: null } : media;
  const index = entry.candidates.findIndex(candidate => candidate.videoId === videoId);
  if (index < 0) return media;
  const remaining = entry.candidates.filter((_, i) => i !== index);
  if (!remaining.length) return { ...media, [side]: { none: true, foundAt: now.toISOString() } };
  const chosen = entry.videoId === videoId ? remaining[index] ?? remaining[0] : entry.candidates.find(candidate => candidate.videoId === entry.videoId);
  return { ...media, [side]: autoEntry(side, chosen, remaining, entry.foundAt) };
}

export const hasOtherCandidates = entry => Boolean(entry && !entry.none && entry.candidates.length > 1);

export function nextCandidate(media, side) {
  const entry = media[side];
  if (!hasOtherCandidates(entry)) return media;
  const index = entry.candidates.findIndex(candidate => candidate.videoId === entry.videoId);
  const chosen = entry.candidates[(index + 1) % entry.candidates.length];
  return { ...media, [side]: { ...entry, videoId: chosen.videoId, ...(side === 'karaoke' ? { kind: chosen.kind ?? 'unknown' } : {}) } };
}

export function withPasted(media, side, videoId, now) {
  return { ...media, [side]: { videoId, ...(side === 'karaoke' ? { kind: 'unknown' } : {}), source: 'pasted', foundAt: now.toISOString(), candidates: [{ videoId }] } };
}

export const withSections = (media, { duration, sections }, now) => ({ ...media, sections: { duration, items: sections, checkedAt: now.toISOString() } });
export const withNoTiming = (media, now) => ({ ...media, sections: { none: true, checkedAt: now.toISOString() } });

/** After a rename, what was found for the old name goes; pasted videos, start offsets and pins stay. */
export function clearAutoMedia(media) {
  const keep = entry => entry && !entry.none && entry.source === 'pasted' ? entry : null;
  return { ...media, mv: keep(media.mv), karaoke: keep(media.karaoke), sections: null };
}

export const sameSongQuery = (song, { title, artist }) => Boolean(song) && song.title === title && song.artist === artist;

const round1 = value => Math.round(value * 10) / 10;
const clampTime = value => Math.min(MAX_TIME, Math.max(0, value));

// Sections are on the song's own clock; each video starts the song at its own offset (video time − song time).
export const startOf = (media, videoId) => media.starts[videoId] ?? 0;
export const isAligned = (media, videoId) => Object.hasOwn(media.starts, videoId);

function usedVideoIds(media, videoId) {
  const used = new Set([videoId]);
  for (const side of SIDES) {
    const entry = media[side];
    if (entry && !entry.none) { used.add(entry.videoId); entry.candidates.forEach(candidate => used.add(candidate.videoId)); }
  }
  media.pins.forEach(pin => used.add(pin.videoId));
  return used;
}

/** "Now is where the singing starts": the offset of this video against the first section. Offsets of unused videos go. */
export function setStart(media, videoId, videoTime) {
  const first = media.sections?.items?.[0];
  if (!first) return media;
  const used = usedVideoIds(media, videoId);
  const starts = Object.fromEntries(Object.entries(media.starts).filter(([id]) => used.has(id)));
  starts[videoId] = round1(Math.min(MAX_TIME, Math.max(-MAX_TIME, videoTime - first.t)));
  return { ...media, starts };
}

export function clearStart(media, videoId) {
  const { [videoId]: _removed, ...starts } = media.starts;
  return { ...media, starts };
}

export const toVideoTime = (media, videoId, songTime) => Math.max(0, round1(songTime + startOf(media, videoId)));
// A pin keeps the video and the moment the user marked; other videos show it through both offsets.
export const pinVideoTime = (media, pin, videoId) => Math.max(0, round1(pin.t - startOf(media, pin.videoId) + startOf(media, videoId)));
export const pinSongTime = (media, pin) => round1(pin.t - startOf(media, pin.videoId));

export function addPin(media, { videoId, t, text }, id) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new Error('메모 내용을 적어 주세요.');
  if (clean.length > PIN_TEXT_MAX) throw new Error('메모는 60자까지 쓸 수 있어요.');
  if (media.pins.length >= MAX_PINS) throw new Error('메모는 한 곡에 50개까지 남길 수 있어요.');
  return { ...media, pins: [...media.pins, { id, videoId, t: round1(clampTime(t)), text: clean }] };
}

export const removePin = (media, id) => ({ ...media, pins: media.pins.filter(pin => pin.id !== id) });

export function currentSectionIndex(items, songTime) {
  let current = -1;
  items.forEach((item, i) => { if (item.t <= songTime + 0.3) current = i; });
  return current;
}

const WATCH_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
/** The 11-character video id from a watch, youtu.be or shorts link; anything else is null. */
export function parseYoutubeLink(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  let id = null;
  if (WATCH_HOSTS.includes(url.hostname) && url.pathname === '/watch') id = url.searchParams.get('v');
  else if (WATCH_HOSTS.includes(url.hostname) && url.pathname.startsWith('/shorts/')) id = url.pathname.slice(8).split('/')[0];
  else if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  return id && VIDEO_ID.test(id) ? id : null;
}

export const youtubeWatchUrl = videoId => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
export const youtubeSearchUrl = query => `https://www.youtube.com/results?${new URLSearchParams({ search_query: query })}`;
const joinWords = words => words.map(word => String(word ?? '').trim()).filter(Boolean).join(' ');
export const videoSearchQuery = (song, side) => side === 'mv' ? joinWords([song.artist, song.title, 'MV']) : joinWords(['금영노래방', song.title, song.artist]);
export const tjVideoSearchUrl = (title, artist) => youtubeSearchUrl(joinWords(['TJ노래방', title, artist]));

export function formatTime(seconds) {
  const whole = Math.floor(Math.max(0, Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// "지금이 노래 시작" needs a video that has actually been started (playing 1 or paused 2): a cued video reports time 0.
export const canSetStart = ({ videoId, shownId, time, playerState }) => Boolean(videoId) && shownId === videoId && time !== null && [1, 2].includes(playerState);
