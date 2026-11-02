import assert from 'node:assert/strict';
import test from 'node:test';
import { createSong, updateSong, searchSongs, validateSong, normalizeSong } from '../src/songs.js';

const now = new Date('2026-09-28T04:30:00.000Z');

test('createSong supplies defaults and stable timestamps', () => {
  const song = createSong({ title: '  봄날  ' }, now);
  assert.match(song.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.deepEqual(song, {
    id: song.id, title: '봄날', artist: '', originalKey: '',
    lowestMidi: null, highestMidi: null, keyOffset: 0,
    status: 'want', lyricsUrl: '', note: '', rangeSourceUrl: '', origin: 'user',
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  assert.equal(validateSong(song), song);
});

test('AI origin and an https range source are accepted with a range', () => {
  const song = createSong({ title: 'A', lowestMidi: 48, highestMidi: 72, rangeSourceUrl: 'https://example.org/r', origin: 'ai' }, now);
  assert.equal(song.origin, 'ai');
  assert.equal(song.rangeSourceUrl, 'https://example.org/r');
});

test('bad origin, non-https source, and a source without a range are rejected', () => {
  assert.throws(() => createSong({ title: 'A', origin: 'bot' }), /출처 구분/);
  assert.throws(() => createSong({ title: 'A', lowestMidi: 48, highestMidi: 72, rangeSourceUrl: 'http://x.org' }), /음역 출처/);
  assert.throws(() => createSong({ title: 'A', rangeSourceUrl: 'https://x.org' }), /음역 출처/);
});

test('normalizeSong upgrades songs saved before the new fields existed', () => {
  const { rangeSourceUrl, origin, ...old } = createSong({ title: 'A' }, now);
  const upgraded = normalizeSong(old);
  assert.equal(upgraded.rangeSourceUrl, '');
  assert.equal(upgraded.origin, 'user');
  assert.equal(validateSong(upgraded), upgraded);
  assert.throws(() => validateSong(old));
});

test('updateSong keeps origin unless the caller passes one', () => {
  const ai = createSong({ title: 'A', origin: 'ai' }, now);
  assert.equal(updateSong(ai, { note: 'x' }, now).origin, 'ai');
  assert.equal(updateSong(ai, { origin: 'user' }, now).origin, 'user');
});

test('createSong accepts complete song metadata and update preserves identity', () => {
  const first = createSong({
    title: '노래', artist: '가수', originalKey: 'C major', lowestMidi: 48,
    highestMidi: 72, keyOffset: -2, status: 'practicing',
    lyricsUrl: 'https://example.org/lyrics', note: '후렴 연습',
  }, now);
  const later = new Date('2026-09-29T01:00:00.000Z');
  const edited = updateSong(first, { title: '새 제목', status: 'comfortable', keyOffset: 2, id: 'ignored' }, later);
  assert.equal(edited.id, first.id);
  assert.equal(edited.createdAt, first.createdAt);
  assert.equal(edited.updatedAt, later.toISOString());
  assert.equal(edited.title, '새 제목');
  assert.equal(edited.status, 'comfortable');
  assert.equal(edited.artist, '가수');
  assert.equal(first.title, '노래');
});

test('invalid title, range, offset, status, and URL are rejected', () => {
  assert.throws(() => createSong({ title: ' ' }), /제목/);
  assert.throws(() => createSong({ title: '가'.repeat(121) }), /제목/);
  assert.throws(() => createSong({ title: 'A', lowestMidi: 60 }), /음역/);
  assert.throws(() => createSong({ title: 'A', lowestMidi: 75, highestMidi: 60 }), /음역/);
  assert.throws(() => createSong({ title: 'A', keyOffset: 13 }), /키/);
  assert.throws(() => createSong({ title: 'A', keyOffset: null }), /키/);
  assert.throws(() => createSong({ title: 'A', status: 'finished' }), /상태/);
  assert.throws(() => createSong({ title: 'A', lyricsUrl: 'http://example.com' }), /HTTPS/);
  assert.throws(() => createSong({ title: 'A', lyricsUrl: 'javascript:alert(1)' }), /HTTPS/);
  assert.throws(() => createSong({ title: 'A', note: '가'.repeat(1001) }), /메모/);
});

test('searchSongs matches title or artist across case and whitespace', () => {
  const songs = [
    createSong({ title: 'Love  Song', artist: 'The Singer', status: 'want' }, now),
    createSong({ title: '봄 날', artist: '아이유', status: 'comfortable' }, now),
  ];
  assert.deepEqual(searchSongs(songs, ' LOVESONG '), [songs[0]]);
  assert.deepEqual(searchSongs(songs, '  아이 유 '), [songs[1]]);
});
