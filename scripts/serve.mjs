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

const server = http.createServer(createHandler({ root, recommend, lookupRange, searchSongs, findSections, findVideos, practiceFeedback }));
server.listen(port, host, () => console.log(`SING is ready at http://${host}:${port} · AI 추천: ${recommend ? '켜짐' : '꺼짐'} · 영상 찾기: ${findVideos ? '켜짐' : '꺼짐'}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
