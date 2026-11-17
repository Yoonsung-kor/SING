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
  for (const name of ['melody-tracker.js', 'resample.js', 'karaoke-analysis.js', 'analysis-worker.js', 'pcm-worklet.js', 'karaoke-recorder.js', 'karaoke-file.js', 'analysis-client.js']) {
    const file = new URL(`../src/${name}`, import.meta.url);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const word of ['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'indexedDB', 'localStorage']) assert.ok(!text.includes(word), `${name} mentions ${word}`);
  }
  assert.ok(existsSync(new URL('../src/karaoke-analysis.js', import.meta.url)), 'the analysis exists');
});

test('the karaoke recording is never saved: it never reaches persist() or the store', () => {
  const calls = app.split('\n').filter(line => /persist\(|store\./.test(line));
  assert.ok(calls.length > 5);
  for (const line of calls) assert.ok(!/karaokeTake|karaokeRecorder|decoded/.test(line), line.trim());
});

test('recording in the app stays behind ?record until it is checked at a karaoke room, and stops when the screen is left', () => {
  assert.match(app, /new URLSearchParams\(location\.search\)\.has\('record'\)/);
  assert.match(app, /document\.hidden && karaokeRecorder/);
  // Leaving the song screen or the page lets go of the microphone.
  assert.match(app.slice(app.indexOf('function stopSongPlayer'), app.indexOf('function dropSinging')), /discardKaraokeRecording\(\)/);
  assert.match(app, /addEventListener\('pagehide'[^\n]*discardKaraokeRecording\(\)/);
});
