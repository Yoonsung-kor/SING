import assert from 'node:assert/strict';
import test from 'node:test';
import { staffPosition, staffSvg, fitKey, keyGuide, keyRow } from '../src/range-graphics.js';

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

test('the key that fits brings the top note down to my comfortable high, within the karaoke range', () => {
  assert.deepEqual([4, 2, 0, -3, 20].map(fitKey), [-4, -2, 0, 0, -12]);
});

test('key row: the original key in the middle, the key that fits me filled, the way there shaded', () => {
  const row = keyRow(4);
  assert.match(row, /class="key-row" role="img" aria-label="지금은 −4키로 부르면 편해요"/);
  assert.equal((row.match(/class="key-cell/g) || []).length, 13);
  assert.equal((row.match(/class="key-cell[^"]*\bfit\b/g) || []).length, 1);
  assert.equal((row.match(/class="key-cell path"/g) || []).length, 3);
  assert.match(row, /class="key-cell origin"/);
  assert.match(row, />원키<\/text>/);
  assert.match(row, />−4<\/text>/);
  assert.match(row, /← 낮게[\s\S]*높게 →/);
  assert.doesNotMatch(row, /style=/);
  assert.match(keyRow(-2), /class="key-cell fit origin"/);
  assert.match(keyRow(-2), />그대로<\/text>/);
  assert.equal((keyRow(9).match(/class="key-cell/g) || []).length, 19);
});

test('key row rings my saved key, unless it is the original key or already the key that fits', () => {
  const row = keyRow(4, -1);
  assert.match(row, /class="key-cell path saved"/);
  assert.match(row, />내 키 −1<\/text>/);
  assert.doesNotMatch(keyRow(4, 0), /내 키|saved/);
  assert.doesNotMatch(keyRow(4, -4), /내 키|saved/);
  assert.equal((keyRow(1, -10).match(/class="key-cell/g) || []).length, 21);
});

test('key guide speaks softly: what key fits now, and how the original or my saved key feels', () => {
  assert.deepEqual(keyGuide(4), { main: '지금은 −4키로 부르면 편해요', sub: '원키는 연습하면서 한 키씩 올려 봐요' });
  assert.deepEqual(keyGuide(2), { main: '지금은 −2키로 부르면 편해요', sub: '원키도 연습 삼아 도전해 볼 만해요' });
  assert.deepEqual(keyGuide(0), { main: '원키 그대로 편하게 불러요', sub: '' });
  assert.deepEqual(keyGuide(-3), { main: '원키 그대로 편하게 불러요', sub: '' });
  assert.equal(keyGuide(4, -1).sub, '저장한 내 키(−1)는 도전해 보기 좋아요');
  assert.equal(keyGuide(4, -4).sub, '저장한 내 키(−4)도 편하게 맞아요');
  assert.equal(keyGuide(6, -1).sub, '저장한 내 키(−1)에서 조금 더 내려도 좋아요');
  assert.equal(keyGuide(-2, 3).sub, '저장한 내 키(+3)는 도전해 보기 좋아요');
});
