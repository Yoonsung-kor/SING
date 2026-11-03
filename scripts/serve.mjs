import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler } from './server.mjs';
import { createServices } from './services.mjs';
import { createSearcher } from './musicbrainz.mjs';
import { createTjClient } from './tj.mjs';
import { createQueue } from './throttle.mjs';
import { createSongSearch } from './song-search.mjs';

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
const { lookupRange, recommend, searchSongs } = createServices({ apiKey, model, search });

const server = http.createServer(createHandler({ root, recommend, lookupRange, searchSongs }));
server.listen(port, host, () => console.log(`SING is ready at http://${host}:${port} · AI 추천: ${recommend ? '켜짐' : '꺼짐'}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
