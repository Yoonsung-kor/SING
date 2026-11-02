import assert from 'node:assert/strict';
import test from 'node:test';
import { comfortableHigh, octaveChoice, candidateShift, gapZone, keyHint, pickRecommendations } from '../src/vocal-range.js';

test('comfortable high is the highest sung top note among found songs, clamped', () => {
  assert.equal(comfortableHigh([{ highestMidi: 71, keyOffset: 0, octaveShift: 0 }, { highestMidi: 72, keyOffset: -2, octaveShift: 0 }, { highestMidi: null, keyOffset: 0, octaveShift: 0 }]), 71);
  assert.equal(comfortableHigh([{ highestMidi: 71, keyOffset: 0, octaveShift: -12 }]), 59);
  assert.equal(comfortableHigh([{ highestMidi: null, keyOffset: 0, octaveShift: 0 }]), null);
  assert.equal(comfortableHigh([{ highestMidi: 88, keyOffset: 5, octaveShift: 0 }]), 88);
});

test('octave suggestions follow the spec table', () => {
  assert.deepEqual(octaveChoice('male', 'female'), { shift: -12, checked: true });
  assert.deepEqual(octaveChoice('female', 'male'), { shift: 12, checked: false });
  for (const [t, v] of [['male', 'mixed'], ['female', 'mixed'], ['male', 'male'], ['female', 'female'], ['male', null]]) assert.equal(octaveChoice(t, v), null);
  assert.equal(candidateShift('male', 'female'), -12); assert.equal(candidateShift('female', 'male'), 0);
});

test('zones split at 0/1 and 3/4 semitones; key hints only above', () => {
  assert.deepEqual([-5, 0, 1, 3, 4].map(gapZone), ['easy', 'easy', 'challenge', 'challenge', 'hard']);
  assert.equal(keyHint(0), null); assert.equal(keyHint(3), '버거우면 −3키'); assert.equal(keyHint(20), '버거우면 −12키');
});

test('picking keeps intent matches first, then unchecked songs, and flags fallback', () => {
  const voice = { comfortableHighMidi: 71, voiceType: 'male' };
  const v = (title, highestMidi, vocal = 'male') => ({ title, range: highestMidi === null ? null : { highestMidi }, vocal });
  const items = [v('easy', 69), v('ch2', 73), v('unknown', null), v('hard', 76), v('ch1', 72), v('female-easy', 81, 'female')];
  const titles = r => r.items.map(i => i.title);
  assert.deepEqual(titles(pickRecommendations(items, { voice, intent: 'challenge' })), ['ch2', 'ch1', 'unknown']);
  assert.deepEqual(titles(pickRecommendations(items, { voice, intent: 'comfortable' })), ['easy', 'female-easy', 'unknown']);
  // final #14 (spec 9 step 4): with my range, unchecked songs go after checked ones in every intent.
  assert.deepEqual(titles(pickRecommendations(items, { voice, intent: 'any' })), ['easy', 'ch2', 'hard']);
  assert.deepEqual(titles(pickRecommendations([v('unknown', null), v('easy', 69)], { voice, intent: 'any' })), ['easy', 'unknown']);
  assert.deepEqual(titles(pickRecommendations([v('unknown', null), v('easy', 69)], { voice: null, intent: 'any' })), ['unknown', 'easy']);
  const fb = pickRecommendations([v('hard', 76), v('unknown', null)], { voice, intent: 'challenge' });
  assert.deepEqual([titles(fb), fb.fallback], [['unknown'], true]);
  assert.equal(pickRecommendations(items, { voice: null, intent: 'challenge' }).items.length, 3);
});
