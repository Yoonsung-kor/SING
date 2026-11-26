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

test('the invite field goes through inviteFromInput, so a pasted link works too', () => {
  const submit = app.slice(app.indexOf('async function submitInvite'), app.indexOf('async function resumeOrCreate'));
  assert.match(submit, /inviteFromInput\(new FormData\(form\)\.get\('code'\)\)/);
  assert.doesNotMatch(submit, /\{8,64\}/, 'no second copy of the code rule');
});

test('the karaoke file input lives outside the redrawn page, so a redraw while the picker is open cannot lose the file', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const input = index.indexOf('<input class="file-input" type="file" id="karaoke-file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.3gp"');
  assert.ok(input > 0, 'index.html has the input');
  assert.ok(input > index.indexOf('<div id="app">') && input > index.indexOf('</div>', index.indexOf('<div id="app">')), 'after the app element');
  assert.match(app, /document\.querySelector\('#karaoke-file'\)\?\.addEventListener\('change'/);
  const from = app.indexOf("root.addEventListener('change'");
  const rootChange = app.slice(from, app.indexOf('\n});', from));
  assert.doesNotMatch(rootChange, /karaoke-file/);
});

// docs/superpowers/ holds private notes (git-ignored): public docs must not link into it.
const privateLinks = text => [...text.matchAll(/\]\((?:\.\.\/|\.\/)?(?:docs\/)?superpowers\/[^)]*\)/g)].map(match => match[0]);

test('public docs do not link to the private notes', () => {
  for (const name of ['README.md', 'docs/ai-plan.md', 'docs/architecture.md', 'docs/ui-flows.md', 'docs/roadmap.md', 'docs/deploy.md']) {
    assert.deepEqual(privateLinks(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')), [], name);
  }
});

test('the karaoke picture passes where it was tapped and plays the recording from that time', () => {
  assert.match(app, /\['media-seek', 'media-karaoke-graph'\]\.includes\(target\.dataset\.action\)/);
  assert.match(app, /action === 'media-karaoke-graph'\) return playKaraokeAt\(karaokeGraphTime\(Number\(id\), songUi\.karaoke\?\.result\?\.seconds\)/);
});

test('an iPhone sees the home-screen steps from the start, and the survey gets the phone\'s tag (never the number itself)', () => {
  assert.match(app, /let installHelp = platform\(navigator\.userAgent, \{ maxTouchPoints: navigator\.maxTouchPoints \}\) === 'ios' \? installHelpFor\('ios'\) : null;/);
  assert.match(app, /deviceTag\(api\.deviceId\(\)\)\.then\(tag => \{ surveyTag = tag; \}\)/);
  assert.match(app, /usageSummary\(demo && liveState \? liveState : state, surveyTag\)/);
});
