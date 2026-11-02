import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceIntroView, voicePickView, voiceResultView, voiceManualView, voiceCard } from '../src/onboarding-views.js';
import { startOnboarding, addPick, applyLookup, setPickKey } from '../src/onboarding.js';
import { defaultState } from '../src/storage.js';

const consented = { ...defaultState(), settings: { ...defaultState().settings, aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 2 } };
const checked = (highestMidi, vocal = 'male') => ({ highestMidi, falsettoHighestMidi: null, lowestMidi: null, sourceUrl: 'https://example.org/s', sourceQuote: `최고음 ${highestMidi}`, vocal });
function withPick(voiceType, title, artist, result, keyOffset = 0) {
  let onb = { ...startOnboarding(defaultState()), voiceType };
  const added = addPick(onb, { title, artist });
  onb = applyLookup(added.onboarding, added.key, result);
  return setPickKey(onb, added.key, keyOffset);
}

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
