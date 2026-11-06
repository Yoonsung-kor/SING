import assert from 'node:assert/strict';
import test from 'node:test';
import { hummingPayload, lineMetrics, chorusDiffs, songPayload, sungLines, cleanFeedback } from '../src/practice-feedback.js';

// 50 ms frames: 0-2 s steady A3, 2-4 s A3/B3 alternating, 4-6 s silence, 6-8 s E4.
const frames = [];
for (let i = 0; i < 160; i++) {
  const t = Math.round(i * 5) / 100;
  frames.push({ songTime: t, midi: t < 2 ? 57 : t < 4 ? (i % 2 ? 59 : 57) : t < 6 ? null : 64 });
}
const lines = [{ t: 0, text: 'word-a' }, { t: 2, text: 'word-b' }, { t: 4, text: 'word-c' }, { t: 6, text: 'word-d' }, { t: 8, text: '' }];

test('line metrics: steady, wobbling, silent and above the comfortable top', () => {
  const stats = lineMetrics(frames, lines, { comfortableHighMidi: 60 });
  assert.deepEqual(stats.map(s => s.id), [0, 1, 2, 3]);
  const [steady, wobbly, silent, high] = stats;
  assert.deepEqual([steady.voiced, steady.wobble, steady.top, steady.overComfort, steady.gaps], [1, 0, '1옥 라', 0, 0]);
  assert.ok(wobbly.wobble > 0.9 && wobbly.voiced === 1);
  assert.deepEqual([silent.voiced, silent.gaps, silent.top], [0, 1, null]);
  assert.deepEqual([high.overComfort, high.top], [1, '2옥 미']);
  assert.deepEqual([steady.start, steady.end], [0, 2]);
});

test('lines that were sung: voiced 0.3 or more', () => {
  assert.equal(sungLines([{ voiced: 0.29 }, { voiced: 0.3 }, { voiced: 1 }]), 2);
});

test('the same melody sung twice: nth sung line of each chorus compared', () => {
  const sections = [{ t: 0, label: '후렴 1', kind: 'chorus' }, { t: 10, label: '2절', kind: 'verse' }, { t: 20, label: '후렴 2', kind: 'chorus' }];
  const stats = [
    { id: 0, start: 0, voiced: 1, median: 57 }, { id: 1, start: 4, voiced: 1, median: 59 },
    { id: 2, start: 12, voiced: 1, median: 50 },
    { id: 3, start: 20, voiced: 1, median: 58 }, { id: 4, start: 24, voiced: 1, median: 59 },
  ];
  assert.deepEqual(chorusDiffs(stats, sections), [{ ids: [0, 3], semitones: -1 }, { ids: [1, 4], semitones: 0 }]);
  assert.deepEqual(chorusDiffs(stats, sections.slice(0, 2)), []);
});

test('the song payload names sections and never carries lyric text', () => {
  const sections = [{ t: 0, label: '노래 시작 · 1절', kind: 'start' }, { t: 6, label: '후렴 1', kind: 'chorus' }];
  const stats = lineMetrics(frames, lines, { comfortableHighMidi: 60 });
  const payload = songPayload({ title: '너의 모든 순간', artist: '성시경' }, sections, stats, [], 60);
  assert.equal(payload.kind, 'song');
  assert.deepEqual(payload.song, { title: '너의 모든 순간', artist: '성시경' });
  assert.equal(payload.comfortableHigh, '2옥 도');
  assert.deepEqual(payload.lines.map(l => l.section), ['노래 시작 · 1절', '노래 시작 · 1절', '노래 시작 · 1절', '후렴 1']);
  assert.deepEqual(Object.keys(payload.lines[0]).sort(), ['gaps', 'id', 'overComfort', 'section', 'top', 'voiced', 'wobble']);
  assert.ok(!JSON.stringify(payload).includes('word-'));
});

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

test('feedback from the AI: only known lines, short texts, two per list, links checked', () => {
  const raw = {
    good: [{ lineId: 1, text: ' 안정적이에요 ' }, { lineId: 99, text: '없는 줄' }, { lineId: 2, text: 'x'.repeat(81) }],
    improve: [{ lineId: 3, text: '숨' }, { lineId: 0, text: '' }, { lineId: 1, text: 'a' }, { lineId: 2, text: 'b' }],
    practice: [{ text: '허밍', link: 'practice' }, { text: '칼럼', link: 'x' }],
  };
  assert.deepEqual(cleanFeedback(raw, { kind: 'song', lineIds: [0, 1, 2, 3] }), {
    good: [{ lineId: 1, text: '안정적이에요' }],
    improve: [{ lineId: 3, text: '숨' }, { lineId: 1, text: 'a' }],
    practice: [{ text: '허밍', link: 'practice' }, { text: '칼럼', link: null }],
  });
  assert.deepEqual(cleanFeedback({ good: ['좋아요'], improve: [], practice: [] }, { kind: 'humming' }), { good: ['좋아요'], improve: [], practice: [] });
  assert.equal(cleanFeedback({ good: [{ lineId: 9, text: 'x' }], improve: [], practice: [] }, { kind: 'song', lineIds: [0] }), null);
  assert.equal(cleanFeedback(null, { kind: 'humming' }), null);
});

import { validatePracticeRequest } from '../src/practice-feedback.js';

test('feedback requests are checked before they reach the AI', () => {
  const song = { kind: 'song', song: { title: '너의 모든 순간', artist: '성시경' }, comfortableHigh: '2옥 도', lines: [{ id: 0, section: '후렴 1', voiced: 1, top: '1옥 라', overComfort: 0, wobble: 0.1, gaps: 0 }], chorusDiffs: [{ ids: [0, 3], semitones: -1 }] };
  assert.deepEqual(validatePracticeRequest(song), song);
  const humming = { kind: 'humming', attempts: [{ target: '1옥 라', sung: '1옥 솔♯', centsOff: -70, comfort: 'effort', reason: 'stable' }], comfortableNotes: ['1옥 솔'], todayHigh: '1옥 솔', previousHigh: null, comfortableHigh: '2옥 레', stoppedForPain: false };
  assert.deepEqual(validatePracticeRequest(humming), humming);
  for (const bad of [
    { ...song, kind: 'x' },
    { ...song, lines: Array.from({ length: 301 }, (_, id) => ({ ...song.lines[0], id })) },
    { ...song, lines: [{ ...song.lines[0], voiced: 2 }] },
    { ...song, lines: [{ ...song.lines[0], text: '가사' }] },
    { ...song, comfortableHigh: '<b>' },
    { ...humming, attempts: Array.from({ length: 41 }, () => humming.attempts[0]) },
    { ...humming, attempts: [{ ...humming.attempts[0], comfort: 'x' }] },
    null,
  ]) assert.throws(() => validatePracticeRequest(bad), undefined, JSON.stringify(bad)?.slice(0, 60));
});
