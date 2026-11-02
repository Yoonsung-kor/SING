import assert from 'node:assert/strict';
import test from 'node:test';
import { staffPosition, staffSvg, gapPercent, rangeBar } from '../src/range-graphics.js';

test('staff positions use real pitch on the treble staff', () => {
  assert.deepEqual(staffPosition(71), { step: 4, sharp: false, y: 80, ledgers: [] });
  assert.deepEqual(staffPosition(70), { step: 3, sharp: true, y: 85, ledgers: [] });
  assert.deepEqual(staffPosition(76), { step: 7, sharp: false, y: 65, ledgers: [] });
  assert.deepEqual(staffPosition(55), { step: -5, sharp: false, y: 125, ledgers: [110, 120] });
  assert.deepEqual(staffPosition(88), { step: 14, sharp: false, y: 30, ledgers: [50, 40, 30] });
});

test('staff svg labels the note and draws the challenge band above it', () => {
  assert.match(staffSvg(71), /aria-label="2옥 시 \(B4\) 음표"/);
  assert.match(staffSvg(71), /도전 구간 · 3옥 도~3옥 레/);
  assert.doesNotMatch(staffSvg(71, { band: false }), /도전 구간/);
});

test('range bar maps gaps to percent and zones', () => {
  assert.deepEqual([0, 3, -10, 10].map(gapPercent), [50, 75, 0, 100]);
  assert.match(rangeBar(3), /aria-label="도전 구간, 반음 3개 위"/);
  assert.match(rangeBar(-2), /aria-label="편한 구간"/);
  assert.match(rangeBar(5), /aria-label="아직 무리, 반음 5개 위"/);
});
