import assert from 'node:assert/strict';
import test from 'node:test';
import { sungRange, suggestHigh, analyzeKaraoke } from '../src/karaoke-analysis.js';
import { makeMelody, renderVoice, karaokeEcho, mixAt, renderBacking } from './helpers/synth-voice.mjs';

const note = (midi, length, drop = 0) => ({ start: 0, end: length, midi, first: midi + drop / 2, middle: midi, last: midi - drop / 2 });

test('the sung range counts long notes and leaves out the single highest (it may be a slip)', () => {
  assert.deepEqual(sungRange([note(72, 1), note(70, 1), note(70, 0.9), note(65, 1)]).topHeld, 70);
  assert.equal(sungRange([note(72, 1)]).topHeld, null, 'one long note is not enough');
  assert.equal(sungRange([note(72, 0.5), note(71, 0.5), note(64, 1)]).topHeld, null, 'half-second notes are not long');
  const kept = sungRange([note(72, 1, 0.8), note(71, 1, 0.8), note(69, 1), note(68, 0.9), note(67, 0.7)]);
  assert.equal(kept.keptHigh, 68, 'sagging notes and notes under 0.8 s are not "kept"');
  assert.equal(kept.topHeld, 71);
});

test('a new comfortable top is suggested only a little above the current one', () => {
  assert.equal(suggestHigh({ keptHigh: 69, current: 67 }), 69);
  assert.equal(suggestHigh({ keptHigh: 71, current: 67 }), 71);
  assert.equal(suggestHigh({ keptHigh: 67, current: 67 }), null);
  assert.equal(suggestHigh({ keptHigh: 72, current: 67 }), null, 'five above is more likely a slip');
  assert.equal(suggestHigh({ keptHigh: 69, current: null }), null);
  assert.equal(suggestHigh({ keptHigh: null, current: 67 }), null);
});

test('a karaoke take is reported by its long high notes only', () => {
  const RATE = 16000;
  const notes = makeMelody({ seed: 21, seconds: 60, low: 52, high: 69 });
  const { samples } = renderVoice(notes, RATE, { seed: 22, seconds: 60 });
  const mix = mixAt(karaokeEcho(samples, RATE), renderBacking(60, RATE), RATE, 6);
  const progress = [];
  const result = analyzeKaraoke(mix, { comfortableHighMidi: 66, onProgress: value => progress.push(value) });
  assert.equal(result.status, 'ok');
  assert.ok(result.spots.length >= 1, 'the melody has long notes near its top');
  assert.ok(result.spots.every(spot => spot.kind === 'high-hold'), JSON.stringify(result.spots.map(spot => spot.kind)));
  assert.ok(result.spots.every(spot => spot.outcome !== 'ask'));
  assert.ok(result.spots.every(spot => spot.section === '' && spot.lineId === null));
  assert.ok(Number.isInteger(result.range.topHeld));
  assert.equal(progress.at(-1), 1);
  assert.equal(analyzeKaraoke(mix.subarray(0, 5 * RATE), { comfortableHighMidi: 66 }).status, 'short');
});
