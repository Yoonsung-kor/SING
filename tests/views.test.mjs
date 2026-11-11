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

test('when nothing stood out, the card says so instead of inventing a problem', () => {
  const feedback = { good: ['편하게 올렸어요'], improve: [], practice: [{ text: '허밍해요', link: 'practice' }], createdAt: '2026-11-07T01:00:00.000Z' };
  const html = resultPage({ session: { ...lesson, feedback } });
  assert.match(html, /아쉬운 점<\/h3>[\s\S]*?이번엔 크게 아쉬운 점이 없었어요\./);
});

test('feedback: AI switched off says so; odd links in a saved card do not break the page', () => {
  assert.ok(resultPage({ feedbackError: 'off' }).includes('지금은 AI 피드백을 쓸 수 없어요.'));
  assert.ok(!resultPage({ feedbackError: 'off' }).includes('잠시 후 다시 시도해 주세요'));
  const feedback = { good: ['좋아요'], improve: [], practice: [{ text: '허밍해요', link: 'evil' }], createdAt: '2026-11-07T01:00:00.000Z' };
  assert.ok(resultPage({ session: { ...lesson, feedback } }).includes('허밍해요'));
});

test('알아두기 shows today\'s column and the past ones to read again', async () => {
  const { COLUMNS } = await import('../src/columns.js');
  const state = { ...defaultState(), settings: { ...defaultState().settings, learnStartDay: '2026-11-07' } };
  const first = renderView({ page: 'learn', state, today: '2026-11-07' });
  assert.ok(first.includes('오늘의 칼럼') && first.includes('음높이는 소리의 위치예요') && first.includes('data-action="learn-complete"'));
  assert.ok(!first.includes('data-action="learn-column"'));
  const third = renderView({ page: 'learn', state, today: '2026-11-09' });
  assert.ok(third.includes(COLUMNS[2].sources[0].url.replace(/&/g, '&amp;')));
  assert.match(third, new RegExp(`data-action="learn-column" data-id="${COLUMNS[1].id}"[\\s\\S]*data-action="learn-column" data-id="${COLUMNS[0].id}"`));
  const past = renderView({ page: 'learn', state, today: '2026-11-09', learnColumnId: COLUMNS[0].id });
  assert.ok(past.includes('지난 칼럼') && past.includes('음높이는 소리의 위치예요'));
  assert.match(past, /data-action="learn"[^>]*>[\s\S]*?오늘의 칼럼 보기/);
  assert.ok(!past.includes('style="'));
});

test('a column\'s text is escaped and keeps its line breaks', () => {
  const columns = [{ id: 'x', title: 'a\nb', lead: '<b>x</b>', blocks: [{ type: 'point', title: '<i>t</i>', text: 'y' }, { type: 'p', text: '<i>z</i>' }], sources: [{ label: 'L', url: 'https://e.org/?a=1&b=2' }] }];
  const html = renderView({ page: 'learn', state: defaultState(), today: '2026-11-07', columns });
  for (const text of ['a<br>b', '&lt;b&gt;x', '&lt;i&gt;t', '&lt;i&gt;z', 'a=1&amp;b=2', '01']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<b>x') && !html.includes('<i>z'));
});

test('the humming screens say the three seconds start once the hum is heard', async () => {
  const { createLesson } = await import('../src/lesson.js');
  const session = { ...createLesson(new Date(), null), phase: 'start' };
  const explore = renderView({ page: 'explore', state: defaultState(), session, busy: false });
  assert.ok(explore.includes('버튼을 누르고 ‘음—’ 하면 그때부터 3초 들어요'));
  assert.ok(!explore.includes('녹음은 버튼을 누르면 시작해요'));
  const intro = renderView({ page: 'intro', state: defaultState(), session, busy: false });
  assert.ok(intro.includes('소리가 들리면 그때부터 3초 들어요.'));
  assert.ok(!intro.includes('녹음은 3초예요.'));
});
