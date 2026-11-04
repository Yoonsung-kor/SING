// Finding a song's official MV and its KY (금영) karaoke video with the YouTube Data API, once per song and side.
// The key stays on the server: it is in the request URL only, never in an answer, an error or a log line.
import { createQueue, STALE } from './throttle.mjs';
import { unescapeHtml } from './tj.mjs';
import { coreTitle, titleMatches } from './title-match.mjs';

export const KY_CHANNEL_ID = 'UCDqaUIUSJP5EVMEI178Zfag';
const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const TIMEOUT_MS = 8000;
const MAX_CANDIDATES = 3;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MV_MARK = /(^|[^a-z])m\/?v([^a-z]|$)|music video|뮤직비디오/i;
const NOT_MV = /노래방|karaoke|cover|커버|가사|lyrics|teaser|티저/i;

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

export function createYoutubeClient({ apiKey, fetchImpl = fetch, queue = createQueue({ minIntervalMs: 250 }) }) {
  return async function findVideos({ side, title, artist }) {
    const result = await queue(async () => {
      let response;
      try { response = await fetchImpl(searchUrl({ side, title, artist, apiKey }), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
      catch { throw new YoutubeError('upstream'); }
      let body = null;
      try { body = await response.json(); } catch { body = null; }
      if (!response.ok) {
        const reason = body?.error?.errors?.[0]?.reason;
        throw new YoutubeError(response.status === 403 && ['quotaExceeded', 'dailyLimitExceeded'].includes(reason) ? 'quota' : 'upstream');
      }
      const items = body?.items;
      return { candidates: side === 'mv' ? pickMv(items, title) : pickKaraoke(items, title) };
    });
    if (result === STALE) throw new YoutubeError('busy');
    return result;
  };
}
