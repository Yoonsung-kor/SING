import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIST_NAME, MAX_PICKS, shouldShowOnboarding, startOnboarding, addPick, applyLookup, setVoiceType, setPickKey,
  toggleOctave, removePick, onboardingResult, commitOnboarding, commitManual, dismissOnboarding,
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
  assert.deepEqual(onb.picks[0], { key: '밤편지|아이유', title: '밤편지', artist: '아이유', keyOffset: 0, octaveShift: 0, octaveTouched: false, status: 'looking', range: null, vocal: null });
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
