import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlaylist, addSong, applyMembership, removeSongEverywhere, migrateLegacyStatuses,
  setRecommendations, takeRecommendation, rejectRecommendation, validatePlaylist, renamePlaylist, isValidRecItem,
} from '../src/playlists.js';

const now = new Date('2026-11-03T01:00:00.000Z');
const s = n => ({ id: crypto.randomUUID(), title: `곡${n}`, status: 'want' });

test('createPlaylist trims, limits length, and refuses duplicates by normalized name', () => {
  const p = createPlaylist([], '  도전하기 ', now);
  assert.equal(p.name, '도전하기');
  assert.deepEqual([p.songIds, p.rejected, p.recommendations], [[], [], null]);
  assert.throws(() => createPlaylist([], ' ', now), /이름/);
  assert.throws(() => createPlaylist([], '가'.repeat(31), now), /30자/);
  assert.throws(() => createPlaylist([p], '도전 하기', now), /같은 이름/);
  assert.throws(() => createPlaylist(Array.from({ length: 50 }, (_, i) => createPlaylist([], `L${i}`, now)), '새 리스트', now), /50개/);
});

test('renamePlaylist allows keeping its own name but not taking another list name', () => {
  const a = createPlaylist([], 'A', now), b = createPlaylist([a], 'B', now);
  const later = new Date('2026-11-04T01:00:00.000Z');
  const renamed = renamePlaylist([a, b], a.id, ' a ', later);
  assert.equal(renamed[0].name, 'a');
  assert.equal(renamed[0].updatedAt, later.toISOString());
  assert.equal(renamed[1], b);
  assert.throws(() => renamePlaylist([a, b], a.id, 'b', later), /같은 이름/);
});

test('membership adds once, removes from unselected lists, and cleans up on delete', () => {
  const a = createPlaylist([], 'A', now), b = createPlaylist([], 'B', now), song = s(1);
  let lists = applyMembership([a, b], song.id, [a.id], now);
  lists = applyMembership(lists, song.id, [a.id], now);
  assert.deepEqual(lists.map(l => l.songIds), [[song.id], []]);
  lists = applyMembership(lists, song.id, [b.id], now);
  assert.deepEqual(lists.map(l => l.songIds), [[], [song.id]]);
  assert.deepEqual(removeSongEverywhere(lists, song.id, now).map(l => l.songIds), [[], []]);
});

test('legacy statuses become playlists only for statuses that have songs', () => {
  const songs = [{ ...s(1), status: 'comfortable' }, { ...s(2), status: 'want' }, { ...s(3), status: 'want' }];
  const lists = migrateLegacyStatuses(songs, now);
  assert.deepEqual(lists.map(l => l.name), ['불러볼 곡', '익숙한 곡']);
  assert.deepEqual(lists[0].songIds, [songs[1].id, songs[2].id]);
});

test('taking or rejecting a recommendation removes it, and rejection is remembered and capped', () => {
  const item = { title: '아로하', artist: '조정석', reason: '잔잔해요', songUrl: 'https://example.org/a', range: null };
  let p = setRecommendations(createPlaylist([], 'A', now), [item, { ...item, title: '응급실' }], now);
  const taken = takeRecommendation(p, 0, now);
  assert.equal(taken.item.title, '아로하');
  assert.equal(taken.playlist.recommendations.items.length, 1);
  p = rejectRecommendation(taken.playlist, 0, now);
  assert.deepEqual(p.rejected, [{ title: '응급실', artist: '조정석' }]);
  const full = { ...p, rejected: Array.from({ length: 200 }, (_, i) => ({ title: `t${i}`, artist: '' })) };
  const capped = rejectRecommendation(setRecommendations(full, [item], now), 0, now);
  assert.equal(capped.rejected.length, 200);
  assert.equal(capped.rejected.at(-1).title, '아로하');
});

test('validatePlaylist rejects unknown song ids, duplicates, and malformed items', () => {
  const song = s(1);
  const p = addSong(createPlaylist([], 'A', now), song.id, now);
  assert.equal(validatePlaylist(p, new Set([song.id])), p);
  assert.throws(() => validatePlaylist(p, new Set()), /곡/);
  assert.throws(() => validatePlaylist({ ...p, songIds: [song.id, song.id] }, new Set([song.id])), /곡/);
  assert.throws(() => validatePlaylist(setRecommendations(p, [{ title: 'x', artist: '', reason: 'r', songUrl: 'javascript:1', range: null }], now), new Set([song.id])), /추천/);
});

const recBase = { title: '곡', artist: '가수', reason: '이유예요.', songUrl: 'https://example.org/song' };

test('recommendation items accept legacy ranges, checked v2 ranges and no range', () => {
  assert.equal(isValidRecItem({ ...recBase, range: null }), true);
  assert.equal(isValidRecItem({ ...recBase, range: { lowestMidi: 50, highestMidi: 70, sourceUrl: 'https://example.org/r', sourceNotation: '2옥 라#' } }), true);
  const v2 = { highestMidi: 74, falsettoHighestMidi: 78, lowestMidi: null, sourceUrl: 'https://example.org/r', sourceQuote: '진성 3옥 레(D5), 가성 3옥 파#(F#5)' };
  assert.equal(isValidRecItem({ ...recBase, range: v2, vocal: 'female' }), true);
  assert.equal(isValidRecItem({ ...recBase, range: { ...v2, sourceQuote: 'x'.repeat(121) } }), false);
  assert.equal(isValidRecItem({ ...recBase, range: { ...v2, sourceUrl: 'http://example.org/r' } }), false);
  assert.equal(isValidRecItem({ ...recBase, range: null, vocal: 'robot' }), false);
});

test('recommendations keep intent and fallback, and a bad intent is rejected', () => {
  const p = setRecommendations(createPlaylist([], '도전하기', now), [{ ...recBase, range: null }], now, { intent: 'challenge', fallback: true });
  assert.deepEqual([p.recommendations.intent, p.recommendations.fallback], ['challenge', true]);
  assert.equal(validatePlaylist(p, new Set()), p);
  assert.throws(() => validatePlaylist({ ...p, recommendations: { ...p.recommendations, intent: 'weird' } }, new Set()), /추천/);
  assert.throws(() => validatePlaylist({ ...p, recommendations: { ...p.recommendations, fallback: 'yes' } }, new Set()), /추천/);
});
