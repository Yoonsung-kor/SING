import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicAddress, makeCheckedLookup, fetchPageText, quoteOnPage, verifyHighest } from '../scripts/verify-source.mjs';

test('private, loopback, link-local, CGNAT and mapped addresses are not public', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:192.168.0.1'])
    assert.equal(isPublicAddress(a), false, a);
  for (const a of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isPublicAddress(a), true, a);
});

test('checked lookup refuses a host that resolves to a private address', async () => {
  const lookup = makeCheckedLookup((host, opts, cb) => cb(null, [{ address: '192.168.0.1', family: 4 }]));
  const error = await new Promise(resolve => lookup('router.example', { all: true }, err => resolve(err)));
  assert.equal(error.code, 'EPRIVATE');
});

test('page fetch follows up to three https redirects and refuses http, too many hops, non-text and errors', async () => {
  const routes = {
    'https://a.example/1': { status: 302, location: '/2' }, 'https://a.example/2': { status: 301, location: 'https://b.example/3' },
    'https://b.example/3': { status: 200, contentType: 'text/html; charset=utf-8', body: 'ok' },
  };
  const requestOnce = async url => routes[url] ?? { status: 404 };
  assert.equal(await fetchPageText('https://a.example/1', { requestOnce }), 'ok');
  assert.equal(await fetchPageText('https://x.example/', { requestOnce: async () => ({ status: 302, location: 'http://x.example/' }) }), null);
  let hop = 0;
  const loop = async () => ({ status: 302, location: `/r${++hop}` });
  assert.equal(await fetchPageText('https://x.example/', { requestOnce: loop }), null);
  assert.equal(await fetchPageText('https://x.example/', { requestOnce: async () => ({ status: 200, contentType: 'image/png', body: '' }) }), null);
});

test('quote must appear on the page after normalizing markup and spacing', () => {
  assert.equal(quoteOnPage('<p>최고음 : 진성 3옥타브&nbsp;레(D5),<br> 가성 3옥타브 파#(F#5)</p>', '최고음 : 진성 3옥타브 레(D5), 가성 3옥타브 파#(F#5)'), true);
  assert.equal(quoteOnPage('<p>다른 문장</p>', '최고음 3옥타브 레'), false);
  assert.equal(quoteOnPage('<p>짧음</p>', '짧음'), false);
});

const quote = '최고음 : 진성 3옥타브 레(D5), 가성 3옥타브 파#(F#5)';
const page = `<p>${quote}</p>`;
const claim = { chestHighest: 'D5', falsettoHighest: 'F#5', lowest: null, sourceUrl: 'https://example.org/s', sourceQuote: quote, vocal: 'female' };

test('a checked claim comes back as MIDI values', async () => {
  assert.deepEqual(await verifyHighest(claim, { getPage: async () => page }),
    { highestMidi: 74, falsettoHighestMidi: 78, lowestMidi: null, sourceUrl: claim.sourceUrl, sourceQuote: quote, vocal: 'female' });
});

test('octave slips, swapped voices, a claimed lower note, missing pages and missing quotes all fail', async () => {
  const getPage = async () => page;
  assert.equal(await verifyHighest({ ...claim, chestHighest: 'D4' }, { getPage }), null);
  assert.equal(await verifyHighest({ ...claim, chestHighest: 'F#5', falsettoHighest: 'D5' }, { getPage }), null);
  const lowHigh = '최저음 2옥 미(E4), 최고음 3옥 도(C5)';
  assert.equal(await verifyHighest({ ...claim, chestHighest: 'E4', falsettoHighest: null, sourceQuote: lowHigh }, { getPage: async () => `<p>${lowHigh}</p>` }), null);
  assert.equal(await verifyHighest(claim, { getPage: async () => null }), null);
  assert.equal(await verifyHighest(claim, { getPage: async () => '<p>nothing here at all</p>' }), null);
  assert.equal(await verifyHighest({ ...claim, sourceUrl: 'http://example.org/s' }, { getPage }), null);
});

test('a single unlabeled value is chest, a stated lowest is kept, unknown vocal becomes null', async () => {
  const q = '* 최고음: 2옥타브 시(B4) * 최저음: 0옥타브 파♯(F♯2)';
  assert.deepEqual(await verifyHighest({ chestHighest: 'B4', falsettoHighest: null, lowest: 'F#2', sourceUrl: 'https://example.org/t', sourceQuote: q, vocal: 'robot' }, { getPage: async () => q }),
    { highestMidi: 71, falsettoHighestMidi: null, lowestMidi: 42, sourceUrl: 'https://example.org/t', sourceQuote: q, vocal: null });
});
