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
const AUDIO_NOT = /\b(inst|instrumental|mr|piano|acoustic|live|remix|karaoke|version|ver|edition|remaster(?:ed)?|japanese|english|chinese|sped|slowed|demo)\b|\(\s*with\b|tv size|반주|라이브|버전/i;
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

const hasHangul = text => /\p{Script=Hangul}/u.test(text);

/**
 * Does the Topic channel ("Artist - Topic") belong to this artist? In the same script the names must match;
 * a romanized channel cannot be compared with a Korean name (IU / 아이유): null, and the length has to decide.
 */
function artistFits(item, artist) {
  const channel = String(item.snippet.channelTitle).replace(/ - Topic$/, '');
  if (!artist || hasHangul(channel) !== hasHangul(artist)) return null;
  const a = matchKey(artist);
  const c = matchKey(channel);
  return Boolean(a && c && (c.includes(a) || a.includes(c)));
}

/**
 * Audio tracks of this song (checked on 31 songs, 2026-11-05). A track titled like the song is taken when its
 * artist fits, or, when the artist cannot be compared, when its length fits. A track with another (often
 * English) title that only fits the length is a guess (check: true): the caller confirms it against MV titles.
 * Two different titles of the same length are never guessed between. Without a length the title must be exact.
 */
export function pickAudio(items, durations, { title, artist, duration }) {
  const toCandidates = list => list.map(item => ({ videoId: item.id.videoId, kind: 'audio' })).slice(0, MAX_CANDIDATES);
  const known = Number.isFinite(duration);
  const fitsLength = item => known && Math.abs((durations.get(item.id.videoId) ?? -1) - duration) <= SAME_LENGTH_S;
  const plainKey = item => matchKey(coreTitle(titleOf(item)));
  const titled = item => known ? titleMatches(titleOf(item), title) : plainKey(item) === matchKey(coreTitle(title));
  const topics = topicItems(items);
  const sure = topics.filter(item => {
    if (!titled(item)) return false;
    const fits = artistFits(item, artist);
    if (fits === false || (known && !fitsLength(item))) return false;
    return fits === true || known;
  });
  if (sure.length) return toCandidates(sure);
  if (!known) return [];
  const guesses = topics.filter(item => fitsLength(item) && artistFits(item, artist) !== false);
  return new Set(guesses.map(plainKey)).size === 1 ? toCandidates(guesses).map(candidate => ({ ...candidate, check: true })) : [];
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
      // The daily quota is a 403 quotaExceeded; a rate limit (429, or 403 rateLimitExceeded) passes: try again later.
      if (response.status === 403 && ['quotaExceeded', 'dailyLimitExceeded'].includes(reason)) throw new YoutubeError('quota');
      if (response.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') throw new YoutubeError('busy');
      throw new YoutubeError('upstream');
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
      const audio = pickAudio(found, lengths, { title, artist, duration });
      if (audio.length && !audio[0].check) return { candidates: audio };
      const mv = (await getJson(searchUrl({ side: 'mv', title, artist, apiKey })))?.items;
      // A track found by length alone counts only when an MV title of this song names it ("Every Moment Of You").
      const mvKeys = (Array.isArray(mv) ? mv : []).map(item => matchKey(titleOf(item)));
      const confirmed = audio.filter(candidate => {
        const key = matchKey(coreTitle(titleOf(found.find(item => item.id.videoId === candidate.videoId))));
        return key.length >= 4 && mvKeys.some(mvKey => mvKey.includes(key));
      });
      if (confirmed.length) return { candidates: confirmed.map(({ check: _check, ...candidate }) => candidate) };
      return { candidates: pickMv(mv, title).map(candidate => ({ ...candidate, kind: 'mv' })) };
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
