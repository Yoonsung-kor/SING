import assert from 'node:assert/strict';
import test from 'node:test';
import { KY_CHANNEL_ID, YoutubeError, searchUrl, classifyKy, pickKaraoke, pickMv, createYoutubeClient } from '../scripts/youtube.mjs';
import { STALE } from '../scripts/throttle.mjs';

const TJ_TITLE = '너의모든순간(별에서온그대OST)';
const item = (videoId, title) => ({ id: { kind: 'youtube#video', videoId }, snippet: { title, channelId: 'x' } });
const ids = { A: 'AAAAAAAAAAA', B: 'BBBBBBBBBBB', C: 'CCCCCCCCCCC', D: 'DDDDDDDDDDD', E: 'EEEEEEEEEEE' };
const run = task => task({ isStale: () => false });
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

test('search urls: MV across YouTube, karaoke inside the KY channel, both embeddable only', () => {
  const mv = new URL(searchUrl({ side: 'mv', title: TJ_TITLE, artist: '성시경', apiKey: 'k' }));
  assert.equal(mv.origin + mv.pathname, 'https://www.googleapis.com/youtube/v3/search');
  assert.equal(mv.searchParams.get('q'), '성시경 너의모든순간 MV');
  assert.equal(mv.searchParams.get('channelId'), null);
  const ky = new URL(searchUrl({ side: 'karaoke', title: TJ_TITLE, artist: '성시경', apiKey: 'k' }));
  assert.equal(ky.searchParams.get('channelId'), KY_CHANNEL_ID);
  assert.equal(ky.searchParams.get('q'), '너의모든순간 성시경');
  for (const url of [mv, ky]) {
    assert.deepEqual(['part', 'type', 'maxResults', 'regionCode', 'videoEmbeddable', 'key'].map(k => url.searchParams.get(k)), ['snippet', 'video', '10', 'KR', 'true', 'k']);
  }
});

test('KY titles: no bracket is the basic version, [멜로디제거] the melody-removed one, other brackets are left out', () => {
  assert.equal(classifyKy('[멜로디제거] 너의 모든 순간(드라마 &#39;별에서 온 그대&#39;) - 성시경 (KY.48367) / KY Karaoke'), 'mr');
  assert.equal(classifyKy('Stay(드라마 &quot;너 말고 다른 연애&quot;) - LUCY (KY.51934) / KY KARAOKE'), 'basic');
  assert.equal(classifyKy('[여자키] 너의 모든 순간 - 성시경 (KY.48367) / KY Karaoke'), null);
});

test('karaoke picks: this song only, basic before melody-removed, at most three', () => {
  const items = [item(ids.A, '[멜로디제거] 너의 모든 순간(드라마 &#39;별에서 온 그대&#39;) - 성시경 (KY.48367) / KY Karaoke'), item(ids.B, '[여자키] 너의 모든 순간 - 성시경 (KY.48367) / KY Karaoke'), item(ids.C, '너의 모든 순간(드라마 &#39;별에서 온 그대&#39;) - 성시경 (KY.48367) / KY Karaoke'), item(ids.D, '여기 내 맘속에 - 성시경 (KY.85847) / KY Karaoke'), item('bad', '너의 모든 순간')];
  assert.deepEqual(pickKaraoke(items, TJ_TITLE), [{ videoId: ids.C, kind: 'basic' }, { videoId: ids.A, kind: 'mr' }]);
});

test('MV picks: an MV mark, no karaoke, lyric, cover or teaser marks, the song name may sit in brackets', () => {
  const items = [item(ids.A, '[TJ노래방] 너의모든순간(별에서온그대OST) - 성시경 / TJ Karaoke'), item(ids.B, '성시경 - 너의 모든 순간 [가사/Lyrics]'), item(ids.C, '[Teaser] 너의 모든 순간 MV'), item(ids.D, '성시경 너의 모든 순간 라이브'), item(ids.E, '[MV] 성시경 _ Every Moment Of You(너의 모든 순간) (Original) (My Love From the Star(별에서 온 그대) OST)')];
  assert.deepEqual(pickMv(items, TJ_TITLE), [{ videoId: ids.E }]);
  assert.deepEqual(pickMv([item(ids.A, 'IU &amp; 성시경 &#39;너의 모든 순간&#39; M/V')], TJ_TITLE), [{ videoId: ids.A }]);
});

