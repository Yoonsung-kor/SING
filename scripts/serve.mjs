import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler } from './server.mjs';
import { createServices } from './services.mjs';
import { createSearcher } from './musicbrainz.mjs';
import { createTjClient } from './tj.mjs';
import { createQueue } from './throttle.mjs';
import { createSongSearch } from './song-search.mjs';
import { createLrclibClient } from './lrclib.mjs';
import { createYoutubeClient } from './youtube.mjs';
import { createAccess, startupProblem } from './access.mjs';
import { createVideoCache } from './video-cache.mjs';

// The OpenAI key lives only in .env on this machine; without it the app runs with AI recommendations off.
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
// Song search needs no key, so it stays on even when the AI is off.
// TJ first (one page per user search, nothing stored), MusicBrainz when TJ has nothing or is down.
const search = createSongSearch({ tj: createTjClient(), musicbrainz: createSearcher(), queue: createQueue() });
const { lookupRange, recommend, searchSongs, practiceFeedback } = createServices({ apiKey, model, search });

// Song sections come from lyric timing (no key); only section times and names leave the server.
const findSections = createLrclibClient({ queue: createQueue() });
// Video search needs the YouTube Data API key in .env; without it the song screen offers pasting a link only.
const youtubeKey = process.env.YOUTUBE_API_KEY;
// Found videos are kept for a week in memory, so a song many friends open is searched once.
const findVideos = youtubeKey ? createVideoCache({ find: createYoutubeClient({ apiKey: youtubeKey, queue: createQueue({ minIntervalMs: 250 }) }) }) : null;

// Who may use the API on a shared server. Without INVITE_CODES nothing is checked, which is allowed on this PC only.
const inviteCodes = (process.env.INVITE_CODES ?? '').split(',').map(code => code.trim()).filter(Boolean);
let adminKey = process.env.ADMIN_KEY ?? '';
if (adminKey && adminKey.length < 16) { console.warn('ADMIN_KEY는 16자 이상이어야 해요. 사용량 주소를 끕니다.'); adminKey = ''; }
const formUrl = process.env.FEEDBACK_FORM_URL ?? '';
const feedbackUrl = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(formUrl) ? formUrl : null;
if (formUrl && !feedbackUrl) console.warn('FEEDBACK_FORM_URL은 구글 설문 주소(https://docs.google.com/forms/… 또는 https://forms.gle/…)만 받아요.');
const positive = name => { const value = Number(process.env[name]); return Number.isInteger(value) && value >= 1 ? value : undefined; };
const limits = Object.fromEntries(Object.entries({ aiTotal: positive('AI_DAILY_LIMIT'), aiPerDevice: positive('AI_DEVICE_DAILY_LIMIT'), videosPerDevice: positive('VIDEO_DEVICE_DAILY_LIMIT') }).filter(([, value]) => value !== undefined));
const access = createAccess({ inviteCodes, adminKey, trustProxy: process.env.TRUST_PROXY === '1', limits });

const problem = startupProblem({ host, inviteCodes });
if (problem) {
  console.error(problem);
  process.exitCode = 1;
} else {
  const server = http.createServer(createHandler({ root, recommend, lookupRange, searchSongs, findSections, searchLyrics: findSections.search, findVideos, practiceFeedback, access, config: { feedbackUrl } }));
  server.listen(port, host, () => console.log(`SING is ready at http://${host}:${port} · AI 추천: ${recommend ? '켜짐' : '꺼짐'} · 영상 찾기: ${findVideos ? '켜짐' : '꺼짐'} · 초대: ${access.inviteRequired ? '켜짐' : '꺼짐'}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
