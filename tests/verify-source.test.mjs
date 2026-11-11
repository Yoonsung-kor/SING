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

test('a chest note above A5 is treated as an octave mix-up in the source, while falsetto may go higher', async () => {
  // Seen with a real key: a blog wrote "4옥 도" for 밤편지 (really about 3옥 도); quote and reader agreed, the source was an octave off.
  const blog = '최고음은 4옥 도';
  assert.equal(await verifyHighest({ chestHighest: 'C6', falsettoHighest: null, lowest: null, sourceUrl: 'https://example.org/b', sourceQuote: blog, vocal: 'female' }, { getPage: async () => blog }), null);
  const high = '진성 3옥 라(A5), 가성 4옥 도(C6)';
  assert.deepEqual((await verifyHighest({ chestHighest: 'A5', falsettoHighest: 'C6', lowest: null, sourceUrl: 'https://example.org/h', sourceQuote: high, vocal: 'female' }, { getPage: async () => high }))?.falsettoHighestMidi, 84);
});

test('a male chest note above F5 is a score written an octave up, so it is not confirmed', async () => {
  // Seen with a real key: a sheet-music page listed 끝사랑 (김범수) as "음역대 E3 A5", the octave-up way scores write men's songs.
  const check = (chestHighest, sourceQuote, vocal) => verifyHighest(
    { chestHighest, falsettoHighest: null, lowest: null, sourceUrl: 'https://example.org/m', sourceQuote, vocal }, { getPage: async () => sourceQuote });
  assert.equal(await check('A5', '음역대 E3 A5', 'male'), null);
  assert.equal(await check('F#5', '최고음 3옥 파#', 'male'), null);
  assert.equal((await check('F5', '최고음 3옥 파', 'male'))?.highestMidi, 77);
  assert.equal((await check('A5', '음역대 E3 A5', 'female'))?.highestMidi, 81, 'female voices keep the A5 ceiling');
  assert.equal((await check('A5', '음역대 E3 A5', 'mixed'))?.highestMidi, 81, 'a duet may have a female part');
});

test('a single unlabeled value is chest, a stated lowest is kept, unknown vocal becomes null', async () => {
  const q = '* 최고음: 2옥타브 시(B4) * 최저음: 0옥타브 파♯(F♯2)';
  assert.deepEqual(await verifyHighest({ chestHighest: 'B4', falsettoHighest: null, lowest: 'F#2', sourceUrl: 'https://example.org/t', sourceQuote: q, vocal: 'robot' }, { getPage: async () => q }),
    { highestMidi: 71, falsettoHighestMidi: null, lowestMidi: 42, sourceUrl: 'https://example.org/t', sourceQuote: q, vocal: null });
});

test('final #1: IP-literal hosts on private networks are refused before any request, including after a redirect', async () => {
  const calls = [];
  const requestOnce = async url => { calls.push(url); return url === 'https://ok.example/' ? { status: 302, location: 'https://192.168.0.1/admin' } : { status: 200, contentType: 'text/html', body: 'x' }; };
  for (const url of ['https://127.0.0.1/x', 'https://2130706433/x', 'https://[::1]/x', 'https://[::ffff:192.168.0.1]/x', 'https://10.0.0.1/x']) {
    assert.equal(await fetchPageText(url, { requestOnce }), null, url);
  }
  assert.deepEqual(calls, []);
  assert.equal(await fetchPageText('https://ok.example/', { requestOnce }), null);
  assert.deepEqual(calls, ['https://ok.example/']);
});

test('final #12: only 192.0.0.0/24 and 192.0.2.0/24 are reserved; WordPress.com addresses are public', () => {
  assert.equal(isPublicAddress('192.0.78.9'), true);
  assert.equal(isPublicAddress('192.0.0.8'), false);
  assert.equal(isPublicAddress('192.0.2.1'), false);
});

test('final #2: a sharp added by the AI is not on a page that has none', () => {
  assert.equal(quoteOnPage('<p>최고음 3옥타브 레(D5)</p>', '최고음 3옥타브 레#(D#5)'), false);
  assert.equal(quoteOnPage('<p>최고음 3옥타브 파♯(F♯5)</p>', '최고음 3옥타브 파#(F#5)'), true);
});

test('final #3: when the quote labels a falsetto note, a claim without falsetto is not accepted', async () => {
  const q = '진성 2옥 시(B4), 가성 3옥 레(D5)';
  const base = { lowest: null, sourceUrl: 'https://example.org/f', sourceQuote: q, vocal: 'male' };
  assert.equal(await verifyHighest({ ...base, chestHighest: 'D5', falsettoHighest: null }, { getPage: async () => q }), null);
  assert.equal((await verifyHighest({ ...base, chestHighest: 'B4', falsettoHighest: 'D5' }, { getPage: async () => q }))?.highestMidi, 71);
});