test('the client maps quota, stale and other failures, and never puts the key in an error', async () => {
  const find = (fetchImpl, queue = run) => createYoutubeClient({ apiKey: 'SECRETKEY', fetchImpl, queue });
  const quota = { error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } };
  for (const [fetchImpl, code, queue] of [[async () => reply(403, quota), 'quota'], [async () => reply(500, {}), 'upstream'], [async () => { throw new Error('https://x?key=SECRETKEY'); }, 'upstream'], [async () => reply(200, { items: [] }), 'busy', async () => STALE]]) {
    await assert.rejects(find(fetchImpl, queue)({ side: 'mv', title: 'x', artist: '' }), error => error instanceof YoutubeError && error.code === code && !String(error.message).includes('SECRETKEY') && !String(error.stack).includes('SECRETKEY'));
  }
  const ok = await find(async () => reply(200, { items: [item(ids.E, '[MV] 성시경 _ Every Moment Of You(너의 모든 순간)')] }))({ side: 'mv', title: TJ_TITLE, artist: '성시경' });
  assert.deepEqual(ok, { candidates: [{ videoId: ids.E, kind: 'mv' }] });
});

// --- Audio track (YouTube "Topic") for the original side ---
import { parseIsoDuration, audioSearchUrl, videosUrl, pickAudio } from '../scripts/youtube.mjs';

const topic = (videoId, title, channelTitle = 'Sung Si Kyung - Topic') => ({ id: { kind: 'youtube#video', videoId }, snippet: { title, channelTitle } });
const AUD = 'izssDYTMXis', PIA = 'Ps2UeoRG-U8', INS = 'Ja4cIsLZ8YI', LYR = '1qzbXDsUd2E', KOR = 'KORKORKORKO';
const audioItems = [topic(AUD, 'Every Moment Of You (Original)'), topic(PIA, 'Every Moment Of You (Piano Ver.)'), topic(INS, 'Every moment of you (Instrumental)'), topic(LYR, '성시경 - 너의 모든 순간 [별에서 온 그대 OST] [가사/Lyrics]', '웅키')];

test('ISO 8601 video lengths become seconds', () => {
  assert.equal(parseIsoDuration('PT4M3S'), 243);
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(parseIsoDuration('PT45S'), 45);
  assert.equal(parseIsoDuration('4:03'), null);
});

test('audio search and length urls', () => {
  const search = new URL(audioSearchUrl({ title: TJ_TITLE, artist: '성시경', apiKey: 'k' }));
  assert.equal(search.searchParams.get('q'), '성시경 너의모든순간 topic');
  assert.equal(search.searchParams.get('videoEmbeddable'), 'true');
  assert.equal(search.searchParams.get('channelId'), null);
  const videos = new URL(videosUrl([AUD, PIA], 'k'));
  assert.equal(videos.origin + videos.pathname, 'https://www.googleapis.com/youtube/v3/videos');
  assert.deepEqual(['part', 'id', 'key'].map(k => videos.searchParams.get(k)), ['contentDetails', `${AUD},${PIA}`, 'k']);
});

test('audio picks: a Topic track of the same length, never other versions or other channels', () => {
  const lengths = new Map([[AUD, 243], [PIA, 250], [INS, 243], [LYR, 243]]);
  assert.deepEqual(pickAudio(audioItems, lengths, { title: TJ_TITLE, artist: '성시경', duration: 243 }), [{ videoId: AUD, kind: 'audio', check: true }]);
  assert.deepEqual(pickAudio(audioItems, lengths, { title: TJ_TITLE, duration: 300 }), []);
  // Without a known length only a title that matches can tell it is this song.
  const korean = [...audioItems, topic(KOR, '너의 모든 순간')];
  assert.deepEqual(pickAudio(korean, new Map(), { title: TJ_TITLE, artist: 'Sung Si Kyung' }), [{ videoId: KOR, kind: 'audio' }]);
});

