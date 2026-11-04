import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSections, SECTION_KINDS } from '../src/sections.js';

// The spike song's line structure (2026-11-03): one placeholder key per sung line, no lyric text. '' is an empty line.
const shape = [['a', 17.6], ['b', 30.9], ['c', 36.3], ['d', 44.9], ['e', 51.8], ['f', 59.4], ['g', 66.9], ['h', 73.7], ['i', 81.1], ['j', 86.5], ['k', 94.2], ['l', 101.0], ['m', 108.2], ['n', 128.2], ['o', 135.4], ['f', 144.8], ['p', 152.2], ['q', 159.1], ['i', 166.2], ['j', 172.1], ['r', 179.7], ['l', 186.4], ['m', 193.7], ['s', 210.8], ['', 219.2]];
const lines = list => list.map(([key, t]) => ({ t, key }));

test('the spike song gives its nine sections', () => {
  assert.deepEqual(computeSections(lines(shape), 243), [
    { t: 17.6, label: '노래 시작 · 1절', kind: 'start' }, { t: 59.4, label: '후렴 전', kind: 'pre' },
    { t: 81.1, label: '후렴 1', kind: 'chorus' }, { t: 115.2, label: '간주', kind: 'break' },
    { t: 128.2, label: '2절', kind: 'verse' }, { t: 144.8, label: '후렴 전', kind: 'pre' },
    { t: 166.2, label: '후렴 2', kind: 'chorus' }, { t: 200.7, label: '간주', kind: 'break' },
    { t: 210.8, label: '마무리', kind: 'verse' }]);
});

test('a song that opens on its chorus gets one button there', () => {
  assert.deepEqual(computeSections(lines([['x', 10], ['y', 15], ['z', 20], ['w', 25], ['x', 40], ['y', 45]]), 60),
    [{ t: 10, label: '노래 시작 · 후렴 1', kind: 'chorus' }, { t: 40, label: '후렴 2', kind: 'chorus' }]);
});

test('three choruses end on the last chorus', () => {
  assert.deepEqual(computeSections(lines([['s', 5], ['a', 10], ['b', 15], ['c', 20], ['a', 30], ['b', 35], ['d', 40], ['a', 50], ['b', 55]]), 70).map(x => x.label),
    ['노래 시작 · 1절', '후렴 1', '후렴 2', '마지막 후렴']);
});

test('no repeats gives verses after breaks, and empty input gives nothing', () => {
  assert.deepEqual(computeSections(lines([['a', 5], ['b', 10], ['c', 30], ['d', 35]]), 50),
    [{ t: 5, label: '노래 시작 · 1절', kind: 'start' }, { t: 17, label: '간주', kind: 'break' }, { t: 30, label: '2절', kind: 'verse' }]);
  assert.deepEqual(computeSections([], 100), []);
  assert.deepEqual(computeSections(lines([['', 5]]), 100), []);
  assert.deepEqual(computeSections(lines([['a', 5], ['b', 10], ['c', 30]]), 20).map(x => x.t), [5, 17]);
});

test('every section kind is one of the known kinds', () => {
  assert.deepEqual(SECTION_KINDS, ['start', 'verse', 'pre', 'chorus', 'break']);
  assert.ok(computeSections(lines(shape), 243).every(s => SECTION_KINDS.includes(s.kind)));
});
