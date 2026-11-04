import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceIntroView, voicePickView, voiceResultView, voiceManualView, voiceCard, searchResultsHtml, songPickView } from '../src/onboarding-views.js';
import { startOnboarding, addPick, applyLookup, setPickKey, emptySearch, markSlow, startPicker } from '../src/onboarding.js';
import { defaultState } from '../src/storage.js';

const consented = { ...defaultState(), settings: { ...defaultState().settings, aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 4 } };
const checked = (highestMidi, vocal = 'male') => ({ highestMidi, falsettoHighestMidi: null, lowestMidi: null, sourceUrl: 'https://example.org/s', sourceQuote: `최고음 ${highestMidi}`, vocal });
function withPick(voiceType, title, artist, result, keyOffset = 0) {
  let onb = { ...startOnboarding(defaultState()), voiceType };
  const added = addPick(onb, { title, artist });
  onb = applyLookup(added.onboarding, added.key, result);
  return setPickKey(onb, added.key, keyOffset);
}

test('the intro says the song screen sends title and artist to video search and lyric timing', () => {
  const html = voiceIntroView({ state: defaultState() });
  assert.ok(html.includes('가사 시간 정보 서비스'));
  assert.ok(html.includes('YouTube'));
  assert.ok(!html.includes('LRCLIB'));
});

test('the intro asks for consent only when it is not current', () => {
  const fresh = voiceIntroView({ state: defaultState() });
  assert.match(fresh, /자신 있게 부르는 곡이 있으세요\?/);
  assert.match(fresh, /data-action="voice-consent-accept"[^>]*>동의하고 곡 고르기/);
  assert.match(fresh, /data-action="voice-manual"[^>]*>최고음을 직접 입력할게요/);
  assert.match(fresh, /data-action="voice-later"[^>]*>나중에 할게요/);
  assert.match(voiceIntroView({ state: consented }), /data-action="voice-begin"[^>]*>곡 고르기/);
});

test('the pick screen enables results only with a voice type and a found song, and suggests octaves', () => {
  const noType = voicePickView({ state: consented, onboarding: withPick(null, '밤편지', '아이유', checked(71, 'female')) });
  assert.match(noType, /data-action="voice-result"[^>]*disabled/);
  const male = voicePickView({ state: consented, onboarding: withPick('male', '밤편지', '아이유', checked(71, 'female')) });
  assert.doesNotMatch(male, /data-action="voice-result"[^>]*disabled/);
  assert.match(male, /최고음 찾음 ✓ 2옥 시/);
  assert.match(male, /data-action="voice-octave"[^>]*checked[^>]*>\s*<span>한 옥타브 아래로 불렀어요/);
  assert.match(male, /data-action="voice-type" data-id="male" aria-pressed="true"/);
  const duet = voicePickView({ state: consented, onboarding: withPick('male', '썸', '소유', checked(72, 'mixed')) });
  assert.match(duet, /듀엣·혼성 곡이라 내 파트와 다를 수 있어요/);
  const missing = voicePickView({ state: consented, onboarding: withPick('male', '없는 곡', '', null) });
  assert.match(missing, /최고음을 못 찾았어요 · 계산에서 빠져요/);
});

test('the result screen plays the note and explains each song', () => {
  let onb = withPick('male', '밤편지', 'IU', checked(71));
  const added = addPick(onb, { title: '취중고백', artist: '김민석' });
  onb = setPickKey(applyLookup(added.onboarding, added.key, checked(72)), added.key, -2);
  const html = voiceResultView({ state: consented, onboarding: onb });
  assert.match(html, /이 정도까지 편하게 내시는 것 같아요/);
  assert.match(html, /data-action="voice-listen" data-id="71"/);
  assert.match(html, /취중고백 \(−2키\) 3옥 도 → 2옥 라♯/);
  assert.match(html, /id="voice-create-list" checked/);
  const female = voiceResultView({ state: consented, onboarding: withPick('male', '밤편지', '아이유', checked(71, 'female')) });
  assert.match(female, /밤편지 \(원키, 옥타브 아래로\) 2옥 시 → 1옥 시/);
});

test('manual entry stops at the range ends, and the home card offers to set or redo my range', () => {
  const top = voiceManualView({ state: consented, onboarding: { ...startOnboarding(defaultState()), voiceType: 'male', manualMidi: 88 } });
  assert.match(top, /data-action="voice-step" data-id="1" disabled/);
  assert.doesNotMatch(top, /data-action="voice-step" data-id="-1" disabled/);
  assert.match(voiceCard(defaultState()), /data-action="voice-start"[\s\S]*내 음역 알려주기/);
  const voice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: '2026-11-03T01:00:00.000Z', basis: [] };
  const card = voiceCard({ ...defaultState(), settings: { ...defaultState().settings, voice } });
  assert.match(card, /편하게 내는 최고음[\s\S]*2옥 시 \(B4\)[\s\S]*다시 고르기/);
});

