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
