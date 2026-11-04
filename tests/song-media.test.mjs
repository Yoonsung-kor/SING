import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyMedia, readMedia, validateMedia, expireMedia, mediaNeeds, withCandidates, dropCandidate, nextCandidate,
  hasOtherCandidates, withPasted, withSections, withNoTiming, clearAutoMedia, sameSongQuery,
} from '../src/song-media.js';

const now = new Date('2026-11-04T00:00:00.000Z');
const at = day => `2026-${day}T00:00:00.000Z`;
const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB', C = 'CCCCCCCCCCC', P = 'PPPPPPPPPPP';
const auto = (videoId, foundAt, extra = {}) => ({ videoId, source: 'auto', foundAt, candidates: [{ videoId }], ...extra });
const nine = { duration: 243, items: [{ t: 17.6, label: '노래 시작 · 1절', kind: 'start' }], checkedAt: at('01-01') };

test('a song without media reads as empty media, and empty media is valid', () => {
  assert.deepEqual(readMedia({ title: 'x' }), { mv: null, karaoke: null, sections: null, starts: {}, pins: [] });
  assert.deepEqual(emptyMedia(), readMedia({}));
  validateMedia(emptyMedia());
  assert.deepEqual(mediaNeeds(emptyMedia()), { mv: true, karaoke: true, sections: true });
});

test('auto videos expire after 30 days, none after 7, pasted videos and found sections never', () => {
  const m = media => expireMedia({ ...emptyMedia(), ...media }, now);
  assert.equal(m({ mv: auto(A, at('10-05')) }).mv, null);
  assert.deepEqual(m({ mv: auto(A, at('10-06')) }).mv, auto(A, at('10-06')));
  assert.equal(m({ karaoke: { none: true, foundAt: at('10-28') } }).karaoke, null);
  assert.deepEqual(m({ karaoke: { none: true, foundAt: at('10-29') } }).karaoke, { none: true, foundAt: at('10-29') });
  const pasted = { videoId: P, source: 'pasted', foundAt: at('01-01'), candidates: [{ videoId: P }] };
  assert.deepEqual(m({ mv: pasted }).mv, pasted);
  assert.equal(m({ sections: { none: true, checkedAt: at('10-28') } }).sections, null);
  assert.deepEqual(m({ sections: nine }).sections, nine);
  const fresh = { ...emptyMedia(), mv: auto(A, at('10-30')), sections: nine };
  assert.equal(expireMedia(fresh, now), fresh);
  assert.deepEqual(mediaNeeds(fresh), { mv: false, karaoke: true, sections: false });
});

test('candidates: first one plays, a blocked one is dropped, and none are left at the end', () => {
  const two = [{ videoId: B, kind: 'basic' }, { videoId: C, kind: 'mr' }];
  const first = withCandidates(emptyMedia(), 'karaoke', two, now);
  assert.deepEqual(first.karaoke, { videoId: B, kind: 'basic', source: 'auto', foundAt: now.toISOString(), candidates: two });
  const second = dropCandidate(first, 'karaoke', B, now);
  assert.deepEqual(second.karaoke, { videoId: C, kind: 'mr', source: 'auto', foundAt: now.toISOString(), candidates: [{ videoId: C, kind: 'mr' }] });
  assert.deepEqual(dropCandidate(second, 'karaoke', C, now).karaoke, { none: true, foundAt: now.toISOString() });
  assert.deepEqual(withCandidates(emptyMedia(), 'mv', [], now).mv, { none: true, foundAt: now.toISOString() });
  assert.equal(first.mv, null);
});

test('other candidates cycle and wrap; a pasted video that fails clears its side', () => {
  let media = withCandidates(emptyMedia(), 'mv', [{ videoId: A }, { videoId: B }, { videoId: C }], now);
  assert.equal(hasOtherCandidates(media.mv), true);
  const seen = [];
  for (let i = 0; i < 3; i++) { media = nextCandidate(media, 'mv'); seen.push(media.mv.videoId); }
  assert.deepEqual(seen, [B, C, A]);
  const pasted = withPasted(emptyMedia(), 'karaoke', P, now);
  assert.deepEqual(pasted.karaoke, { videoId: P, kind: 'unknown', source: 'pasted', foundAt: now.toISOString(), candidates: [{ videoId: P }] });
  assert.equal(hasOtherCandidates(pasted.karaoke), false);
  assert.equal(withPasted(emptyMedia(), 'mv', P, now).mv.kind, undefined);
  assert.equal(dropCandidate(pasted, 'karaoke', P, now).karaoke, null);
});

test('section results are stored as found or as none', () => {
  const found = withSections(emptyMedia(), { duration: 243, sections: nine.items }, now);
  assert.deepEqual(found.sections, { duration: 243, items: nine.items, checkedAt: now.toISOString() });
  assert.deepEqual(withNoTiming(emptyMedia(), now).sections, { none: true, checkedAt: now.toISOString() });
});

test('a renamed song drops what was found for the old name but keeps what the user made', () => {
  const pin = { id: 'p1', videoId: P, t: 12, text: '숨' };
  const media = { mv: auto(A, at('10-30')), karaoke: { videoId: P, source: 'pasted', foundAt: at('10-30'), candidates: [{ videoId: P }], kind: 'unknown' }, sections: nine, starts: { [P]: 3 }, pins: [pin] };
  const cleared = clearAutoMedia(media);
  assert.equal(cleared.mv, null);
  assert.deepEqual(cleared.karaoke, media.karaoke);
  assert.equal(cleared.sections, null);
  assert.deepEqual(cleared.starts, media.starts);
  assert.deepEqual(cleared.pins, media.pins);
  assert.equal(clearAutoMedia({ ...emptyMedia(), mv: { none: true, foundAt: at('10-30') } }).mv, null);
});

test('a late answer is kept only when the song still has the asked title and artist', () => {
  const song = { title: '너의 모든 순간', artist: '성시경' };
  assert.equal(sameSongQuery(song, { title: '너의 모든 순간', artist: '성시경' }), true);
  assert.equal(sameSongQuery(song, { title: '너의 모든 순간', artist: '아이유' }), false);
  assert.equal(sameSongQuery(undefined, { title: '너의 모든 순간', artist: '성시경' }), false);
});

test('broken media is rejected', () => {
  const bad = [
    { ...emptyMedia(), mv: auto('<script>xxx', at('10-30')) },
    { ...emptyMedia(), pins: Array.from({ length: 51 }, (_, i) => ({ id: `p${i}`, videoId: A, t: i, text: 'x' })) },
    { ...emptyMedia(), pins: [{ id: 'p', videoId: A, t: 1, text: 'x'.repeat(61) }] },
    { ...emptyMedia(), sections: { duration: 243, items: [{ t: 1, label: '1절', kind: 'x' }], checkedAt: at('10-30') } },
    { ...emptyMedia(), starts: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`${String(i).padStart(2, '0')}AAAAAAAAA`, 1])) },
    { ...emptyMedia(), mv: { ...auto(A, at('10-30')), candidates: [A, B, C, P].map(videoId => ({ videoId })) } },
    { ...emptyMedia(), mv: auto(A, 'yesterday') },
    { ...emptyMedia(), pins: [{ id: 'p', videoId: A, t: 3601, text: 'x' }] },
    { ...emptyMedia(), extra: 1 },
    null,
  ];
  for (const media of bad) assert.throws(() => validateMedia(media), /곡 영상 정보가 올바르지 않아요/, JSON.stringify(media)?.slice(0, 80));
});
