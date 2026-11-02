import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler } from './server.mjs';
import { fetchRecommendations } from './ai.mjs';
import { toRecItems } from '../src/recommend.js';

// The OpenAI key lives only in .env on this machine; without it the app runs with AI recommendations off.
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
const recommend = apiKey && model
  ? async body => toRecItems(await fetchRecommendations(body, { apiKey, model }), [...body.exclude, ...body.rejected])
  : null;

const server = http.createServer(createHandler({ root, recommend }));
server.listen(port, host, () => console.log(`SING is ready at http://${host}:${port} · AI 추천: ${recommend ? '켜짐' : '꺼짐'}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
