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

test('key guide: the first line names the key that fits now', () => {
  assert.equal(keyGuide(4).main, '지금은 −4키로 부르면 편해요');
  assert.equal(keyGuide(1).main, '지금은 −1키로 부르면 편해요');
  assert.equal(keyGuide(0).main, '원키 그대로 편하게 불러요');
  assert.equal(keyGuide(-3).main, '원키 그대로 편하게 불러요');
});

test('key guide: the second line changes with how far the original key is', () => {
  assert.equal(keyGuide(-2).sub, '+2키까지 올려도 편하게 부를 수 있어요');
  assert.equal(keyGuide(0).sub, '원키가 내 최고음과 딱 맞아요');
  assert.equal(keyGuide(1).sub, '원키와 한 키 차이예요. 원키로 도전해 봐도 좋아요');
  assert.equal(keyGuide(2).sub, '−1키로 익숙해지면 원키에도 도전해 봐요');
  assert.equal(keyGuide(3).sub, '한 키씩 올리면서 원키까지 도전해 봐요');
  assert.equal(keyGuide(4).sub, '한 키씩 올려서 −1키까지는 도전해 볼 만해요');
  assert.equal(keyGuide(5).sub, '한 키씩 올려서 −2키까지는 도전해 볼 만해요');
});

test('key guide: with a saved key, the second line is about that key', () => {
  assert.equal(keyGuide(4, -6).sub, '저장한 내 키(−6)는 여유 있어요. 한 키 올려 봐도 좋아요');
  assert.equal(keyGuide(4, -4).sub, '저장한 내 키(−4)가 딱 맞아요');
  assert.equal(keyGuide(4, -1).sub, '저장한 내 키(−1)로 도전 중이에요. 힘들면 −4키로 내려도 돼요');
  assert.equal(keyGuide(-2, 3).sub, '저장한 내 키(+3)로 도전 중이에요. 힘들면 원키로 내려도 돼요');
  assert.equal(keyGuide(4, 1).sub, '저장한 내 키(+1)는 아직 높을 수 있어요. −1키부터 올려 봐요');
  assert.equal(keyGuide(3, 1).sub, '저장한 내 키(+1)는 아직 높을 수 있어요. 원키부터 올려 봐요');
});