test('the original side asks for the audio track first and falls back to an MV search', async () => {
  const asked = [];
  const mvItems = [item(ids.E, '[MV] 성시경 _ Every Moment Of You(너의 모든 순간) (Original)')];
  const fake = withAudio => async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/videos')) { asked.push('videos'); return reply(200, { items: u.searchParams.get('id').split(',').map(id => ({ id, contentDetails: { duration: id === AUD ? 'PT4M3S' : 'PT4M10S' } })) }); }
    const isMv = u.searchParams.get('q').endsWith(' MV');
    asked.push(isMv ? 'mv-search' : 'audio-search');
    return reply(200, { items: isMv ? mvItems : withAudio ? audioItems : [] });
  };
  const found = await createYoutubeClient({ apiKey: 'k', fetchImpl: fake(true), queue: run })({ side: 'mv', title: TJ_TITLE, artist: '성시경', duration: 243 });
  assert.deepEqual(found, { candidates: [{ videoId: AUD, kind: 'audio' }] });
  assert.deepEqual(asked, ['audio-search', 'videos', 'mv-search']);
  asked.length = 0;
  const fallback = await createYoutubeClient({ apiKey: 'k', fetchImpl: fake(false), queue: run })({ side: 'mv', title: TJ_TITLE, artist: '성시경', duration: 243 });
  assert.deepEqual(fallback, { candidates: [{ videoId: ids.E, kind: 'mv' }] });
  assert.deepEqual(asked, ['audio-search', 'mv-search']);
});

test('audio picks never guess between different songs of the same length', () => {
  const OTHER = 'OTHEROTHER1', RIGHT = 'RIGHTRIGHT1', JAP = 'JAPANJAPAN1', ALIVE = 'ALIVEALIVE1';
  // Two different English titles fit the length and neither names the song: ambiguous, so the MV stands in.
  const twoSongs = [topic(OTHER, 'Another Song'), topic(RIGHT, 'Every Moment Of You (Original)')];
  assert.deepEqual(pickAudio(twoSongs, new Map([[OTHER, 242], [RIGHT, 243]]), { title: TJ_TITLE, duration: 243 }), []);
  // A title that names the song wins over others of the same length.
  const named = [topic(OTHER, 'Another Song'), topic(KOR, '너의 모든 순간')];
  assert.deepEqual(pickAudio(named, new Map([[OTHER, 243], [KOR, 243]]), { title: TJ_TITLE, artist: '성시경', duration: 243 }), [{ videoId: KOR, kind: 'audio' }]);
  // Other versions are left out; words like Alive are not.
  const versions = [topic(JAP, 'Every Moment Of You (Japanese Version)'), topic(ALIVE, 'Love Me Like I am Alive')];
  assert.deepEqual(pickAudio(versions, new Map([[JAP, 243], [ALIVE, 243]]), { title: 'Love Me Like I am Alive', artist: 'Sung Si Kyung', duration: 243 }), [{ videoId: ALIVE, kind: 'audio' }]);
  // Without a length the title must be the song's title, not just contain it.
  assert.deepEqual(pickAudio([topic(OTHER, '그대에게'), topic(RIGHT, '그대')], new Map(), { title: '그대', artist: 'Sung Si Kyung' }), [{ videoId: RIGHT, kind: 'audio' }]);
});

test('MV marks for covers and lyrics are whole words: UNDERCOVER and Discover stay', () => {
  assert.deepEqual(pickMv([item(ids.A, 'A.C.E(에이스) - UNDERCOVER M/V')], 'UNDERCOVER'), [{ videoId: ids.A }]);
  assert.deepEqual(pickMv([item(ids.B, 'Discover Love [MV]')], 'Discover Love'), [{ videoId: ids.B }]);
  assert.deepEqual(pickMv([item(ids.C, 'UNDERCOVER (cover by fan) MV')], 'UNDERCOVER'), []);
  assert.deepEqual(pickMv([item(ids.D, 'UNDERCOVER MV with Lyrics')], 'UNDERCOVER'), []);
});

