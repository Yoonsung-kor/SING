import test from 'node:test';
import assert from 'node:assert/strict';
import { addActivity, needsDailyCheck } from '../src/lesson.js';
import { defaultState } from '../src/storage.js';

test('learning and rest remain distinct and repeat taps do not duplicate a daily entry', () => {
  const now = new Date(2026, 8, 27, 23, 30);
  let state = addActivity(defaultState(), 'learn', undefined, now);
  state = addActivity(state, 'learn', undefined, now);
  state = addActivity(state, 'rest', undefined, now);
  assert.equal(state.activities.length, 2);
  assert.deepEqual(state.activities.map(a => a.type), ['learn', 'rest']);
  assert.equal(state.activities[0].day, '2026-09-27');
});

test('resaving a completed lesson does not award another activity and saved dates never move', () => {
  const now = new Date(2026, 8, 27, 23, 30);
  const nextDay = new Date(2026, 8, 28, 0, 30);
  let state = addActivity(defaultState(), 'practice', 'lesson-1', now);
  state = addActivity(state, 'practice', 'lesson-1', nextDay);
  assert.equal(state.activities.length, 1);
  assert.equal(state.activities[0].day, '2026-09-27');
});

test('a session needs a new condition check when its calendar day has changed', () => {
  assert.equal(needsDailyCheck({day:'2026-09-27'},new Date(2026,8,27,23,59)),false);
  assert.equal(needsDailyCheck({day:'2026-09-27'},new Date(2026,8,28,0,1)),true);
});
