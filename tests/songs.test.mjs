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
    falsettoHighestMidi: null, rangeQuote: '', vocal: null, octaveShift: 0, tjNumber: '',
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

test('normalizeSong leaves a complete song byte-identical so backups round-trip', () => {
  const song = createSong({ title: 'A', origin: 'ai' }, now);
  assert.equal(JSON.stringify(normalizeSong(song)), JSON.stringify(song));
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

test('songs saved before chest/falsetto fields gain their defaults and validate', () => {
  const { falsettoHighestMidi, rangeQuote, vocal, octaveShift, ...old } = createSong({ title: 'A', lowestMidi: 48, highestMidi: 72 }, now);
  const upgraded = normalizeSong(old);
  assert.deepEqual([upgraded.falsettoHighestMidi, upgraded.rangeQuote, upgraded.vocal, upgraded.octaveShift], [null, '', null, 0]);
  assert.equal(validateSong(upgraded), upgraded);
});

test('a highest note alone is enough, and a checked quote needs its source', () => {
  const song = createSong({ title: 'A', highestMidi: 74, falsettoHighestMidi: 78, rangeSourceUrl: 'https://example.org/r', rangeQuote: '진성 3옥 레, 가성 3옥 파#', vocal: 'female', octaveShift: -12 }, now);
  assert.deepEqual([song.lowestMidi, song.highestMidi, song.falsettoHighestMidi, song.vocal, song.octaveShift], [null, 74, 78, 'female', -12]);
  assert.throws(() => createSong({ title: 'A', highestMidi: 74, falsettoHighestMidi: 74 }), /가성/);
  assert.throws(() => createSong({ title: 'A', falsettoHighestMidi: 78 }), /가성/);
  assert.throws(() => createSong({ title: 'A', highestMidi: 74, rangeQuote: '진성 3옥 레' }), /음역 출처/);
  assert.throws(() => createSong({ title: 'A', highestMidi: 74, octaveShift: 5 }), /옥타브/);
  assert.throws(() => createSong({ title: 'A', highestMidi: 74, vocal: 'robot' }), /보컬/);
  assert.throws(() => createSong({ title: 'A', highestMidi: 74, rangeSourceUrl: 'https://example.org/r', rangeQuote: 'x'.repeat(121) }), /음역 출처/);
});

test('normalizeSong leaves a complete v2 song byte-identical', () => {
  const song = createSong({ title: 'A', highestMidi: 74, rangeSourceUrl: 'https://example.org/r', rangeQuote: '3옥 레(D5)', vocal: 'male' }, now);
  assert.equal(JSON.stringify(normalizeSong(song)), JSON.stringify(song));
});

test('a TJ number is up to six digits and old songs gain an empty one', () => {
  assert.equal(createSong({ title: '어디에도', tjNumber: ' 46009 ' }, now).tjNumber, '46009');
  assert.throws(() => createSong({ title: 'A', tjNumber: '4600a' }), /TJ 번호/);
  assert.throws(() => createSong({ title: 'A', tjNumber: '1234567' }), /TJ 번호/);
  const { tjNumber, ...old } = createSong({ title: 'A' }, now);
  assert.equal(normalizeSong(old).tjNumber, '');
  const full = createSong({ title: 'A', tjNumber: '46009', highestMidi: 74 }, now);
  assert.equal(JSON.stringify(normalizeSong(full)), JSON.stringify(full));
});

test('renaming a song drops videos found for the old name; other edits keep media as it is', () => {
  const media = { mv: { videoId: 'AAAAAAAAAAA', source: 'auto', foundAt: '2026-11-01T00:00:00.000Z', candidates: [{ videoId: 'AAAAAAAAAAA' }] }, karaoke: null, sections: null, starts: {}, pins: [] };
  const song = { ...createSong({ title: '너의 모든 순간', artist: '성시경' }, now), media };
  assert.equal(updateSong(song, { title: '너의모든순간' }, now).media.mv, null);
  assert.equal(updateSong(song, { artist: '아이유' }, now).media.mv, null);
  assert.deepEqual(updateSong(song, { note: '후렴 숨' }, now).media, media);
  assert.equal(updateSong(createSong({ title: 'a' }, now), { title: 'b' }, now).media, undefined);
  assert.doesNotThrow(() => validateSong(createSong({ title: '예전 곡' }, now)));
  assert.throws(() => validateSong({ ...song, media: { ...media, pins: [{ id: 'p', videoId: 'x', t: 1, text: 'x' }] } }), /곡 영상 정보/);
});
