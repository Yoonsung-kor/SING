// Manual probe: `node scripts/check-spots-ai.mjs` asks the model for the report's sentences three times, with the key
// in .env, and shows which answers the app keeps and which fall back to its own sentence. The key is never printed.
import { fileURLToPath } from 'node:url';
import { AiError, fetchSpotWords } from './ai.mjs';
import { cleanSpotWords, defaultSentence, validateSpotsRequest } from '../src/spot-words.js';
import { koreanNote } from '../src/notes.js';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) {
  console.error('.env에 OPENAI_API_KEY와 OPENAI_MODEL을 넣어 주세요. (.env.example 참고)');
  process.exit(1);
}

const payload = validateSpotsRequest({
  kind: 'spots',
  song: { title: '너의 모든 순간', artist: '성시경' },
  comfortableHigh: koreanNote(69),
  items: [
    { id: 's1', kind: 'leap', outcome: 'sag', section: '노래 시작 · 1절', from: koreanNote(60), to: koreanNote(67), over: null, repeated: false },
    { id: 's2', kind: 'high-hold', outcome: 'kept', section: '후렴 1', from: null, to: koreanNote(69), over: null, repeated: true },
    { id: 's3', kind: 'leap', outcome: 'ask', section: '마지막 후렴', from: koreanNote(62), to: koreanNote(72), over: 3, repeated: false },
  ],
});

let fallbacks = 0;
for (let round = 1; round <= 3; round++) {
  const started = Date.now();
  try {
    const raw = await fetchSpotWords(payload, { apiKey, model });
    const cleaned = cleanSpotWords(raw, payload);
    console.log(`\n${round}회 · ${model} · ${Date.now() - started}ms`);
    payload.items.forEach((item, i) => {
      const answer = (Array.isArray(raw?.items) ? raw.items : []).find(entry => entry?.id === item.id)?.text ?? '(없음)';
      const kept = cleaned[i].text !== defaultSentence(item) || answer.trim() === cleaned[i].text;
      if (!kept) fallbacks++;
      console.log(`- ${item.id} ${item.kind}/${item.outcome ?? '-'} ${kept ? 'AI 문장' : '기본 문장으로 바뀜'}\n  AI: ${answer}${kept ? '' : `\n  앱: ${cleaned[i].text}`}`);
    });
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    console.error(`${round}회 실패 (${error.code}): ${error.message}`);
  }
}
console.log(`\n기본 문장으로 바뀐 개수: ${fallbacks} / 9`);