test('overnight survey cases: wrong songs and other artists are not taken as the original', async () => {
  const id = n => `SURVEY0000${n}`;
  // 밤편지: the only Topic track of that length is another IU song; no MV title names it, so the MV stands in.
  const night = { audio: [topic(id(1), 'Give You My Heart (마음을 드려요)', 'IU - Topic')], lengths: { [id(1)]: 'PT4M43S' }, mv: [item(id(2), 'IU(아이유) _ Through the Night(밤편지) MV')] };
  // 취중고백: same title by another artist ("Release"), no known length: not taken.
  const cover = { audio: [topic(id(3), '취중 고백 (feat. 오수민)', 'Release - Topic')], lengths: {}, mv: [item(id(4), '[MV] 김민석 (멜로망스) - 취중고백')] };
  // 응급실 by izi: the artist name is in the channel name, so the title is enough.
  const izi = { audio: [topic(id(5), '응급실', 'izi(Oh Jin Sung) - Topic')], lengths: {}, mv: [] };
  // Re-recordings and duets are other versions.
  const versions = { audio: [topic(id(6), 'No matter where (20th Edition) (어디에도 (20th edition))', 'M.C the MAX - Topic'), topic(id(7), '너를 만나 (with 폴인럽)', 'Paul Kim - Topic')], lengths: {}, mv: [] };
  const run = async (song, data, duration) => {
    const fetchImpl = async url => {
      const u = new URL(url);
      if (u.pathname.endsWith('/videos')) return reply(200, { items: u.searchParams.get('id').split(',').map(v => ({ id: v, contentDetails: { duration: data.lengths[v] ?? 'PT1S' } })) });
      return reply(200, { items: u.searchParams.get('q').endsWith(' MV') ? data.mv : data.audio });
    };
    return (await createYoutubeClient({ apiKey: 'k', fetchImpl, queue: task => task({ isStale: () => false }) })({ side: 'mv', ...song, duration })).candidates;
  };
  assert.deepEqual(await run({ title: '밤편지', artist: '아이유' }, night, 283), [{ videoId: id(2), kind: 'mv' }]);
  assert.deepEqual(await run({ title: '취중고백', artist: '김민석' }, cover), [{ videoId: id(4), kind: 'mv' }]);
  assert.deepEqual(await run({ title: '응급실', artist: 'izi' }, izi), [{ videoId: id(5), kind: 'audio' }]);
  assert.deepEqual(await run({ title: '어디에도', artist: '엠씨더맥스' }, versions), []);
  assert.deepEqual(await run({ title: '너를 만나', artist: '폴킴' }, versions), []);
  // 사랑은 늘 도망가 (임영웅): 이문세's version, other script and no known length: not taken.
  const other = { audio: [topic(id(8), '사랑은 늘 도망가', 'Lee Moon Sae - Topic')], lengths: {}, mv: [] };
  assert.deepEqual(await run({ title: '사랑은 늘 도망가', artist: '임영웅' }, other), []);
  // Dynamite: a romanized channel cannot be compared with 방탄소년단, but the length fits: taken.
  const dynamite = { audio: [topic(id(9), 'Dynamite - BTS', 'Bts - Topic')], lengths: { [id(9)]: 'PT3M19S' }, mv: [] };
  assert.deepEqual(await run({ title: 'Dynamite', artist: '방탄소년단' }, dynamite, 199), [{ videoId: id(9), kind: 'audio' }]);
});

test('a 429 rate limit from YouTube is "busy" (try again later), not an upstream failure', async () => {
  const limited = { error: { code: 429, errors: [{ reason: 'rateLimitExceeded', domain: 'global' }] } };
  await assert.rejects(createYoutubeClient({ apiKey: 'k', fetchImpl: async () => reply(429, limited), queue: run })({ side: 'karaoke', title: 'x', artist: '' }), error => error instanceof YoutubeError && error.code === 'busy');
  const forbidden = { error: { code: 403, errors: [{ reason: 'rateLimitExceeded' }] } };
  await assert.rejects(createYoutubeClient({ apiKey: 'k', fetchImpl: async () => reply(403, forbidden), queue: run })({ side: 'karaoke', title: 'x', artist: '' }), error => error instanceof YoutubeError && error.code === 'busy');
});
