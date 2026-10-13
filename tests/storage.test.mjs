import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, openStore, parseBackup } from '../src/storage.js';
import { createSong } from '../src/songs.js';

const attempt = {
  id: 'a1', targetMidi: null, midi: 60, reliable: true, cents: null,
  comfort: 'comfortable', createdAt: '2026-09-27T10:00:00.000Z', recordingId: null,
};
const session = {
  id: 's1', startedAt: '2026-09-27T09:59:00.000Z', day: '2026-09-27',
  status: 'finished', attempts: [attempt], targetMidi: 60,
  phase: 'result', retryCount: 0, stopReason: null,
};
const activity = {
  id: 'x1', type: 'practice', day: '2026-09-27',
  createdAt: '2026-09-27T10:01:00.000Z', sessionId: 's1',
};
const state = { ...defaultState(), sessions: [session], activities: [activity] };
const backup = { version: 1, state, recordings: [] };

test('default state is fresh and has stable versioned shape', () => {
  const a = defaultState();
  const b = defaultState();
  assert.deepEqual(a, { version: 1, sessions: [], draft: null, activities: [], songs: [], settings: { keepAudio: false } });
  a.sessions.push(session);
  assert.equal(b.sessions.length, 0);
});

test('legacy version 1 backup gains empty songs without changing existing records', () => {
  const legacy = structuredClone(backup);
  delete legacy.state.songs;
  const parsed = parseBackup(JSON.stringify(legacy));
  assert.deepEqual(parsed.state.sessions, backup.state.sessions);
  assert.deepEqual(parsed.state.activities, backup.state.activities);
  assert.deepEqual(parsed.state.songs, []);
});

test('songbook is backed up and malformed or oversized songbooks are rejected', () => {
  const withSong = structuredClone(backup);
  withSong.state.songs = [createSong({ title: '봄날', lowestMidi: 58, highestMidi: 72 })];
  assert.deepEqual(parseBackup(JSON.stringify(withSong)).state.songs, withSong.state.songs);
  const malformed = structuredClone(withSong);
  malformed.state.songs[0].lyricsUrl = 'http://example.com';
  assert.throws(() => parseBackup(JSON.stringify(malformed)), /HTTPS/);
  const tooMany = structuredClone(withSong);
  tooMany.state.songs = Array.from({ length: 501 }, (_, i) => ({ ...withSong.state.songs[0], id: String(i) }));
  assert.throws(() => parseBackup(JSON.stringify(tooMany)), /songs/i);
});

test('valid backup retains session, activity, and date fields', () => {
  const parsed = parseBackup(JSON.stringify(backup));
  assert.deepEqual(parsed, backup);
});

test('malformed nested attempt is rejected', () => {
  const bad = structuredClone(backup);
  bad.state.sessions[0].attempts[0].comfort = 'higher';
  assert.throws(() => parseBackup(JSON.stringify(bad)), /comfort/i);
});

test('duplicate IDs and wrong nested types are rejected', () => {
  const duplicate = structuredClone(backup);
  duplicate.state.sessions.push(structuredClone(session));
  assert.throws(() => parseBackup(JSON.stringify(duplicate)), /duplicate id/i);
  const wrongType = structuredClone(backup);
  wrongType.state.sessions[0].attempts[0].reliable = 'true';
  assert.throws(() => parseBackup(JSON.stringify(wrongType)), /reliable/i);
  const wrongRecording = structuredClone(backup);
  wrongRecording.recordings = [
    { id: 'r1', mime: 'audio/webm', data: 'AA==' },
    { id: 'r1', mime: 'audio/webm', data: 'AA==' },
  ];
  assert.throws(() => parseBackup(JSON.stringify(wrongRecording)), /duplicate id/i);
});

test('practice data is validated through its measurement', () => {
  const withPractice = structuredClone(backup);
  withPractice.state.sessions[0].practice = {
    midi: 60,
    measurement: { reliable: true, midi: 60, cents: -8, reason: 'stable' },
    comfort: 'comfortable', recordingId: null,
    completedAt: '2026-09-27T10:10:00.000Z',
  };
  assert.deepEqual(parseBackup(JSON.stringify(withPractice)), withPractice);
  withPractice.state.sessions[0].practice.measurement.cents = '8';
  assert.throws(() => parseBackup(JSON.stringify(withPractice)), /practice\.measurement\.cents/i);
  withPractice.state.sessions[0].practice.measurement.cents = 8;
  withPractice.state.sessions[0].practice.comfort = 'unknown';
  assert.throws(() => parseBackup(JSON.stringify(withPractice)), /practice\.comfort/i);
});

test('session status and phase must be known states', () => {
  const badStatus = structuredClone(backup);
  badStatus.state.sessions[0].status = 'complete';
  assert.throws(() => parseBackup(JSON.stringify(badStatus)), /status/i);
  const badPhase = structuredClone(backup);
  badPhase.state.sessions[0].phase = 'diagnosis';
  assert.throws(() => parseBackup(JSON.stringify(badPhase)), /phase/i);
});

test('oversized arrays and invalid activity dates are rejected', () => {
  const bad = structuredClone(backup);
  bad.state.activities = Array.from({ length: 501 }, (_, i) => ({ ...activity, id: String(i) }));
  assert.throws(() => parseBackup(JSON.stringify(bad)), /activities/i);
  const badDate = structuredClone(backup);
  badDate.state.activities[0].day = '2026-02-30';
  assert.throws(() => parseBackup(JSON.stringify(badDate)), /day/i);
});

test('recording base64, MIME, and decoded size are validated', () => {
  const bad = structuredClone(backup);
  bad.recordings = [{ id: 'r1', mime: 'audio/webm', data: '!not-base64!' }];
  assert.throws(() => parseBackup(JSON.stringify(bad)), /base64/i);
  bad.recordings[0].data = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => parseBackup(JSON.stringify(bad)), /recording size/i);
});

test('unsupported version and text above 25 MB are rejected', () => {
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, version: 2 })), /version/i);
  assert.throws(() => parseBackup(' '.repeat(25 * 1024 * 1024 + 1)), /backup size/i);
});

test('openStore reports unavailable IndexedDB', async () => {
  if (globalThis.indexedDB) return;
  await assert.rejects(openStore(), /IndexedDB.*unavailable/i);
});
