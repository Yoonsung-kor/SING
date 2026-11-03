import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIST_NAME, MAX_PICKS, shouldShowOnboarding, startOnboarding, addPick, applyLookup, setVoiceType, setPickKey,
  toggleOctave, removePick, onboardingResult, commitOnboarding, commitManual, dismissOnboarding, startPicker, commitPicks,
} from '../src/onboarding.js';
import { defaultState, parseBackup } from '../src/storage.js';
import { createSong } from '../src/songs.js';
import { createPlaylist, addSong } from '../src/playlists.js';

const now = new Date('2026-11-03T01:00:00.000Z');
const checked = (highestMidi, vocal = 'male', extra = {}) => ({ highestMidi, falsettoHighestMidi: null, lowestMidi: null, sourceUrl: 'https://example.org/s', sourceQuote: `최고음 ${highestMidi}`, vocal, ...extra });
const roundTrip = state => parseBackup(JSON.stringify({ version: 1, state, recordings: [] })).state;
const pick = (onb, title, artist = '') => addPick(onb, { title, artist });

test('onboarding shows once for a real, ready profile without a range', () => {
  const state = defaultState();
  assert.equal(shouldShowOnboarding(state, { demo: false, initialized: true }), true);
  assert.equal(shouldShowOnboarding(state, { demo: true, initialized: true }), false);
  assert.equal(shouldShowOnboarding(state, { demo: false, initialized: false }), false);
  assert.equal(shouldShowOnboarding(dismissOnboarding(state, now), { demo: false, initialized: true }), false);
  assert.equal(shouldShowOnboarding(commitManual(state, { midi: 71, voiceType: 'male' }, now), { demo: false, initialized: true }), false);
});

test('the same song twice or a 21st song is not added', () => {
  let onb = startOnboarding(defaultState());
  const first = pick(onb, '밤편지', '아이유');
  assert.equal(first.key, '밤편지|아이유');
  assert.equal(pick(first.onboarding, '밤편지 ', '아이유').key, null);
  onb = first.onboarding;
  for (let i = 1; i < MAX_PICKS; i++) onb = pick(onb, `곡${i}`).onboarding;
  assert.equal(onb.picks.length, 20);
  assert.equal(pick(onb, '스물한 번째').key, null);
  assert.deepEqual(onb.picks[0], { key: '밤편지|아이유', title: '밤편지', artist: '아이유', keyOffset: 0, octaveShift: 0, octaveTouched: false, status: 'looking', range: null, vocal: null, tjNumber: '' });
});

test('lookups set the default octave by voice type and vocal; untouched picks follow a later voice type change', () => {
  let onb = { ...startOnboarding(defaultState()), voiceType: 'male' };
  onb = pick(onb, '밤편지', '아이유').onboarding;
  onb = pick(onb, '사건의 지평선', '윤하').onboarding;
  onb = applyLookup(onb, '밤편지|아이유', checked(71, 'female'));
  onb = applyLookup(onb, '사건의지평선|윤하', checked(74, 'female'));
  assert.deepEqual(onb.picks.map(p => [p.status, p.octaveShift]), [['found', -12], ['found', -12]]);
  onb = toggleOctave(onb, '사건의지평선|윤하');
  assert.equal(onb.picks[1].octaveShift, 0);
  onb = setVoiceType(onb, 'female');
  assert.deepEqual(onb.picks.map(p => p.octaveShift), [0, 0]);
  let male = { ...startOnboarding(defaultState()), voiceType: 'female' };
  male = applyLookup(pick(male, '거리에서', '성시경').onboarding, '거리에서|성시경', checked(70, 'male'));
  assert.equal(male.picks[0].octaveShift, 0);
  assert.equal(toggleOctave(male, '거리에서|성시경').picks[0].octaveShift, 12);
  assert.equal(applyLookup(onb, '없는|곡', checked(70)), onb);
  assert.deepEqual(applyLookup(onb, '밤편지|아이유', null).picks[0].status, 'missing');
  assert.deepEqual(applyLookup(onb, '밤편지|아이유', 'error').picks[0].status, 'error');
});

test('the result uses found picks only and keeps every pick in the basis', () => {
  let onb = { ...startOnboarding(defaultState()), voiceType: 'male' };
  for (const [t, a] of [['밤편지', 'IU'], ['취중고백', '김민석'], ['소주한잔', '임창정']]) onb = pick(onb, t, a).onboarding;
  onb = applyLookup(onb, '밤편지|iu', checked(71, 'male'));
  onb = setPickKey(applyLookup(onb, '취중고백|김민석', checked(72, 'male')), '취중고백|김민석', -2);
  onb = applyLookup(onb, '소주한잔|임창정', null);
  const { midi, basis } = onboardingResult(onb);
  assert.equal(midi, 71);
  assert.deepEqual(basis.map(b => [b.title, b.highestMidi, b.keyOffset]), [['밤편지', 71, 0], ['취중고백', 72, -2], ['소주한잔', null, 0]]);
  assert.equal(removePick(onb, '밤편지|iu').picks.length, 2);
});

