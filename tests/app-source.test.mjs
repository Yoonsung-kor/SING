// Checks on the app's source text for rules a unit test cannot reach (app.js needs a browser to run).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('every API call goes through the one client (invite code, device id, limits)', () => {
  assert.doesNotMatch(app, /fetch\(\s*['"`]\/api/);
  assert.match(app, /api\.request\(/);
});

test('the karaoke analysis path never sends or stores the recording', async () => {
  const { existsSync } = await import('node:fs');
  for (const name of ['melody-tracker.js', 'resample.js', 'karaoke-analysis.js', 'analysis-worker.js', 'pcm-worklet.js']) {
    const file = new URL(`../src/${name}`, import.meta.url);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const word of ['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'indexedDB', 'localStorage']) assert.ok(!text.includes(word), `${name} mentions ${word}`);
  }
  assert.ok(existsSync(new URL('../src/karaoke-analysis.js', import.meta.url)), 'the analysis exists');
});
