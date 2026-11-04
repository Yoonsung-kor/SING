// Finding a song's official MV and its KY (금영) karaoke video with the YouTube Data API, once per song and side.
// The key stays on the server: it is in the request URL only, never in an answer, an error or a log line.
import { createQueue, STALE } from './throttle.mjs';
import { unescapeHtml } from './tj.mjs';
import { coreTitle, matchKey, titleMatches } from './title-match.mjs';

export const KY_CHANNEL_ID = 'UCDqaUIUSJP5EVMEI178Zfag';
const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const TIMEOUT_MS = 8000;
const MAX_CANDIDATES = 3;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MV_MARK = /(^|[^a-z])m\/?v([^a-z]|$)|music video|뮤직비디오/i;
const NOT_MV = /노래방|커버|가사|티저|\b(karaoke|cover|lyrics?|teaser)\b/i;

export class YoutubeError extends Error {
  constructor(code) { super(`youtube ${code}`); this.name = 'YoutubeError'; this.code = code; }
}

export function searchUrl({ side, title, artist, apiKey }) {
  const core = coreTitle(title);
  const words = side === 'mv' ? [artist, core, 'MV'] : [core, artist];
  const params = { part: 'snippet', type: 'video', maxResults: '10', regionCode: 'KR', videoEmbeddable: 'true', q: words.map(w => String(w ?? '').trim()).filter(Boolean).join(' ') };
  if (side === 'karaoke') params.channelId = KY_CHANNEL_ID;
  return `${ENDPOINT}?${new URLSearchParams({ ...params, key: apiKey })}`;
}

const titleOf = item => unescapeHtml(String(item?.snippet?.title ?? ''));
const usable = (items, songTitle) => (Array.isArray(items) ? items : []).filter(item => VIDEO_ID.test(item?.id?.videoId ?? '') && titleMatches(titleOf(item), songTitle));

/** KY titles: no leading bracket is the basic version, "[멜로디제거]" the melody-removed one; other brackets ([여자키]…) are left out. */
export function classifyKy(rawTitle) {
  const title = unescapeHtml(String(rawTitle ?? '')).trimStart();
  if (!title.startsWith('[')) return 'basic';
  return title.startsWith('[멜로디제거]') ? 'mr' : null;
}

export function pickKaraoke(items, songTitle) {
  const rows = usable(items, songTitle).map(item => ({ videoId: item.id.videoId, kind: classifyKy(item.snippet.title) })).filter(row => row.kind);
  return [...rows.filter(row => row.kind === 'basic'), ...rows.filter(row => row.kind === 'mr')].slice(0, MAX_CANDIDATES);
}

export function pickMv(items, songTitle) {
  return usable(items, songTitle).filter(item => MV_MARK.test(titleOf(item)) && !NOT_MV.test(titleOf(item))).map(item => ({ videoId: item.id.videoId })).slice(0, MAX_CANDIDATES);
}

// The official audio track ("Artist - Topic" channel) follows the release's timing, so lyric timing fits it as is.
const AUDIO_NOT = /\b(inst|instrumental|mr|piano|acoustic|live|remix|karaoke|version|ver|japanese|english|chinese|sped|slowed|demo)\b|tv size|반주|라이브|버전/i;
const SAME_LENGTH_S = 2;

/** "PT4M3S" → 243; null for anything else. */
export function parseIsoDuration(text) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(text ?? ''));
  if (!match || !match.slice(1).some(Boolean)) return null;
  const [, h = 0, m = 0, sec = 0] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
}

// "topic" in the query brings the "Artist - Topic" audio tracks up (checked 2026-11-05).
export function audioSearchUrl({ title, artist, apiKey }) {
  const params = { part: 'snippet', type: 'video', maxResults: '10', regionCode: 'KR', videoEmbeddable: 'true', q: [artist, coreTitle(title), 'topic'].map(w => String(w ?? '').trim()).filter(Boolean).join(' ') };
  return `${ENDPOINT}?${new URLSearchParams({ ...params, key: apiKey })}`;
}

export const videosUrl = (ids, apiKey) => `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key: apiKey })}`;

const topicItems = items => (Array.isArray(items) ? items : []).filter(item => VIDEO_ID.test(item?.id?.videoId ?? '') && String(item?.snippet?.channelTitle ?? '').endsWith(' - Topic') && !AUDIO_NOT.test(titleOf(item)));

/**
 * Audio tracks of this song: Topic channels only, other versions left out. Their titles are often English, so the
 * song's length decides; a title that names the song wins, and two different titles of the same length are too
 * ambiguous to guess (the MV stands in). Without a length only a track titled exactly like the song counts.
 */
export function pickAudio(items, durations, { title, duration }) {
  const toCandidates = list => list.map(item => ({ videoId: item.id.videoId, kind: 'audio' })).slice(0, MAX_CANDIDATES);
  const topics = topicItems(items);
  const plainKey = item => matchKey(coreTitle(titleOf(item)));
  if (!Number.isFinite(duration)) return toCandidates(topics.filter(item => plainKey(item) === matchKey(coreTitle(title))));
  const fits = topics.filter(item => Math.abs((durations.get(item.id.videoId) ?? -1) - duration) <= SAME_LENGTH_S);
  const named = fits.filter(item => titleMatches(titleOf(item), title));
  if (named.length) return toCandidates(named);
  return new Set(fits.map(plainKey)).size > 1 ? [] : toCandidates(fits);
}

export function createYoutubeClient({ apiKey, fetchImpl = fetch, queue = createQueue({ minIntervalMs: 250 }) }) {
  async function getJson(url) {
    let response;
    try { response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new YoutubeError('upstream'); }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const reason = body?.error?.errors?.[0]?.reason;
      throw new YoutubeError(response.status === 403 && ['quotaExceeded', 'dailyLimitExceeded'].includes(reason) ? 'quota' : 'upstream');
    }
    return body;
  }

  async function findOriginal({ title, artist, duration }) {
    const found = (await getJson(audioSearchUrl({ title, artist, apiKey })))?.items;
    const topics = topicItems(found);
    if (topics.length) {
      let lengths = new Map();
      if (Number.isFinite(duration)) {
        const details = (await getJson(videosUrl(topics.map(item => item.id.videoId), apiKey)))?.items ?? [];
        lengths = new Map(details.map(video => [video.id, parseIsoDuration(video.contentDetails?.duration)]));
      }
      const audio = pickAudio(found, lengths, { title, duration });
      if (audio.length) return { candidates: audio };
    }
    // No audio track for this song: the MV stands in.
    const mv = (await getJson(searchUrl({ side: 'mv', title, artist, apiKey })))?.items;
    return { candidates: pickMv(mv, title).map(candidate => ({ ...candidate, kind: 'mv' })) };
  }

  return async function findVideos({ side, title, artist, duration }) {
    const result = await queue(async () => side === 'mv'
      ? findOriginal({ title, artist, duration })
      : { candidates: pickKaraoke((await getJson(searchUrl({ side, title, artist, apiKey })))?.items, title) });
    if (result === STALE) throw new YoutubeError('busy');
    return result;
  };
}
