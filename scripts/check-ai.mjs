// Manual probe: `node scripts/check-ai.mjs` sends one fixed recommendation request with the key in .env.
// It prints what came back so a person can check the songs and sources. The key is never printed.
import { fileURLToPath } from 'node:url';
import { fetchRecommendations, AiError } from './ai.mjs';
import { toRecItems } from '../src/recommend.js';
import { noteName } from '../src/pitch.js';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) {
  console.error('.env에 OPENAI_API_KEY와 OPENAI_MODEL을 넣어 주세요. (.env.example 참고)');
  process.exit(1);
}

const songs = [['밤편지', '아이유'], ['취중고백', '김민석'], ['너의 모든 순간', '성시경']];
const request = {
  playlistName: '어렵지 않게 부르는 거',
  songs: songs.map(([title, artist]) => ({ title, artist, keyOffset: 0, lowestMidi: null, highestMidi: null, fromAi: false })),
  exclude: songs.map(([title, artist]) => ({ title, artist })),
  rejected: [],
};

const started = Date.now();
try {
  const raw = await fetchRecommendations(request, { apiKey, model, timeoutMs: 90000 });
  const items = toRecItems(raw, [...request.exclude, ...request.rejected]);
  console.log(`모델 ${model} · ${Date.now() - started}ms · AI 후보 ${Array.isArray(raw?.items) ? raw.items.length : 0}곡 → 검증 통과 ${items.length}곡`);
  for (const item of items) {
    const range = item.range ? `${noteName(item.range.lowestMidi).scientific}~${noteName(item.range.highestMidi).scientific} (출처 표기: ${item.range.sourceNotation || '-'}) ${item.range.sourceUrl}` : '음역 정보 없음';
    console.log(`- ${item.title} / ${item.artist}\n  이유: ${item.reason}\n  곡: ${item.songUrl}\n  음역: ${range}`);
  }
  if (Date.now() - started > 30000) console.log('주의: 30초를 넘었어요. 서버 시간 제한(30초)에 걸릴 수 있어요.');
} catch (error) {
  if (!(error instanceof AiError)) throw error;
  console.error(`실패 (${error.code}): ${error.message}`);
  process.exit(1);
}
