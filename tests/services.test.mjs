import assert from 'node:assert/strict';
import test from 'node:test';
import { createServices } from '../scripts/services.mjs';

const openAi = raw => async () => ({ ok: true, status: 200, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(raw), annotations: [] }] }] }) });
const quote = '최고음 : 진성 3옥타브 레(D5), 가성 3옥타브 파#(F#5)';
const claim = { found: true, chestHighest: 'D5', falsettoHighest: 'F#5', lowest: null, sourceUrl: 'https://example.org/song', sourceQuote: quote, vocal: 'female' };

test('lookupRange returns the checked range when the page backs the claim', async () => {
  const services = createServices({ apiKey: 'k', model: 'm', fetchImpl: openAi(claim), getPage: async () => `<p>${quote}</p>` });
  assert.deepEqual(await services.lookupRange({ title: '사건의 지평선', artist: '윤하' }),
    { highestMidi: 74, falsettoHighestMidi: 78, lowestMidi: null, sourceUrl: claim.sourceUrl, sourceQuote: quote, vocal: 'female' });
});

test('lookupRange returns null when the AI found nothing or the page is missing', async () => {
  const notFound = createServices({ apiKey: 'k', model: 'm', fetchImpl: openAi({ found: false }), getPage: async () => `<p>${quote}</p>` });
  assert.equal(await notFound.lookupRange({ title: 'x', artist: '' }), null);
  const noPage = createServices({ apiKey: 'k', model: 'm', fetchImpl: openAi(claim), getPage: async () => null });
  assert.equal(await noPage.lookupRange({ title: 'x', artist: '' }), null);
});

test('without a key the AI services are off', () => {
  const services = createServices({ apiKey: '', model: 'm' });
  assert.equal(services.lookupRange, null);
});

const pageFor = { 'https://example.org/c1': '<p>최고음 2옥타브 시(B4)</p>', 'https://example.org/c2': '<p>최고음 3옥타브 도(C5)</p>' };
const candidate = (i, claim = null, vocal = 'male') => ({ title: `후보${i}`, artist: `가수${i}`, reason: '리스트와 어울려요.', songUrl: `https://example.org/song${i}`, highest: claim, vocal });
const claimOf = (note, url, quote) => ({ chestHighest: note, falsettoHighest: null, lowest: null, sourceUrl: url, sourceQuote: quote });
const recBody = (voice, extra = {}) => ({ playlistName: '도전하기', songs: [], exclude: [], rejected: [], voice, ...extra });
function fakeOpenAi({ intent, items }) {
  const calls = { recommend: 0, range: 0 };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.text.format.name === 'song_range') { calls.range++; return openAi({ found: false })(); }
    calls.recommend++;
    return openAi({ intent, items })();
  };
  return { fetchImpl, calls };
}

test('recommend checks claims, looks up at most 4 missing ones for a range-aware list, and stays within 5 AI calls', async () => {
  const items = [candidate(1, claimOf('B4', 'https://example.org/c1', '최고음 2옥타브 시(B4)')), candidate(2, claimOf('C5', 'https://example.org/c2', '최고음 3옥타브 도(C5)')),
    ...[3, 4, 5, 6, 7, 8].map(i => candidate(i))];
  const { fetchImpl, calls } = fakeOpenAi({ intent: 'challenge', items });
  const services = createServices({ apiKey: 'k', model: 'm', fetchImpl, getPage: async url => pageFor[url] ?? null });
  const result = await services.recommend(recBody({ comfortableHighMidi: 69, voiceType: 'male' }));
  assert.deepEqual(calls, { recommend: 1, range: 4 });
  assert.equal(result.intent, 'challenge');
  assert.deepEqual(result.items.map(i => i.title), ['후보1', '후보2', '후보3']);
  assert.deepEqual(result.items[0].range, { highestMidi: 71, falsettoHighestMidi: null, lowestMidi: null, sourceUrl: 'https://example.org/c1', sourceQuote: '최고음 2옥타브 시(B4)' });
  assert.equal(result.items[2].range, null);
  assert.equal(result.fallback, false);
});

test('a list without a range intent skips the extra lookups', async () => {
  const { fetchImpl, calls } = fakeOpenAi({ intent: 'any', items: [1, 2, 3, 4].map(i => candidate(i)) });
  const services = createServices({ apiKey: 'k', model: 'm', fetchImpl, getPage: async () => null });
  const result = await services.recommend(recBody({ comfortableHighMidi: 69, voiceType: 'male' }));
  assert.deepEqual(calls, { recommend: 1, range: 0 });
  assert.equal(result.items.length, 3);
});

test('a source page that never answers leaves that song unchecked within the budget', async () => {
  const { fetchImpl } = fakeOpenAi({ intent: 'any', items: [candidate(1, claimOf('B4', 'https://example.org/c1', '최고음 2옥타브 시(B4)'))] });
  const services = createServices({ apiKey: 'k', model: 'm', fetchImpl, getPage: () => new Promise(() => {}), budgetMs: 50 });
  const started = Date.now();
  const result = await services.recommend(recBody(null));
  assert.ok(Date.now() - started < 2000);
  assert.equal(result.items[0].range, null);
});
