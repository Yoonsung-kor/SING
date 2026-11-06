import assert from 'node:assert/strict';
import test from 'node:test';
import { COLUMNS, columnIndexFor, pastColumns } from '../src/columns.js';

test('today\'s column: the first on the first day, one more each day, round again after the last', () => {
  assert.equal(columnIndexFor(null, '2026-11-07', 5), 0);
  assert.equal(columnIndexFor('2026-11-07', '2026-11-07', 5), 0);
  assert.equal(columnIndexFor('2026-11-07', '2026-11-10', 5), 3);
  assert.equal(columnIndexFor('2026-11-07', '2026-11-12', 5), 0);
  assert.equal(columnIndexFor('2026-10-31', '2026-11-02', 5), 2, 'across months');
  assert.equal(columnIndexFor('2026-11-09', '2026-11-07', 5), 0, 'a start in the future (clock moved back) shows the first');
});

test('past columns: the ones already shown, newest first; all the others once a round is done', () => {
  const ids = list => list.map(column => column.id);
  assert.deepEqual(ids(pastColumns('2026-11-07', '2026-11-07')), []);
  assert.deepEqual(ids(pastColumns('2026-11-07', '2026-11-09')), [COLUMNS[1].id, COLUMNS[0].id]);
  assert.equal(pastColumns('2026-01-01', '2026-11-07').length, COLUMNS.length - 1);
  assert.ok(!pastColumns('2026-01-01', '2026-11-07').includes(COLUMNS[columnIndexFor('2026-01-01', '2026-11-07')]), 'today\'s is not in the list');
});

test('every column is short, sourced, and says to stop when it asks you to make a sound', () => {
  const ids = new Set();
  for (const column of COLUMNS) {
    assert.ok(!ids.has(column.id), `duplicate ${column.id}`);
    ids.add(column.id);
    assert.ok(column.title && column.lead && column.blocks.length, column.id);
    assert.ok(column.blocks.every(block => ['p', 'h', 'point', 'hint', 'note'].includes(block.type) && block.text), column.id);
    assert.ok(column.sources.length && column.sources.every(s => s.label && (/^https:\/\//.test(s.url) || s.url.startsWith('/assets/'))), column.id);
    const text = [column.title, column.subtitle ?? '', column.lead, ...column.blocks.flatMap(block => [block.title ?? '', block.text])].join(' ');
    if (column.tryIt) assert.match(text, /멈춰요/, `${column.id} asks for a sound`);
    assert.ok(text.length <= 700, `${column.id} is ${text.length} characters`);
  }
  assert.equal(COLUMNS[0].id, 'start');
  assert.ok(COLUMNS.length >= 14, `${COLUMNS.length} columns`);
});
