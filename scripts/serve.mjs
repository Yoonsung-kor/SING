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
import { createAccess } from './access.mjs';

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
const findVideos = youtubeKey ? createYoutubeClient({ apiKey: youtubeKey, queue: createQueue({ minIntervalMs: 250 }) }) : null;

// Who may use the API on a shared server. Without INVITE_CODES (this PC) nothing is checked.
// Codes use the same characters an invite link can carry (#invite=CODE).
const INVITE = /^[A-Za-z0-9_-]{8,64}$/;
const inviteCodes = (process.env.INVITE_CODES ?? '').split(',').map(code => code.trim()).filter(Boolean);
let adminKey = process.env.ADMIN_KEY ?? '';
if (adminKey && adminKey.length < 16) { console.warn('ADMIN_KEY는 16자 이상이어야 해요. 사용량 주소를 끕니다.'); adminKey = ''; }
const formUrl = process.env.FEEDBACK_FORM_URL ?? '';
const feedbackUrl = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(formUrl) ? formUrl : null;
if (formUrl && !feedbackUrl) console.warn('FEEDBACK_FORM_URL은 구글 설문 주소(https://docs.google.com/forms/… 또는 https://forms.gle/…)만 받아요.');
const positive = name => { const value = Number(process.env[name]); return Number.isInteger(value) && value >= 1 ? value : undefined; };
const limits = Object.fromEntries(Object.entries({ aiTotal: positive('AI_DAILY_LIMIT'), aiPerDevice: positive('AI_DEVICE_DAILY_LIMIT'), videosPerDevice: positive('VIDEO_DEVICE_DAILY_LIMIT') }).filter(([, value]) => value !== undefined));
const access = createAccess({ inviteCodes, adminKey, trustProxy: process.env.TRUST_PROXY === '1', limits });

if (inviteCodes.some(code => !INVITE.test(code))) {
  console.error('INVITE_CODES: 초대 코드는 영문자·숫자·-·_로 8~64자여야 해요. 서버를 켜지 않았어요.');
  process.exitCode = 1;
} else {
  if (!access.inviteRequired && !['127.0.0.1', 'localhost', '::1'].includes(host)) console.warn('주의: 초대 코드 없이 바깥에서 열려 있어요. INVITE_CODES를 설정해 주세요.');
  const server = http.createServer(createHandler({ root, recommend, lookupRange, searchSongs, findSections, findVideos, practiceFeedback, access, config: { feedbackUrl } }));
  server.listen(port, host, () => console.log(`SING is ready at http://${host}:${port} · AI 추천: ${recommend ? '켜짐' : '꺼짐'} · 영상 찾기: ${findVideos ? '켜짐' : '꺼짐'} · 초대: ${access.inviteRequired ? '켜짐' : '꺼짐'}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