test('commit saves the voice, reuses an existing song without overriding a hand-set key, and adds to the existing list', () => {
  const existing = createSong({ title: '취중고백', artist: '김민석', keyOffset: -1 }, now);
  const list = addSong(createPlaylist([], '자신 있는 곡', now), existing.id, now);
  const state = { ...defaultState(), songs: [existing], playlists: [list] };
  let onb = { ...startOnboarding(state), voiceType: 'male' };
  onb = pick(onb, '취중고백', '김민석').onboarding;
  onb = pick(onb, '밤편지', 'IU').onboarding;
  onb = setPickKey(applyLookup(onb, '취중고백|김민석', checked(72)), '취중고백|김민석', -2);
  onb = applyLookup(onb, '밤편지|iu', checked(71));
  const next = commitOnboarding(state, onb, now);
  assert.equal(next.settings.voice.comfortableHighMidi, 71);
  assert.equal(next.settings.voice.method, 'songs');
  assert.equal(next.songs.length, 2);
  const reused = next.songs.find(s => s.id === existing.id);
  assert.deepEqual([reused.keyOffset, reused.highestMidi, reused.rangeQuote], [-1, 72, '최고음 72']);
  assert.equal(next.playlists.length, 1);
  assert.equal(next.playlists[0].name, LIST_NAME);
  assert.equal(next.playlists[0].songIds.length, 2);
  assert.deepEqual(roundTrip(next).settings.voice, next.settings.voice);
});

test('commit without the list checkbox leaves songs and playlists untouched; a new list is created when missing', () => {
  const state = defaultState();
  let onb = { ...startOnboarding(state), voiceType: 'female' };
  onb = applyLookup(pick(onb, '사건의 지평선', '윤하').onboarding, '사건의지평선|윤하', checked(74, 'female'));
  const noList = commitOnboarding(state, { ...onb, createList: false }, now);
  assert.equal(noList.songs, state.songs);
  assert.equal(noList.playlists, state.playlists);
  assert.equal(noList.settings.voice.comfortableHighMidi, 74);
  const withList = commitOnboarding(state, onb, now);
  assert.deepEqual(withList.playlists.map(p => p.name), [LIST_NAME]);
  assert.equal(withList.songs[0].vocal, 'female');
  roundTrip(withList);
});

test('manual commit keeps the old basis, and dismissal is stored', () => {
  const manual = commitManual(defaultState(), { midi: 76, voiceType: 'female' }, now);
  assert.deepEqual([manual.settings.voice.comfortableHighMidi, manual.settings.voice.method, manual.settings.voice.basis], [76, 'manual', []]);
  roundTrip(manual);
  const dismissed = dismissOnboarding(defaultState(), now);
  assert.equal(dismissed.settings.voiceOnboardingDismissedAt, now.toISOString());
  roundTrip(dismissed);
  const restarted = startOnboarding(commitOnboarding(defaultState(), applyLookup({ ...startOnboarding(defaultState()), voiceType: 'male', ...pick(startOnboarding(defaultState()), '밤편지', 'IU').onboarding, voiceType: 'male' }, '밤편지|iu', checked(71)), now));
  assert.deepEqual(restarted.picks.map(p => [p.title, p.status, p.range?.highestMidi]), [['밤편지', 'found', 71]]);
  assert.equal(restarted.voiceType, 'male');
});

test('final #5: changing the voice type resets octave moves the new type cannot show, even on restored picks', () => {
  const voice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: now.toISOString(), basis: [{ title: '밤편지', artist: '아이유', highestMidi: 71, keyOffset: 0, octaveShift: -12, vocal: 'female' }] };
  const restored = startOnboarding({ ...defaultState(), settings: { ...defaultState().settings, voice } });
  assert.equal(restored.picks[0].octaveShift, -12);
  assert.equal(setVoiceType(restored, 'male').picks[0].octaveShift, -12);
  assert.equal(setVoiceType(restored, 'female').picks[0].octaveShift, 0);
  let female = { ...startOnboarding(defaultState()), voiceType: 'female' };
  female = applyLookup(pick(female, '거리에서', '성시경').onboarding, '거리에서|성시경', checked(70, 'male'));
  female = toggleOctave(female, '거리에서|성시경');
  assert.equal(female.picks[0].octaveShift, 12);
  assert.equal(setVoiceType(female, 'male').picks[0].octaveShift, 0);
  assert.equal(onboardingResult(setVoiceType(female, 'male')).midi, 70);
});

