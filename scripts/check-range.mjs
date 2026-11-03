// Manual probe: `node scripts/check-range.mjs` looks up ten well-known songs with the key in .env and reports,
// per song, whether the AI found a top note and whether the server could confirm it on the cited page.
// About ten AI calls. The key is never printed.
import { fileURLToPath } from 'node:url';
import { fetchSongRange, AiError } from './ai.mjs';
import { verifyHighest, fetchPageText } from './verify-source.mjs';
import { noteLabel } from '../src/notes.js';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) {
  console.error('.env에 OPENAI_API_KEY와 OPENAI_MODEL을 넣어 주세요. (.env.example 참고)');
  process.exit(1);
}

const SONGS = [
  ['밤편지', '아이유'], ['좋은 날', '아이유'], ['너의 모든 순간', '성시경'], ['취중고백', '김민석'], ['사건의 지평선', '윤하'],
  ['Hype Boy', 'NewJeans'], ['소주 한 잔', '임창정'], ['응급실', 'izi'], ['천년의 사랑', '박완규'], ['모든 날, 모든 순간', '폴킴'],
];

let found = 0, confirmed = 0, slowest = 0;
for (const [title, artist] of SONGS) {
  const started = Date.now();
  let line;
  try {
    const raw = await fetchSongRange({ title, artist }, { apiKey, model });
    if (!raw?.found) line = '못 찾음';
    else {
      found++;
      const checked = await verifyHighest(raw, { getPage: fetchPageText });
      const host = (() => { try { return new URL(raw.sourceUrl).host; } catch { return '?'; } })();
      if (checked) {
        confirmed++;
        line = `확인됨 · 진성 ${noteLabel(checked.highestMidi)}${checked.falsettoHighestMidi !== null ? ` · 가성 ${noteLabel(checked.falsettoHighestMidi)}` : ''} · 보컬 ${checked.vocal ?? '?'} · ${host}`;
      } else line = `찾았지만 확인 실패 · AI 값 ${raw.chestHighest}${raw.falsettoHighest ? `/${raw.falsettoHighest}` : ''} · ${host} · 인용 "${String(raw.sourceQuote ?? '').slice(0, 60)}"`;
    }
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    line = `실패 (${error.code})`;
  }
  const ms = Date.now() - started;
  slowest = Math.max(slowest, ms);
  console.log(`${title} / ${artist} · ${Math.round(ms / 100) / 10}s · ${line}`);
}
console.log(`\n찾음 ${found}/${SONGS.length} · 확인됨 ${confirmed}/${found} · 가장 오래 걸린 곡 ${Math.round(slowest / 1000)}s`);
