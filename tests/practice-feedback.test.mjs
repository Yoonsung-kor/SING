import assert from 'node:assert/strict';
import test from 'node:test';
import { hummingPayload, cleanFeedback, songFrames, validatePracticeRequest } from '../src/practice-feedback.js';

test('the humming payload uses note names and flags a painful attempt', () => {
  const session = { stopReason: null, attempts: [
    { targetMidi: null, midi: 55, cents: 10, comfort: 'comfortable', reason: 'stable', verified: true, reliable: true },
    { targetMidi: 57, midi: 56, cents: 30, comfort: 'effort', reason: 'stable', verified: false, reliable: true },
    { targetMidi: 59, midi: null, cents: null, comfort: 'pain', reason: 'unconfirmed', verified: false, reliable: false },
  ] };
  const payload = hummingPayload(session, { previousHighMidi: 54, comfortableHighMidi: 62 });
  assert.deepEqual(payload.attempts[0], { target: null, sung: '1옥 솔', centsOff: null, comfort: 'comfortable', reason: 'stable' });
  assert.deepEqual(payload.attempts[1], { target: '1옥 라', sung: '1옥 솔♯', centsOff: -70, comfort: 'effort', reason: 'stable' });
  assert.deepEqual([payload.comfortableNotes, payload.todayHigh, payload.previousHigh, payload.comfortableHigh, payload.stoppedForPain], [['1옥 솔'], '1옥 솔', '1옥 파♯', '2옥 레', true]);
  assert.equal(hummingPayload({ ...session, attempts: session.attempts.slice(0, 2) }, {}).stoppedForPain, false);
});

test('humming feedback from the AI: short texts, two per list, links checked', () => {
  const raw = {
    good: [' 좋아요 ', 'x'.repeat(81), '또 좋아요', '세 번째'],
    improve: ['', '조금 낮았어요'],
    practice: [{ text: '허밍', link: 'practice' }, { text: '칼럼', link: 'x' }, { text: '셋', link: null }],
  };
  assert.deepEqual(cleanFeedback(raw), { good: ['좋아요', '또 좋아요'], improve: ['조금 낮았어요'], practice: [{ text: '허밍', link: 'practice' }, { text: '칼럼', link: null }] });
  assert.equal(cleanFeedback({ good: [], improve: [], practice: [] }), null);
  assert.equal(cleanFeedback(null), null);
  assert.equal(cleanFeedback({ good: [{ lineId: 1, text: '줄' }] }), null, 'the old per-line shape is not text');
});

test('feedback requests are checked before they reach the AI: a humming lesson or a song\'s spots, nothing else', () => {
  const humming = { kind: 'humming', attempts: [{ target: '1옥 라', sung: '1옥 솔♯', centsOff: -70, comfort: 'effort', reason: 'stable' }], comfortableNotes: ['1옥 솔'], todayHigh: '1옥 솔', previousHigh: null, comfortableHigh: '2옥 도', stoppedForPain: false };
  assert.deepEqual(validatePracticeRequest(humming), humming);
  const spots = { kind: 'spots', song: { title: '너의 모든 순간', artist: '성시경' }, comfortableHigh: '2옥 라', items: [{ id: 's1', kind: 'high-hold', outcome: 'kept', section: '후렴 1', from: null, to: '2옥 라', over: null, repeated: false }] };
  assert.deepEqual(validatePracticeRequest(spots), spots);
  const oldSong = { kind: 'song', song: { title: '곡', artist: '' }, comfortableHigh: null, lines: [{ id: 0, section: '', voiced: 1, top: null, overComfort: 0, wobble: 0, gaps: 0 }], chorusDiffs: [] };
  for (const bad of [
    oldSong,
    { ...humming, kind: 'x' },
    { ...humming, attempts: Array.from({ length: 41 }, () => humming.attempts[0]) },
    { ...humming, attempts: [{ ...humming.attempts[0], comfort: 'x' }] },
    { ...humming, comfortableHigh: '<b>' },
    { ...spots, items: [] },
    null,
  ]) assert.throws(() => validatePracticeRequest(bad), /bad practice request/, JSON.stringify(bad)?.slice(0, 60));
});

test('measured video times become song times by taking off the start difference (0 before aligning)', () => {
  assert.deepEqual(songFrames([{ time: 20, midi: 60 }, { time: 21.5, midi: null }], 15), [{ songTime: 5, midi: 60 }, { songTime: 6.5, midi: null }]);
  assert.deepEqual(songFrames([{ time: 3, midi: 57 }], 0), [{ songTime: 3, midi: 57 }]);
});
