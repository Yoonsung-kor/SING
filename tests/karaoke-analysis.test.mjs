import assert from 'node:assert/strict';
import test from 'node:test';
import { sungRange, suggestHigh, analyzeKaraoke, firstVoice } from '../src/karaoke-analysis.js';
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
  assert.ok(result.firstVoice >= notes[0].t - 0.2 && result.firstVoice <= notes[0].t + 2, `first voice ${result.firstVoice}, first note ${notes[0].t}`);
  assert.equal(analyzeKaraoke(mix.subarray(0, 5 * RATE), { comfortableHighMidi: 66 }).status, 'short');
});

// Tracker frames every 20 ms for 10 s, voiced (2옥 도) inside the given [from, to) runs.
const framesWith = runs => Array.from({ length: 500 }, (_, i) => {
  const songTime = i * 0.02;
  const voiced = runs.some(([from, to]) => songTime >= from - 1e-6 && songTime < to - 1e-6);
  return { songTime, midi: voiced ? 60 : null, strength: voiced ? 1 : 0 };
});
const near = (value, expected) => Number.isFinite(value) && Math.abs(value - expected) < 1e-6;

test('the first voice is the first sound held 0.3 s; a shorter noise before it is skipped', () => {
  assert.ok(near(firstVoice(framesWith([[1.0, 1.1], [3.0, 5.0]])), 3.0));
  assert.ok(near(firstVoice(framesWith([[2.0, 2.3]])), 2.0), 'exactly 0.3 s counts');
  assert.equal(firstVoice(framesWith([[1.0, 1.2], [4.0, 4.1]])), null);
  assert.equal(firstVoice([]), null);
});

test('the sung range also has a low end: the second lowest long note', () => {
  assert.equal(sungRange([note(52, 1), note(55, 1), note(60, 0.9), note(48, 0.4)]).lowHeld, 55, 'short notes do not count, the lowest one may be a slip');
  assert.equal(sungRange([note(52, 1)]).lowHeld, null);
});

test('a karaoke report carries what its picture draws: the length, the notes held 0.3 s or more, and every long high note', () => {
  const RATE = 16000;
  const notes = makeMelody({ seed: 21, seconds: 60, low: 52, high: 69 });
  const { samples } = renderVoice(notes, RATE, { seed: 22, seconds: 60 });
  const mix = mixAt(karaokeEcho(samples, RATE), renderBacking(60, RATE), RATE, 6);
  const result = analyzeKaraoke(mix, { comfortableHighMidi: 66 });
  assert.ok(Math.abs(result.seconds - mix.length / RATE) < 0.1, `seconds ${result.seconds}`);
  assert.ok(result.contour.length >= 10, `contour ${result.contour.length}`);
  for (const [start, end, midi] of result.contour) {
    assert.ok(end - start >= 0.3 - 1e-6, 'short notes are left out of the picture');
    assert.ok(start >= 0 && end <= result.seconds + 0.1 && midi > 30 && midi < 100);
  }
  for (const spot of result.spots) assert.ok(result.highs.some(high => Math.abs(high.time - spot.time) < 1e-6), 'every chosen spot is one of the long high notes');
  assert.ok(result.highs.every(high => high.end > high.time && typeof high.outcome === 'string'));
  assert.ok(Number.isInteger(result.range.lowHeld) && result.range.lowHeld <= result.range.topHeld);
});
