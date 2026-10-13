import test from 'node:test';
import assert from 'node:assert/strict';
import { createLesson, recordAttempt, nextTarget, finishLesson, summarizeLesson, recommendedNote, localDay, weekDays } from '../src/lesson.js';

const now = new Date('2026-09-27T10:00:00+09:00');
const tone = (midi = 60, cents = 0) => ({ reliable: true, midi, cents, frequency: 261.63 });
const add = (s, measurement = tone(), comfort = 'comfortable') => recordAttempt(s, measurement, comfort, now);

test('a starting note needs a second comfortable confirmation before ascent', () => {
  const original = createLesson(now);
  const first = add(original);
  assert.equal(original.attempts.length, 0);
  assert.equal(first.targetMidi, 60);
  assert.equal(first.phase, 'confirm');
  assert.equal(nextTarget(first).targetMidi, 60);
  assert.equal(recommendedNote(first), null);
  const confirmed = add(first);
  assert.equal(confirmed.phase, 'ready');
  assert.equal(recommendedNote(confirmed), 60);
  const next = nextTarget(confirmed);
  assert.equal(next.targetMidi, 61);
  assert.equal(next.phase, 'capture');
});

test('a prior-session starting note is only a suggestion and needs two fresh confirmations', () => {
  const suggested = createLesson(now, 57);
  assert.equal(suggested.targetMidi, 57);
  assert.equal(recommendedNote(suggested), null);
  const first = add(suggested, tone(57));
  assert.equal(first.phase, 'confirm');
  assert.equal(nextTarget(first).targetMidi, 57);
  assert.equal(recommendedNote(first), null);
  const second = add(first, tone(57));
  assert.equal(second.phase, 'ready');
  assert.equal(recommendedNote(second), 57);
});

test('a different actual note is recorded but never passes the target', () => {
  const first = add(createLesson(now));
  const other = add(first, tone(72));
  assert.equal(other.attempts[1].midi, 72);
  assert.equal(other.attempts[1].targetMidi, 60);
  assert.equal(other.phase, 'retry');
  assert.equal(other.targetMidi, 60);
  assert.deepEqual(summarizeLesson(other).notes, [60]);
  assert.equal(recommendedNote(other), null);
});

test('matching accepts detuning within 50 cents, not the adjacent note', () => {
  const first = add(createLesson(now));
  assert.equal(add(first, tone(60, 40)).phase, 'ready');
  assert.equal(add(first, tone(61, -20)).phase, 'retry');
});

for (const comfort of ['effort', 'unsure', 'pain']) {
  test(`${comfort} ends exploration even with uncertain analysis`, () => {
    const before = add(createLesson(now));
    const ended = add(before, { reliable: false, midi: null }, comfort);
    assert.equal(ended.status, 'finished');
    assert.equal(ended.stopReason, comfort);
    assert.deepEqual(summarizeLesson(ended).notes, [60]);
    assert.equal(nextTarget(ended), ended);
    assert.equal(add(ended, tone(72)), ended);
  });
}

test('uncertain attempts have bounded retries and never confirm a note', () => {
  let s = createLesson(now);
  s = add(s, { reliable: false, midi: 60 });
  assert.equal(s.phase, 'retry');
  assert.equal(s.attempts[0].midi, null);
  s = add(s, { reliable: false, midi: null });
  assert.equal(s.status, 'exploring');
  s = add(s, { reliable: false, midi: null });
  assert.equal(s.status, 'finished');
  assert.equal(s.stopReason, 'measurement');
  assert.equal(recommendedNote(s), null);
});

test('8 attempts end exploration without labelling a vocal limit', () => {
  let s = add(add(createLesson(now)));
  for (let n = 61; n <= 66; n++) s = add(nextTarget(s), tone(n));
  assert.equal(s.attempts.length, 8);
  assert.equal(s.status, 'finished');
  assert.equal(s.stopReason, 'session-limit');
  assert.equal(summarizeLesson(s).highest, 66);
  assert.equal(recommendedNote(s), 60);
});

test('manual finish ignores late results and no data yields no range', () => {
  const ended = finishLesson(createLesson(now));
  assert.equal(add(ended), ended);
  assert.equal(summarizeLesson(ended).highest, null);
  assert.deepEqual(summarizeLesson(ended).notes, []);
});

test('a finished exploration can recommend a previously confirmed note but pain cannot', () => {
  const s = add(add(createLesson(now)));
  assert.equal(recommendedNote(finishLesson(s)), 60);
  assert.equal(recommendedNote(finishLesson(s, 'pain')), null);
});

test('invalid measurements do not create a confirmed note', () => {
  for (const measurement of [{ reliable: true, midi: NaN, cents: 0 }, { reliable: true, midi: 60, cents: NaN }, { reliable: true, midi: 500, cents: 0 }]) {
    assert.deepEqual(summarizeLesson(add(createLesson(now), measurement)).notes, []);
  }
});

test('local day and week are calendar dates without UTC round trip', () => {
  const d = new Date(2026, 8, 27, 0, 10);
  assert.equal(localDay(d), '2026-09-27');
  const week = weekDays(d);
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-09-21');
  assert.equal(week[6], '2026-09-27');
});