test('final #6: fixing the result by hand keeps the picked songs, the basis and the list', () => {
  let onb = { ...startOnboarding(defaultState()), voiceType: 'male' };
  onb = applyLookup(pick(onb, '밤편지', 'IU').onboarding, '밤편지|iu', checked(71));
  const next = commitOnboarding(defaultState(), { ...onb, manualMidi: 72 }, now, { manualMidi: 72 });
  assert.deepEqual([next.settings.voice.comfortableHighMidi, next.settings.voice.method, next.settings.voice.basis.length], [72, 'manual', 1]);
  assert.deepEqual(next.playlists.map(p => p.name), [LIST_NAME]);
  const nothingFound = applyLookup(pick({ ...startOnboarding(defaultState()), voiceType: 'female' }, '없는 곡').onboarding, '없는곡|', null);
  assert.equal(commitOnboarding(defaultState(), nothingFound, now, { manualMidi: 76 }).settings.voice.comfortableHighMidi, 76);
});

test('picks keep the TJ number they were found with', () => {
  const { onboarding } = pick(startOnboarding(defaultState()), '어디에도', 'MC THE MAX');
  assert.equal(onboarding.picks[0].tjNumber, '');
  const withNumber = addPick(startOnboarding(defaultState()), { title: '어디에도', artist: 'MC THE MAX', tjNumber: '46009' });
  assert.equal(withNumber.onboarding.picks[0].tjNumber, '46009');
});

const pickFound = (picker, title, artist, tjNumber, result) => {
  const added = addPick(picker, { title, artist, tjNumber });
  return applyLookup(added.onboarding, added.key, result);
};

test('adding by search saves new songs with TJ numbers and checked tops into the list, and links songs already saved', () => {
  const existing = createSong({ title: '어디에도', artist: 'MC THE MAX' }, now);
  const list = createPlaylist([], '도전하기', now);
  const voice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: now.toISOString(), basis: [] };
  const state = { ...defaultState(), songs: [existing], playlists: [list], settings: { ...defaultState().settings, voice } };
  let picker = startPicker(state, list.id);
  assert.deepEqual([picker.kind, picker.playlistId, picker.picks.length], ['songs', list.id, 0]);
  picker = pickFound(picker, '어디에도', 'MC THE MAX', '46009', checked(74, 'male'));
  picker = pickFound(picker, '사건의 지평선', '윤하', '49095', checked(74, 'female'));
  picker = pickFound(picker, '없는 노래', '', '', null);
  const next = commitPicks(state, picker, now);
  assert.equal(next.songs.length, 3);
  const linked = next.songs.find(s => s.id === existing.id);
  assert.deepEqual([linked.tjNumber, linked.highestMidi, linked.rangeQuote], ['46009', 74, '최고음 74']);
  const female = next.songs.find(s => s.title === '사건의 지평선');
  assert.deepEqual([female.tjNumber, female.octaveShift, female.origin], ['49095', -12, 'user']);
  assert.equal(next.songs.find(s => s.title === '없는 노래').highestMidi, null);
  assert.equal(next.playlists[0].songIds.length, 3);
  roundTrip(next);
});

test('adding by search without a list saves songs only; a missing list or a full library changes nothing', () => {
  const state = defaultState();
  const loose = commitPicks(state, pickFound(startPicker(state, null), '밤편지', 'IU', '', checked(71)), now);
  assert.deepEqual([loose.songs.length, loose.playlists], [1, state.playlists]);
  const gone = pickFound(startPicker(state, crypto.randomUUID()), '밤편지', 'IU', '', checked(71));
  assert.throws(() => commitPicks(state, gone, now), /플레이리스트를 찾지 못했어요/);
  const full = { ...state, songs: Array.from({ length: 500 }, (_, i) => createSong({ title: `곡${i}` }, now)) };
  const tooMany = pickFound(startPicker(full, null), '새 곡', '', '', null);
  assert.throws(() => commitPicks(full, tooMany, now), /500곡/);
  assert.throws(() => commitPicks(state, startPicker(state, null), now), /골라 주세요/);
});

test('final #4: adding a song that is already saved keeps the octave the user set', () => {
  const kept = createSong({ title: '사건의 지평선', artist: '윤하', highestMidi: 74, vocal: 'female', octaveShift: 0 }, now);
  const voice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: now.toISOString(), basis: [] };
  const state = { ...defaultState(), songs: [kept], settings: { ...defaultState().settings, voice } };
  const picker = pickFound(startPicker(state, null), '사건의 지평선', '윤하', '49095', checked(74, 'female'));
  assert.equal(commitPicks(state, picker, now).songs[0].octaveShift, 0);
});
