// Manual probe: `node scripts/check-ai.mjs` sends one fixed recommendation request with the key in .env,
// through the same service the app uses (AI candidates → page checks → my-range picks). The key is never printed.
import { fileURLToPath } from 'node:url';
import { AiError } from './ai.mjs';
import { createServices } from './services.mjs';
import { validateRecommendationRequest } from '../src/recommend.js';
import { koreanNote } from '../src/notes.js';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) {
  console.error('.env에 OPENAI_API_KEY와 OPENAI_MODEL을 넣어 주세요. (.env.example 참고)');
  process.exit(1);
}

const songs = [['밤편지', '아이유'], ['취중고백', '김민석'], ['너의 모든 순간', '성시경']];
const request = validateRecommendationRequest({
  playlistName: '도전하기',
  songs: songs.map(([title, artist]) => ({ title, artist, keyOffset: 0, lowestMidi: null, highestMidi: null, fromAi: false })),
  exclude: songs.map(([title, artist]) => ({ title, artist })),
  rejected: [],
  voice: { comfortableHigh: 'B4', voiceType: 'male' },
});

const started = Date.now();
try {
  const result = await createServices({ apiKey, model }).recommend(request);
  console.log(`모델 ${model} · ${Date.now() - started}ms · 의도 ${result.intent} · 고른 곡 ${result.items.length}곡${result.fallback ? ' · 확인된 곡이 없어 분위기로 고름' : ''}`);
  for (const item of result.items) {
    const high = item.range ? `${koreanNote(item.range.highestMidi)} ✓ · 내 최고음과 차이 ${item.range.highestMidi - request.voice.comfortableHighMidi}` : '최고음 확인 안 됨';
    console.log(`- ${item.title} / ${item.artist} · ${high}\n  이유: ${item.reason}`);
  }
  if (Date.now() - started > 45000) console.log('참고: 45초를 넘었어요. 따로 찾기를 줄일지 검토가 필요해요.');
} catch (error) {
  if (!(error instanceof AiError)) throw error;
  console.error(`실패 (${error.code}): ${error.message}`);
  process.exit(1);
}
