import assert from 'node:assert/strict';
import test from 'node:test';
import { createSong, updateSong, searchSongs, validateSong } from '../src/songs.js';

const now = new Date('2026-09-28T04:30:00.000Z');

test('createSong supplies defaults and stable timestamps', () => {
  const song = createSong({ title: '  봄날  ' }, now);
  assert.match(song.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.deepEqual(song, {
    id: song.id, title: '봄날', artist: '', originalKey: '',
    lowestMidi: null, highestMidi: null, keyOffset: 0,
    status: 'want', lyricsUrl: '', note: '',
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  assert.equal(validateSong(song), song);
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

test('searchSongs matches title or artist across case and whitespace, with status filter', () => {
  const songs = [
    createSong({ title: 'Love  Song', artist: 'The Singer', status: 'want' }, now),
    createSong({ title: '봄 날', artist: '아이유', status: 'comfortable' }, now),
  ];
  assert.deepEqual(searchSongs(songs, ' LOVESONG '), [songs[0]]);
  assert.deepEqual(searchSongs(songs, '  아이 유 '), [songs[1]]);
  assert.deepEqual(searchSongs(songs, 'song', 'comfortable'), []);
  assert.deepEqual(searchSongs(songs, '', 'want'), [songs[0]]);
});