test('the intro says search terms go to TJ', () => {
  assert.match(voiceIntroView({ state: defaultState() }), /TJ미디어/);
});

const withSearch = search => ({ ...startOnboarding(defaultState()), search: { ...emptySearch(), ...search } });
const song = (title, artist, tjNumber = '') => ({ title, artist, tjNumber });

test('the search panel names each state: searching, slow, nothing found, failed', () => {
  assert.match(searchResultsHtml(withSearch({ status: 'loading' })), /찾고 있어요…/);
  assert.match(searchResultsHtml(withSearch({ status: 'slow' })), /조금 오래 걸려요\. 잠시만 기다려 주세요\./);
  assert.match(searchResultsHtml(withSearch({ status: 'done', results: [] })), /찾는 곡이 없어요\. 철자를 확인하거나 아래에서 직접 적어 주세요\./);
  assert.match(searchResultsHtml(withSearch({ status: 'error' })), /곡 검색이 안 돼요\. 잠시 후 다시 찾거나 아래에서 직접 적어 주세요\./);
  assert.equal(searchResultsHtml(withSearch({ status: 'idle' })), '');
});

test('results show TJ numbers, the fallback and retry notes, the artist list, and escape titles', () => {
  const tj = searchResultsHtml(withSearch({ status: 'done', source: 'tj', retriedWith: '엠씨더맥스', artist: 'MC THE MAX', results: [song('어디에도', 'MC THE MAX', '46009'), song('<b>x</b>', 'y')] }));
  assert.match(tj, /‘엠씨더맥스’로 찾은 결과예요/);
  assert.match(tj, /data-action="search-artist"[^>]*>‘MC THE MAX’ 곡 전체 보기/);
  assert.match(tj, /어디에도<small> · MC THE MAX · TJ 46009<\/small>/);
  assert.match(tj, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(tj, /노래방 번호 없이/);
  assert.match(searchResultsHtml(withSearch({ status: 'done', source: 'musicbrainz', results: [song('a', 'b')] })), /노래방 번호 없이 찾은 결과예요/);
});

test('twenty rows show first, with more available while rows or pages remain', () => {
  const many = Array.from({ length: 25 }, (_, i) => song(`곡${i}`, '가수', String(100 + i)));
  const html = searchResultsHtml(withSearch({ status: 'done', results: many, shown: 20 }));
  assert.equal((html.match(/data-action="voice-add"/g) || []).length, 20);
  assert.match(html, /data-action="search-more"/);
  assert.doesNotMatch(searchResultsHtml(withSearch({ status: 'done', results: many, shown: 40, hasMore: false })), /search-more/);
  assert.match(searchResultsHtml(withSearch({ status: 'done', results: many, shown: 40, hasMore: true })), /search-more/);
});

test('the pick screen has a foreign-songs toggle, and a slow lookup says so', () => {
  let onb = { ...startOnboarding(defaultState()), voiceType: 'male' };
  const added = addPick(onb, { title: '어디에도', artist: 'MC THE MAX', tjNumber: '46009' });
  onb = markSlow(added.onboarding, added.key);
  const html = voicePickView({ state: consented, onboarding: onb });
  assert.match(html, /id="search-pop"/);
  assert.match(html, /외국 노래 포함/);
  assert.doesNotMatch(html, /팝송/);
  assert.match(html, /최고음 찾는 중… 조금 오래 걸려요/);
  assert.match(html, /TJ 46009/);
});

test('the add-by-search screen has no voice type, offers manual entry, and can save without waiting', () => {
  const picker = startPicker(defaultState(), null);
  const added = addPick(picker, { title: '어디에도', artist: 'MC THE MAX', tjNumber: '46009' });
  const html = songPickView({ state: consented, onboarding: added.onboarding });
  assert.doesNotMatch(html, /data-action="voice-type"/);
  assert.match(html, /id="voice-search"/);
  assert.match(html, /data-action="pick-manual"/);
  assert.match(html, /data-action="pick-save"[^>]*>1곡 담기/);
  assert.match(html, /내 노래방 키/);
  const waiting = songPickView({ state: consented, onboarding: { ...added.onboarding, waiting: true } });
  assert.match(waiting, /찾는 중인 곡을 기다리고 있어요…[\s\S]*data-action="pick-save-now"[^>]*>기다리지 않고 담기/);
});

test('final #3: the add-by-search screen takes a typed title as a pick instead of leaving the screen', () => {
  const html = songPickView({ state: consented, onboarding: startPicker(defaultState(), null) });
  assert.match(html, /id="voice-direct-form"/);
});
