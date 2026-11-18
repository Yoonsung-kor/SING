import assert from 'node:assert/strict';
import test from 'node:test';
import { usageSummary, feedbackLink, nextNudge, installHelp } from '../src/nudges.js';
import { defaultState } from '../src/storage.js';

const DAY = 86400000;
const NOW = Date.parse('2026-11-20T03:00:00Z');
const ago = days => new Date(NOW - days * DAY).toISOString();
const withState = ({ finished = 0, unfinished = 0, songs = 0, playlists = 0, settings = {} } = {}) => {
  const base = defaultState();
  return {
    ...base,
    sessions: [...Array.from({ length: finished }, (_, i) => ({ id: `f${i}`, status: 'finished' })), ...Array.from({ length: unfinished }, (_, i) => ({ id: `u${i}`, status: 'active' }))],
    songs: Array.from({ length: songs }, (_, i) => ({ id: `s${i}` })),
    playlists: Array.from({ length: playlists }, (_, i) => ({ id: `p${i}` })),
    settings: { ...base.settings, ...settings },
  };
};
const at = (state, extra = {}) => nextNudge(state, { today: '2026-11-20', now: NOW, standalone: false, hasFeedbackUrl: true, ...extra });

test('the usage summary counts finished hums, songs and playlists', () => {
  assert.equal(usageSummary(withState({ finished: 3, unfinished: 2, songs: 5, playlists: 2 })), '허밍 3회 · 곡 5개 · 플레이리스트 2개');
  assert.equal(usageSummary(withState({ settings: { voice: { comfortableHighMidi: 69 } } })), '허밍 0회 · 곡 0개 · 플레이리스트 0개 · 내 음역 설정함');
});

test('the survey link carries the summary where the form asks for it', () => {
  assert.equal(feedbackLink('https://forms.gle/x?entry.1=__USAGE__', '허밍 3회 · 곡 5개'), `https://forms.gle/x?entry.1=${encodeURIComponent('허밍 3회 · 곡 5개')}`);
  assert.equal(feedbackLink('https://forms.gle/x', '허밍 3회'), 'https://forms.gle/x');
  assert.equal(feedbackLink('', '허밍 3회'), null);
  assert.equal(feedbackLink(null, '허밍 3회'), null);
});

test('the feedback card comes on the second day, or after a hum and a song', () => {
  assert.equal(at(withState({ settings: { installNudgeAt: ago(1), openDays: ['2026-11-19'] } })), 'feedback');
  assert.equal(at(withState({ finished: 1, songs: 1, settings: { installNudgeAt: ago(1) } })), 'feedback');
  assert.equal(at(withState({ finished: 1, settings: { installNudgeAt: ago(1), openDays: ['2026-11-20'] } })), null, 'first day, no song yet');
  assert.equal(at(withState({ finished: 1, songs: 1, settings: { installNudgeAt: ago(1) } }), { hasFeedbackUrl: false }), null, 'no survey');
  assert.equal(at(withState({ finished: 1, songs: 1, settings: { installNudgeAt: ago(1), feedbackNudgeAt: ago(1) } })), null, 'put off once');
  assert.equal(at(withState({ finished: 1, songs: 1, settings: { installNudgeAt: ago(1), feedbackAt: ago(3) } })), null, 'already answered');
});

test('the home-screen card shows until it is added or put off', () => {
  assert.equal(at(withState()), 'install');
  assert.equal(at(withState(), { standalone: true }), null);
  assert.equal(at(withState({ settings: { installNudgeAt: ago(0) } })), null);
});

test('the backup card comes with something worth keeping, then every two weeks', () => {
  const ready = settings => withState({ finished: 2, settings: { installNudgeAt: ago(1), feedbackAt: ago(1), ...settings } });
  assert.equal(at(ready()), 'backup');
  assert.equal(at(withState({ songs: 3, settings: { installNudgeAt: ago(1), feedbackAt: ago(1) } })), 'backup');
  assert.equal(at(withState({ finished: 1, songs: 2, settings: { installNudgeAt: ago(1), feedbackAt: ago(1) } })), null, 'not much yet');
  assert.equal(at(ready({ backupNudgeAt: ago(14) })), 'backup');
  assert.equal(at(ready({ backupNudgeAt: ago(13) })), null);
  assert.equal(at(ready({ lastBackupAt: ago(13) })), null);
  assert.equal(at(ready({ lastBackupAt: ago(15) })), 'backup');
});

test('one card at a time, the survey first', () => {
  assert.equal(at(withState({ finished: 2, songs: 3, settings: { openDays: ['2026-11-18', '2026-11-19'] } })), 'feedback');
  assert.equal(at(withState({ finished: 2, songs: 3, settings: { feedbackAt: ago(1) } })), 'install');
});

test('adding to the home screen: the iPhone words say its home-screen app asks for the invite once more', () => {
  const ios = installHelp('ios');
  assert.ok(ios.startsWith('아래 공유 버튼을 누르고 ‘홈 화면에 추가’를 골라 주세요.'));
  for (const words of ['초대 코드를 한 번 더', '받은 초대 링크를 그대로 붙여 넣으면 돼요', '기록 백업']) assert.ok(ios.includes(words), words);
  assert.equal(installHelp('android'), '브라우저 메뉴(⋮)에서 ‘홈 화면에 추가’를 골라 주세요.');
  assert.equal(installHelp('other'), installHelp('android'));
});
