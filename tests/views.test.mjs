import assert from 'node:assert/strict';
import test from 'node:test';
import { renderView, pageNotice } from '../src/views.js';
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

test('the page notice says the practice room is opening, unless a storage problem needs saying first', () => {
  assert.match(pageNotice({ serverWaking: true }), /연습실을 여는 중이에요\. 1분쯤 걸릴 수 있어요\./);
  assert.match(pageNotice({ storageError: '저장하지 못했어요', serverWaking: true }), /저장하지 못했어요/);
  assert.doesNotMatch(pageNotice({ storageError: '저장하지 못했어요', serverWaking: true }), /연습실을 여는 중/);
  assert.equal(pageNotice({}), '');
});

const gate = extra => renderView({ state: defaultState(), session: null, busy: false, demo: false, ...extra });

test('the invite screen asks for the code and shows no menu', () => {
  const html = gate({ page: 'invite' });
  assert.match(html, /초대받은 분만 쓸 수 있어요/);
  assert.match(html, /받은 초대 링크로 다시 열거나, 초대 코드나 받은 링크를 그대로 붙여 넣어 주세요\./);
  assert.match(html, /<form id="invite-form"/);
  assert.match(html, /name="code"[^>]*maxlength="300"/, 'a whole pasted link fits');
  assert.match(html, /name="code"[^>]*autocapitalize="off"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, />들어가기</);
  assert.doesNotMatch(html, /class="navigation"/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(gate({ page: 'invite', inviteError: '초대 코드가 맞지 않아요. 다시 확인해 주세요.' }), /role="alert"[^>]*>초대 코드가 맞지 않아요\. 다시 확인해 주세요\.</);
});

const homeWith = extra => renderView({ page: 'home', state: defaultState(), session: null, busy: false, demo: false, ...extra });

test('home shows at most one reminder card, each with a way to put it off', () => {
  const install = homeWith({ nudge: 'install' });
  assert.match(install, /홈 화면에 추가해 두세요/);
  assert.match(install, /앱처럼 바로 열리고, 기록이 더 오래 남아요\./);
  assert.match(install, /data-action="install"[^>]*>홈 화면에 추가</);
  assert.match(install, /data-action="nudge-later" data-id="install"[^>]*>나중에</);
  assert.match(homeWith({ nudge: 'install', installHelp: '아래 공유 버튼을 누르고 ‘홈 화면에 추가’를 골라 주세요.' }), /아래 공유 버튼을 누르고 ‘홈 화면에 추가’를 골라 주세요\./);
  const backup = homeWith({ nudge: 'backup' });
  assert.match(backup, /기록은 이 폰에만 있어요\. 백업 파일을 받아 두면 폰을 바꿔도 이어서 쓸 수 있어요\./);
  assert.match(backup, /data-action="export"[^>]*>백업 내려받기</);
  assert.match(backup, /data-id="backup"[^>]*>나중에</);
  const survey = homeWith({ nudge: 'feedback', feedbackUrl: 'https://forms.gle/x' });
  assert.match(survey, /써 보니 어땠나요\? 1분이면 돼요\./);
  assert.match(survey, /data-action="feedback-open"[^>]*>의견 남기기</);
  assert.doesNotMatch(homeWith({}), /나중에/);
});

test('the feedback link sits at the bottom of home only when there is a survey', () => {
  assert.match(homeWith({ feedbackUrl: 'https://forms.gle/x' }), /data-action="feedback-open"[^>]*>의견 남기기</);
  assert.doesNotMatch(homeWith({}), /의견 남기기/);
});

test('backing up is out in the open on the history page, not folded away', () => {
  const html = renderView({ page: 'history', state: defaultState(), session: null, busy: false, demo: false });
  const backupAt = html.indexOf('백업 내려받기');
  const foldStart = html.indexOf('<details');
  const foldEnd = html.indexOf('</details>');
  assert.ok(backupAt > 0, 'backup button exists');
  assert.ok(backupAt < foldStart || backupAt > foldEnd, 'backup button is outside the folded settings');
  assert.match(html, /기록은 이 폰에만 있어요\. 백업 파일을 받아 두면 폰을 바꿔도 이어서 쓸 수 있어요\./);
  assert.match(html, /id="backup-file"/);
  assert.ok(html.indexOf('모든 기록 삭제') > foldStart, 'deleting stays folded away');
});

test('the history page says what the server itself receives', () => {
  const html = renderView({ page: 'history', state: defaultState(), session: null, busy: false, demo: false });
  assert.match(html, /이 앱의 서버는 하루 사용량을 세려고 기기마다 무작위 번호 하나를 받아요\. 이름이나 연락처와 이어지지 않아요\./);
});
