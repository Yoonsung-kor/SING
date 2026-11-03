import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKey, sameSong, parseNoteName, toCandidates, suggestKey, buildRecommendationRequest, validateRecommendationRequest } from '../src/recommend.js';
import { createPlaylist, addSong, setRecommendations } from '../src/playlists.js';
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
  assert.deepEqual(validateRecommendationRequest(req), { ...req, voice: null });
  assert.throws(() => buildRecommendationRequest({ ...state, playlists: [{ ...playlist, songIds: playlist.songIds.slice(0, 2) }] }, playlist.id), /3개/);
  assert.throws(() => validateRecommendationRequest({ ...req, songs: req.songs.slice(0, 2) }));
});

test('asking again excludes the cards already shown', () => {
  const songs = [1, 2, 3].map(n => createSong({ title: `곡${n}` }));
  const shown = { title: '아로하', artist: '조정석', reason: 'r', songUrl: 'https://x.org/a', range: null };
  const playlist = setRecommendations(songs.reduce((p, x) => addSong(p, x.id), createPlaylist([], '도전하기')), [shown]);
  const req = buildRecommendationRequest({ ...defaultState(), songs, playlists: [playlist] }, playlist.id);
  assert.ok(req.exclude.some(x => x.title === '아로하' && x.artist === '조정석'));
  assert.equal(validateRecommendationRequest(req).playlistName, '도전하기');
});

test('toCandidates keeps up to 8 https songs, drops excluded and repeated ones, and passes claims through', () => {
  const claim = { chestHighest: 'D5', falsettoHighest: null, lowest: null, sourceUrl: 'https://s.org/x', sourceQuote: '최고음 3옥 레(D5)' };
  const items = Array.from({ length: 11 }, (_, i) => ({ ...base, title: `곡${i}`, artist: `가수${i}`, highest: i === 0 ? claim : null, vocal: i === 1 ? 'female' : 'robot' }));
  items[2] = { ...items[2], title: '밤편지', artist: '아이유' };
  items[3] = { ...items[3], songUrl: 'http://example.org/x' };
  items[4] = { ...items[4], title: '곡0 (Live)', artist: '가수0' };
  const { intent, candidates } = toCandidates({ intent: 'challenge', items }, [{ title: '밤편지', artist: '아이유' }]);
  assert.equal(intent, 'challenge');
  assert.equal(candidates.length, 8);
  assert.ok(!candidates.some(c => ['밤편지', '곡3', '곡0 (Live)'].includes(c.title)));
  assert.deepEqual(candidates[0].claim, claim);
  assert.deepEqual([candidates[1].vocal, candidates[2].vocal, candidates[1].claim], ['female', null, null]);
  assert.equal(toCandidates({ intent: 'weird', items: [] }, []).intent, 'any');
  assert.deepEqual(toCandidates(null, []), { intent: 'any', candidates: [] });
});

test('the request carries my comfortable high as a note name, and validation turns it back into MIDI', () => {
  const songs = [1, 2, 3].map(n => createSong({ title: `곡${n}` }));
  const playlist = songs.reduce((p, x) => addSong(p, x.id), createPlaylist([], '도전하기'));
  const voice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: '2026-11-03T01:00:00.000Z', basis: [] };
  const state = { ...defaultState(), songs, playlists: [playlist], settings: { ...defaultState().settings, voice } };
  const req = buildRecommendationRequest(state, playlist.id);
  assert.deepEqual(req.voice, { comfortableHigh: 'B4', voiceType: 'male' });
  assert.deepEqual(validateRecommendationRequest(req).voice, { comfortableHighMidi: 71, voiceType: 'male' });
  assert.throws(() => validateRecommendationRequest({ ...req, voice: { comfortableHigh: 'B9', voiceType: 'male' } }));
  assert.throws(() => validateRecommendationRequest({ ...req, voice: { comfortableHigh: 'B4', voiceType: 'x' } }));
  const { voice: _, ...withoutVoice } = req;
  assert.equal(validateRecommendationRequest(withoutVoice).voice, null);
});

test('candidates keep one song per artist, comparing names loosely, and never merge empty artists', () => {
  const song = (title, artist) => ({ title, artist, reason: '어울려요.', songUrl: 'https://example.org/s', highest: null, vocal: null });
  const { candidates } = toCandidates({ intent: 'any', items: [song('좋은 날', 'IU'), song('밤편지', 'iu'), song('편지', '김종국'), song('좋겠다', '김종국'), song('제목1', ''), song('제목2', '')] }, []);
  assert.deepEqual(candidates.map(c => c.title), ['좋은 날', '편지', '제목1', '제목2']);
});
