import assert from 'node:assert/strict';
import test from 'node:test';
import { koreanNote, noteLabel, notesInText } from '../src/notes.js';

test('Korean octave names are two below scientific octaves', () => {
  assert.equal(koreanNote(71), '2옥 시'); assert.equal(koreanNote(72), '3옥 도');
  assert.equal(koreanNote(70), '2옥 라♯'); assert.equal(koreanNote(42), '0옥 파♯');
  assert.equal(noteLabel(71), '2옥 시 (B4)');
});

test('reads Korean, short Korean, scientific and Japanese notations', () => {
  assert.deepEqual(notesInText("진성 '2옥타브 시', 가성 '3옥타브 도'"), [71, 72]);
  assert.deepEqual(notesInText('최고음 : 진성 3옥타브 레(D5), 가성 3옥타브 파#(F#5)'), [74, 78]);
  assert.deepEqual(notesInText('후반에 2옥 라#(A#4)가 등장'), [70]);
  assert.deepEqual(notesInText('최고 옥타브는 2옥타브 라b'), [68]);
  assert.deepEqual(notesInText('Melody Range D3 – D5'), [50, 74]);
  assert.deepEqual(notesInText('* 최고음: 2옥타브 시(B4) * 최저음: 0옥타브 파♯(F♯2)'), [42, 71]);
  assert.deepEqual(notesInText('hiA# (A#4), mid2G# (G#4), hiC'), [68, 70, 72]);
  assert.deepEqual(notesInText('mid2A mid1G'), [55, 57]);
  assert.deepEqual(notesInText('조성: B major(나장조) → C major(다장조)'), []);
});
