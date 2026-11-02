import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKey, sameSong, parseNoteName, toRecItems, toRange, suggestKey, buildRecommendationRequest, validateRecommendationRequest } from '../src/recommend.js';
import { createPlaylist, addSong } from '../src/playlists.js';
import { createSong } from '../src/songs.js';
import { defaultState } from '../src/storage.js';

test('sameSong ignores brackets, spacing and empty artists', () => {
  assert.equal(normalizeKey('봄날 (Spring Day)'), normalizeKey(' 봄 날 '));
  assert.equal(sameSong({ title: 'Hype Boy', artist: 'NewJeans' }, { title: 'hype boy [Live]', artist: 'newjeans' }), true);
  assert.equal(sameSong({ title: '봄날', artist: '방탄소년단' }, { title: '봄날', artist: '임창정' }), false);
  assert.equal(sameSong({ title: '봄날', artist: '' }, { title: '봄날', artist: '임창정' }), true);
});

test('parseNoteName reads scientific pitch only', () => {
  assert.deepEqual(['C4', 'A4', 'F#3', 'Bb2', 'E♭5'].map(parseNoteName), [60, 69, 54, 46, 75]);
  assert.deepEqual(['2옥타브 라', 'H4', '', 'A'].map(parseNoteName), [null, null, null, null]);
});

const raw = item => ({ items: [item] });
const base = { title: '아로하', artist: '조정석', reason: '잔잔한 곡이 많아서 골랐어요.', songUrl: 'https://example.org/aroha', range: null };

test('implausible or non-scientific ranges are dropped, valid ones become midi', () => {
  const r = range => toRecItems(raw({ ...base, range }), [])[0].range;
  assert.equal(r({ lowest: 'C3', highest: '2옥타브 라', sourceUrl: 'https://s.org', sourceNotation: '2옥타브 라' }), null);
  assert.equal(r({ lowest: 'A2', highest: 'A2', sourceUrl: 'https://s.org', sourceNotation: '' }), null);
  assert.equal(r({ lowest: 'C3', highest: 'G4', sourceUrl: 'http://s.org', sourceNotation: '' }), null);
  assert.deepEqual(r({ lowest: 'C3', highest: 'G4', sourceUrl: 'https://s.org', sourceNotation: '2옥타브 솔' }),
    { lowestMidi: 48, highestMidi: 67, sourceUrl: 'https://s.org', sourceNotation: '2옥타브 솔' });
});

test('toRecItems drops excluded, duplicate, and non-https songs, truncates reasons, and caps at 3', () => {
  const items = ['아로하', '밤편지', '응급실', '응급실 (Live)', '첫눈', '오래된 노래'].map(title => ({ ...base, title, artist: title === '밤편지' ? '아이유' : base.artist }));
  items[2].reason = '가'.repeat(100);
  items[4].songUrl = 'javascript:alert(1)';
  const result = toRecItems({ items }, [{ title: '밤편지', artist: '아이유' }]);
  assert.deepEqual(result.map(i => i.title), ['아로하', '응급실', '오래된 노래']);
  assert.equal(result[1].reason.length, 80);
  assert.deepEqual(toRecItems({ items: 'nope' }, []), []);
});

test('suggestKey uses the median of shifted top notes and clamps', () => {
  const songs = [{ highestMidi: 67, keyOffset: -2 }, { highestMidi: 72, keyOffset: -3 }, { highestMidi: null, keyOffset: 0 }];
  assert.equal(suggestKey(songs, 70), -3);
  assert.equal(suggestKey(songs, 50), 12);
  assert.equal(suggestKey(songs, null), null);
  assert.equal(suggestKey([{ highestMidi: null, keyOffset: 0 }], 70), null);
});

test('the request carries list songs and exclusions but never practice records', () => {
  const songs = [1, 2, 3].map(n => createSong({ title: `곡${n}`, keyOffset: -1 }));
  const playlist = songs.reduce((p, x) => addSong(p, x.id), createPlaylist([], '도전하기'));
  const state = { ...defaultState(), songs, playlists: [playlist], sessions: [{ id: 'secret-session' }] };
  const req = buildRecommendationRequest(state, playlist.id);
  assert.equal(req.playlistName, '도전하기');
  assert.equal(req.songs.length, 3);
  assert.equal(req.exclude.length, 3);
  assert.ok(!JSON.stringify(req).includes('secret-session'));
  assert.equal(validateRecommendationRequest(req), req);
  assert.throws(() => buildRecommendationRequest({ ...state, playlists: [{ ...playlist, songIds: playlist.songIds.slice(0, 2) }] }, playlist.id), /3개/);
  assert.throws(() => validateRecommendationRequest({ ...req, songs: req.songs.slice(0, 2) }));
});

test('toRange keeps only scientific, plausible, https-sourced ranges', () => {
  assert.equal(toRange({ lowest: 'C3', highest: '2옥타브 라', sourceUrl: 'https://s.org', sourceNotation: '' }), null);
  assert.equal(toRange({ lowest: 'A2', highest: 'A2', sourceUrl: 'https://s.org', sourceNotation: '' }), null);
  assert.equal(toRange({ lowest: 'C3', highest: 'G4', sourceUrl: 'http://s.org', sourceNotation: '' }), null);
  assert.deepEqual(toRange({ lowest: 'C3', highest: 'G4', sourceUrl: 'https://s.org', sourceNotation: '2옥타브 솔' }), { lowestMidi: 48, highestMidi: 67, sourceUrl: 'https://s.org', sourceNotation: '2옥타브 솔' });
  assert.equal(toRange(null), null);
});
