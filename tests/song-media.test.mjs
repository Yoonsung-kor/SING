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
  assert.equal(m({ mv: auto(A, at('10-05'), { kind: 'mv' }) }).mv, null);
  assert.deepEqual(m({ mv: auto(A, at('10-06'), { kind: 'mv' }) }).mv, auto(A, at('10-06'), { kind: 'mv' }));
  assert.equal(m({ karaoke: { none: true, foundAt: at('10-28') } }).karaoke, null);
  assert.deepEqual(m({ karaoke: { none: true, foundAt: at('10-29') } }).karaoke, { none: true, foundAt: at('10-29') });
  const pasted = { videoId: P, source: 'pasted', foundAt: at('01-01'), candidates: [{ videoId: P }] };
  assert.deepEqual(m({ mv: pasted }).mv, pasted);
  assert.equal(m({ sections: { none: true, checkedAt: at('10-28') } }).sections, null);
  assert.deepEqual(m({ sections: nine }).sections, nine);
  const fresh = { ...emptyMedia(), mv: auto(A, at('10-30'), { kind: 'audio' }), sections: nine };
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

import {
  startOf, isAligned, setStart, clearStart, toVideoTime, pinVideoTime, pinSongTime, addPin, removePin, currentSectionIndex,
  parseYoutubeLink, youtubeWatchUrl, youtubeSearchUrl, videoSearchQuery, tjVideoSearchUrl, formatTime,
} from '../src/song-media.js';
import { computeSections } from '../src/sections.js';

const MV = 'Dbxzh078jr4', KA = 'GWLLal-xbkc';
const withNine = () => ({ ...emptyMedia(), mv: auto(MV, at('11-01')), karaoke: auto(KA, at('11-01'), { kind: 'mr' }), sections: { duration: 243, items: [{ t: 17.6, label: '노래 시작 · 1절', kind: 'start' }, { t: 81.1, label: '후렴 1', kind: 'chorus' }], checkedAt: at('11-01') } });

test('the start offset maps song time to video time and never below zero', () => {
  const media = setStart(withNine(), MV, 40);
  assert.equal(media.starts[MV], 22.4);
  assert.equal(startOf(media, MV), 22.4);
  assert.equal(isAligned(media, MV), true);
  assert.equal(isAligned(media, KA), false);
  assert.equal(startOf(media, KA), 0);
  assert.equal(toVideoTime(media, MV, 81.1), 103.5);
  assert.equal(toVideoTime({ ...media, starts: { [MV]: -30 } }, MV, 10), 0);
  assert.equal(clearStart(media, MV).starts[MV], undefined);
  assert.equal(setStart({ ...emptyMedia(), mv: auto(MV, at('11-01')) }, MV, 40).starts[MV], undefined);
});

test('a pin made before lining up stays where the user marked it', () => {
  let media = addPin(withNine(), { videoId: MV, t: 50, text: ' 숨 ' }, 'p1');
  assert.deepEqual(media.pins, [{ id: 'p1', videoId: MV, t: 50, text: '숨' }]);
  media = setStart(media, MV, 40);
  const [pin] = media.pins;
  assert.equal(pinVideoTime(media, pin, MV), 50);
  media = { ...media, starts: { ...media.starts, [KA]: 5 } };
  assert.equal(pinVideoTime(media, pin, KA), 32.6);
  assert.equal(pinSongTime(media, pin), 27.6);
  assert.equal(removePin(media, 'p1').pins.length, 0);
  assert.equal(addPin(withNine(), { videoId: MV, t: 9999, text: 'x' }, 'p').pins[0].t, 3600);
});

test('pins need text, at most 60 characters and 50 per song', () => {
  assert.throws(() => addPin(withNine(), { videoId: MV, t: 1, text: '  ' }, 'p'), /메모 내용을 적어 주세요/);
  assert.throws(() => addPin(withNine(), { videoId: MV, t: 1, text: 'x'.repeat(61) }, 'p'), /60자/);
  const full = { ...withNine(), pins: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, videoId: MV, t: i, text: 'x' })) };
  assert.throws(() => addPin(full, { videoId: MV, t: 1, text: 'x' }, 'new'), /50개/);
});

test('setting a start forgets offsets of videos the song no longer uses', () => {
  const media = setStart({ ...withNine(), starts: { [KA]: 5, ZZZZZZZZZZZ: 9 }, pins: [{ id: 'p', videoId: 'YYYYYYYYYYY', t: 1, text: 'x' }] }, MV, 40);
  assert.deepEqual(Object.keys(media.starts).sort(), [KA, MV].sort());
  const kept = setStart({ ...withNine(), starts: { YYYYYYYYYYY: 2 }, pins: [{ id: 'p', videoId: 'YYYYYYYYYYY', t: 1, text: 'x' }] }, MV, 40);
  assert.equal(kept.starts.YYYYYYYYYYY, 2);
});

test('the current section is the last one that has begun', () => {
  const shape = [['a', 17.6], ['b', 30.9], ['c', 36.3], ['d', 44.9], ['e', 51.8], ['f', 59.4], ['g', 66.9], ['h', 73.7], ['i', 81.1], ['j', 86.5], ['k', 94.2], ['l', 101.0], ['m', 108.2], ['n', 128.2], ['o', 135.4], ['f', 144.8], ['p', 152.2], ['q', 159.1], ['i', 166.2], ['j', 172.1], ['r', 179.7], ['l', 186.4], ['m', 193.7], ['s', 210.8]];
  const items = computeSections(shape.map(([key, t]) => ({ t, key })), 243);
  assert.equal(currentSectionIndex(items, 58.9), 0);
  assert.equal(currentSectionIndex(items, 59.2), 1);
  assert.equal(currentSectionIndex(items, 5), -1);
});

