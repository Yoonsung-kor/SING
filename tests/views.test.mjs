import assert from 'node:assert/strict';
import test from 'node:test';
import { renderView } from '../src/views.js';
import { defaultState } from '../src/storage.js';

const historyWith = settings => renderView({ page: 'history', state: { ...defaultState(), settings: { ...defaultState().settings, ...settings } }, session: null, busy: false, demo: false });

test('the history page shows whether the consent is current, old, or missing', () => {
  assert.match(historyWith({ aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 5 }), /AI 추천·곡 검색·영상 찾기: 동의함 · [\s\S]*data-action="ai-consent-revoke"/);
  assert.match(historyWith({ aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 4 }), /예전 동의/);
  assert.match(historyWith({}), /기록은 이 기기에만 · AI는 동의할 때만/);
  assert.match(historyWith({ aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 2 }), /예전 동의/);
  assert.match(historyWith({ aiConsentAt: '2026-11-02T01:00:00.000Z', aiConsentVersion: 1 }), /예전 동의 · 다음에 AI를 쓸 때 다시 확인해요/);
  assert.match(historyWith({}), /동의 안 함/);
});

const lesson = { id: 's1', startedAt: '2026-11-07T00:59:00.000Z', day: '2026-11-07', status: 'finished', targetMidi: 60, phase: 'result', retryCount: 0, stopReason: null,
  attempts: [{ id: 'a1', targetMidi: null, midi: 60, reliable: true, cents: 0, verified: true, comfort: 'comfortable', reason: 'stable', createdAt: '2026-11-07T01:00:00.000Z', recordingId: null }] };
const resultPage = (extra = {}) => renderView({ page: 'result', state: defaultState(), session: lesson, busy: false, demo: false, ...extra });

test('after a lesson the result offers AI feedback, says it is working, and says when it failed', () => {
  assert.match(resultPage(), /data-action="feedback-humming"[^>]*>[\s\S]*?AI 피드백 받기/);
  assert.ok(resultPage({ feedbackBusy: true }).includes('피드백을 만들고 있어요…'));
  assert.ok(resultPage({ feedbackError: true }).includes('지금은 피드백을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'));
});

test('saved feedback shows as a card with links to practice or learning, text escaped', () => {
  const feedback = { good: ['<b>편해요</b>'], improve: ['조금 낮았어요'], practice: [{ text: '허밍해요', link: 'practice' }, { text: '읽어 봐요', link: 'learn' }], createdAt: '2026-11-07T01:00:00.000Z' };
  const html = resultPage({ session: { ...lesson, feedback } });
  for (const text of ['잘한 점', '아쉬운 점', '추천 연습', '&lt;b&gt;편해요', '조금 낮았어요']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<b>편해요'));
  assert.match(html, /허밍해요[\s\S]*?data-action="home"/);
  assert.match(html, /읽어 봐요[\s\S]*?data-action="learn"/);
  assert.ok(html.includes('data-action="feedback-humming"'), 'can ask again');
  assert.ok(!html.includes('style="'));
});
