import assert from 'node:assert/strict';
import test from 'node:test';
import { toSearchResults, createSearcher } from '../scripts/musicbrainz.mjs';

const credit = name => [{ name, joinphrase: '' }];

test('search results drop instrumental, MR and skit versions and merge duplicates', () => {
  const json = { recordings: [
    { title: '취중고백', 'artist-credit': credit('김민석') }, { title: '취중고백 (Inst.)', 'artist-credit': credit('김민석') },
    { title: '취중고백', 'artist-credit': credit('김민석') }, { title: '#4 소주한잔 (skit)', 'artist-credit': credit('Cloudancer') },
    { title: '응급실 (MR)', 'artist-credit': credit('izi') }, { title: '응급실', 'artist-credit': credit('Izi') } ] };
  assert.deepEqual(toSearchResults(json), [{ title: '취중고백', artist: '김민석' }, { title: '응급실', artist: 'Izi' }]);
});

test('a song whose title merely starts with Mr is kept, joined credits read naturally, and results stop at 8', () => {
  const json = { recordings: [
    { title: 'Mr. Chu', 'artist-credit': credit('Apink') },
    { title: '썸', 'artist-credit': [{ name: '소유', joinphrase: ' & ' }, { name: '정기고', joinphrase: '' }] },
    ...Array.from({ length: 10 }, (_, i) => ({ title: `곡${i}`, 'artist-credit': credit('가수') })),
  ] };
  const results = toSearchResults(json);
  assert.deepEqual(results.slice(0, 2), [{ title: 'Mr. Chu', artist: 'Apink' }, { title: '썸', artist: '소유 & 정기고' }]);
  assert.equal(results.length, 8);
});

test('searcher spaces requests a second apart, identifies itself and drops superseded queries', async () => {
  let clock = 0;
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, at: clock, ua: init.headers['User-Agent'] }); return { ok: true, status: 200, json: async () => ({ recordings: [] }) }; };
  const search = createSearcher({ fetchImpl, now: () => clock, sleep: async ms => { clock += ms; } });
  const [, b] = await Promise.all([search('밤편지'), search('취중'), search('취중고백')]);
  assert.deepEqual(b, []);
  assert.deepEqual(sent.map(s => decodeURIComponent(s.url.split('query=')[1])), ['밤편지', '취중고백']);
  assert.ok(sent[1].at - sent[0].at >= 1000);
  assert.equal(sent[0].ua, 'SING/0.1 (class project; https://github.com/Yoonsung-kor/SING)');
});

test('a failed MusicBrainz answer becomes an error', async () => {
  const search = createSearcher({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }), now: () => 0, sleep: async () => {} });
  await assert.rejects(search('밤편지'));
});
