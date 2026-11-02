import assert from 'node:assert/strict';
import test from 'node:test';
import { humSampleFor } from '../src/voice.js';
import { renderView } from '../src/views.js';
import { createLesson } from '../src/lesson.js';
import { defaultState } from '../src/storage.js';

test('hum samples exist only for registered grid notes and transpose by at most one semitone', () => {
  assert.equal(humSampleFor(57), null);
  const samples = [{ midi: 57, ai: false }];
  assert.deepEqual(humSampleFor(57, samples), { midi: 57, url: '/assets/hum-A3.mp3', playbackRate: 1, ai: false });
  assert.ok(Math.abs(humSampleFor(58, samples).playbackRate - 2 ** (1 / 12)) < 1e-12);
  assert.equal(humSampleFor(59, samples), null);
  for (const bad of [null, 35, 85, 57.5]) assert.equal(humSampleFor(bad, samples), null);
});

test('without registered samples the practice screens show no hum button and keep the notice', () => {
  const session = { ...createLesson(new Date(), 57), phase: 'capture' };
  const explore = renderView({ page: 'explore', state: defaultState(), session, busy: false });
  assert.ok(!explore.includes('data-action="tone-hum"'));
  const intro = renderView({ page: 'intro', state: defaultState(), session, busy: false });
  assert.ok(intro.includes('사람의 허밍 시범은 아직 준비 중이에요.'));
});