test('YouTube links: four shapes in, everything else out', () => {
  for (const link of ['https://www.youtube.com/watch?v=Dbxzh078jr4', 'https://m.youtube.com/watch?v=Dbxzh078jr4&t=30s', 'https://youtu.be/Dbxzh078jr4?si=abc', 'https://www.youtube.com/shorts/Dbxzh078jr4', '  youtube.com/watch?v=Dbxzh078jr4 ']) {
    assert.equal(parseYoutubeLink(link), 'Dbxzh078jr4', link);
  }
  for (const link of ['https://www.youtube.com/watch?v=short', 'https://evil.com/watch?v=Dbxzh078jr4', 'https://www.youtube.com.evil.com/watch?v=Dbxzh078jr4', 'javascript:alert(1)', '', null]) {
    assert.equal(parseYoutubeLink(link), null, String(link));
  }
});

test('links out to YouTube and the time label', () => {
  assert.equal(youtubeWatchUrl(MV), 'https://www.youtube.com/watch?v=Dbxzh078jr4');
  const tj = new URL(tjVideoSearchUrl('너의 모든 순간', '성시경'));
  assert.equal(tj.origin + tj.pathname, 'https://www.youtube.com/channel/UCZUhx8ClCv6paFW7qi3qljg/search');
  assert.equal(tj.searchParams.get('query'), '너의 모든 순간 성시경');
  assert.equal(new URL(youtubeSearchUrl('a&b <c>')).searchParams.get('search_query'), 'a&b <c>');
  assert.equal(videoSearchQuery({ title: '너의 모든 순간', artist: '성시경' }, 'mv'), '성시경 너의 모든 순간');
  assert.equal(videoSearchQuery({ title: '너의 모든 순간', artist: '' }, 'karaoke'), '금영노래방 너의 모든 순간');
  assert.equal(formatTime(81.1), '1:21');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-3), '0:00');
});

import { canSetStart } from '../src/song-media.js';

test('the start can be set only while the shown video is playing or paused, never when only cued', () => {
  const ok = { videoId: MV, shownId: MV, time: 40, playerState: 1 };
  assert.equal(canSetStart(ok), true);
  assert.equal(canSetStart({ ...ok, playerState: 2 }), true);
  assert.equal(canSetStart({ ...ok, time: 0, playerState: 5 }), false);
  assert.equal(canSetStart({ ...ok, playerState: -1 }), false);
  assert.equal(canSetStart({ ...ok, playerState: null }), false);
  assert.equal(canSetStart({ ...ok, time: null }), false);
  assert.equal(canSetStart({ ...ok, shownId: KA }), false);
  assert.equal(canSetStart({ ...ok, videoId: null }), false);
});

test('the original side keeps whether it is the audio track or an MV', () => {
  const two = [{ videoId: A, kind: 'audio' }, { videoId: B, kind: 'mv' }];
  const media = withCandidates(emptyMedia(), 'mv', two, now);
  assert.deepEqual(media.mv, { videoId: A, kind: 'audio', source: 'auto', foundAt: now.toISOString(), candidates: two });
  validateMedia(media);
  assert.equal(dropCandidate(media, 'mv', A, now).mv.kind, 'mv');
  assert.equal(nextCandidate(media, 'mv').mv.kind, 'mv');
  assert.throws(() => validateMedia({ ...media, mv: { ...media.mv, kind: 'x' } }), /곡 영상 정보/);
  assert.throws(() => validateMedia({ ...media, mv: { ...media.mv, candidates: [{ videoId: A, kind: 'basic' }] } }), /곡 영상 정보/);
  assert.equal(withPasted(emptyMedia(), 'mv', P, now).mv.kind, undefined);
});

test('an original found before audio tracks existed is searched again; pasted ones stay', () => {
  const yesterday = at('11-03');
  assert.equal(expireMedia({ ...emptyMedia(), mv: auto(A, yesterday) }, now).mv, null);
  assert.deepEqual(expireMedia({ ...emptyMedia(), mv: auto(A, yesterday, { kind: 'mv' }) }, now).mv, auto(A, yesterday, { kind: 'mv' }));
  const pasted = { videoId: P, source: 'pasted', foundAt: yesterday, candidates: [{ videoId: P }] };
  assert.deepEqual(expireMedia({ ...emptyMedia(), mv: pasted }, now).mv, pasted);
});

test('lyric lines that arrive with sections are never stored', () => {
  const items = [{ t: 17.6, label: '노래 시작 · 1절', kind: 'start' }];
  const media = withSections(emptyMedia(), { duration: 243, sections: items, lines: [{ t: 17.6, text: 'word-a' }] }, now);
  assert.deepEqual(Object.keys(media.sections), ['duration', 'items', 'checkedAt']);
  assert.ok(!JSON.stringify(media).includes('word-'));
  assert.throws(() => validateMedia({ ...media, sections: { ...media.sections, lines: [{ t: 1, text: 'x' }] } }), /곡 영상 정보/);
});
