// Manual probe: `node scripts/check-search.mjs` runs five searches through the app's real search service
// (TJ first, one-vowel retries, MusicBrainz fallback), 1.5 s apart. At most about ten outside requests.
import { createTjClient } from './tj.mjs';
import { createQueue } from './throttle.mjs';
import { createSearcher } from './musicbrainz.mjs';
import { createSongSearch } from './song-search.mjs';

const QUERIES = ['엠씨더맥스', '앰씨더맥스', '바라보기', '너의 모든 순간', 'Hype Boy'];
const search = createSongSearch({ tj: createTjClient({ queue: createQueue() }), musicbrainz: createSearcher() });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const q of QUERIES) {
  const started = Date.now();
  try {
    const r = await search({ q, scope: 'kor', mode: 'search', page: 1 });
    console.log(`== "${q}" · ${Date.now() - started}ms · ${r.source}${r.retriedWith ? ` · 다시 찾은 말 "${r.retriedWith}"` : ''}${r.artist ? ` · 곡 전체 보기: ${r.artist}` : ''} · ${r.results.length}곡${r.hasMore ? '+' : ''}`);
    for (const row of r.results.slice(0, 5)) console.log(`   ${row.tjNumber || '-'} · ${row.title} · ${row.artist}`);
  } catch (error) {
    console.log(`== "${q}" · 실패: ${error.message}`);
  }
  await sleep(1500);
}
