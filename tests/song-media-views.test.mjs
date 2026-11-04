import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSongUi, songMediaSides, songMediaBelow, currentVideoId } from '../src/song-media-views.js';
import { songDetailView, songDetailParts } from '../src/song-views.js';
import { createSong } from '../src/songs.js';
import { emptyMedia } from '../src/song-media.js';
import { computeSections } from '../src/sections.js';
import { defaultState } from '../src/storage.js';

const shape = [['a', 17.6], ['b', 30.9], ['c', 36.3], ['d', 44.9], ['e', 51.8], ['f', 59.4], ['g', 66.9], ['h', 73.7], ['i', 81.1], ['j', 86.5], ['k', 94.2], ['l', 101.0], ['m', 108.2], ['n', 128.2], ['o', 135.4], ['f', 144.8], ['p', 152.2], ['q', 159.1], ['i', 166.2], ['j', 172.1], ['r', 179.7], ['l', 186.4], ['m', 193.7], ['s', 210.8]];
const items = computeSections(shape.map(([key, t]) => ({ t, key })), 243);
const MV = 'Dbxzh078jr4', KA = 'GWLLal-xbkc', OTHER = 'BBBBBBBBBBB';
const when = '2026-11-04T00:00:00.000Z';
const mvEntry = (extra = {}) => ({ videoId: MV, source: 'auto', foundAt: when, candidates: [{ videoId: MV }], ...extra });
const songWith = (media, fields = {}) => ({ ...createSong({ title: '너의 모든 순간', artist: '성시경', tjNumber: '38028', ...fields }), media: { ...emptyMedia(), ...media } });
const ui = (extra = {}) => ({ ...defaultSongUi(), consent: true, ...extra });
const count = (html, text) => html.split(text).length - 1;

test('found sections show nine buttons and a coloured timeline', () => {
  const html = songMediaBelow(songWith({ mv: mvEntry(), sections: { duration: 243, items, checkedAt: when } }), ui());
  assert.equal(count(html, 'data-action="media-section"'), 9);
  assert.ok(html.includes('노래 시작 · 1절'));
  assert.equal(count(html, '<rect class="seg chorus"'), 2);
  assert.ok(html.includes('id="media-head"'));
  assert.ok(html.includes('지금이 노래 시작'));
  const aligned = songMediaBelow(songWith({ mv: mvEntry(), sections: { duration: 243, items, checkedAt: when }, starts: { [MV]: 22.4 } }), ui());
  assert.ok(aligned.includes('시작을 맞췄어요') && aligned.includes('다시 맞추기') && !aligned.includes('지금이 노래 시작'));
});

test('without sections the screen says so and draws no timeline; busy offers a retry', () => {
  const none = songMediaBelow(songWith({ mv: mvEntry(), sections: { none: true, checkedAt: when } }), ui());
  assert.ok(none.includes('이 곡은 구간을 찾지 못했어요. 신경 쓰이는 곳은 메모로 표시해 보세요.'));
  assert.ok(!none.includes('media-timeline') && !none.includes('지금이 노래 시작'));
  assert.ok(songMediaBelow(songWith({}), ui({ sections: 'busy' })).includes('data-action="media-sections-retry"'));
  assert.ok(songMediaBelow(songWith({}), ui({ sections: 'loading' })).includes('구간을 찾고 있어요…'));
});

test('without consent and video the screen asks first and still allows pasting', () => {
  const html = songMediaBelow(songWith({}), ui({ consent: false }));
  assert.ok(html.includes('영상과 구간을 자동으로 찾으려면 동의가 필요해요'));
  assert.ok(html.includes('data-action="media-consent"') && html.includes('링크 붙여넣기'));
});

test('status lines: melody-removed, quota, not configured, nothing found, player errors', () => {
  const ka = { videoId: KA, kind: 'mr', source: 'auto', foundAt: when, candidates: [{ videoId: KA, kind: 'mr' }] };
  assert.ok(songMediaBelow(songWith({ karaoke: ka }), ui({ side: 'karaoke' })).includes('기본 버전을 찾지 못해서 멜로디 제거 버전이에요.'));
  assert.ok(!songMediaBelow(songWith({ karaoke: ka }), ui({ side: 'mv' })).includes('멜로디 제거 버전이에요'));
  assert.ok(songMediaBelow(songWith({}), ui({ videos: { mv: 'quota', karaoke: 'idle' } })).includes('오늘은 영상 자동 찾기를 더 할 수 없어요. 링크를 붙여 넣거나 내일 다시 열어 주세요.'));
  assert.ok(songMediaBelow(songWith({}), ui({ videos: { mv: 'not-configured', karaoke: 'idle' } })).includes('영상 자동 찾기가 꺼져 있어요. 유튜브 링크를 붙여 넣어 주세요.'));
  assert.ok(songMediaBelow(songWith({}), ui({ videos: { mv: 'failed', karaoke: 'idle' } })).includes('영상을 찾지 못했어요. 잠시 후 다시 열어 주세요.'));
  assert.ok(songMediaBelow(songWith({}), ui({ videos: { mv: 'loading', karaoke: 'idle' } })).includes('영상을 찾고 있어요…'));
  const nothing = songMediaBelow(songWith({ mv: { none: true, foundAt: when } }), ui());
  assert.ok(nothing.includes('이 곡은 앱 안에서 볼 수 있는 영상을 찾지 못했어요') && nothing.includes('유튜브에서 찾아보기 ↗') && nothing.includes('search_query='));
  const blocked = songMediaBelow(songWith({}), ui({ playerError: { code: 150, videoId: OTHER } }));
  assert.ok(blocked.includes('이 영상은 앱 안에서 재생이 막혀 있어요') && blocked.includes(`watch?v=${OTHER}`));
  assert.ok(songMediaBelow(songWith({}), ui({ playerError: { code: 100, videoId: OTHER } })).includes('영상이 지워졌거나 비공개예요'));
  assert.ok(songMediaBelow(songWith({}), ui({ playerError: { code: 5, videoId: OTHER } })).includes('영상을 재생하지 못했어요'));
});

test('the change panel offers another candidate only when there is one', () => {
  const two = mvEntry({ candidates: [{ videoId: MV }, { videoId: OTHER }] });
  assert.ok(songMediaBelow(songWith({ mv: two }), ui({ panel: 'change' })).includes('data-action="media-next"'));
  const one = songMediaBelow(songWith({ mv: mvEntry() }), ui({ panel: 'change', pasteError: '유튜브 영상 링크를 붙여 넣어 주세요' }));
  assert.ok(!one.includes('data-action="media-next"') && one.includes('id="media-paste-form"') && one.includes('유튜브 영상 링크를 붙여 넣어 주세요'));
  assert.ok(!songMediaBelow(songWith({ mv: two }), ui()).includes('id="media-paste-form"'));
});

test('the change panel always offers a YouTube search for this song and side', () => {
  const panel = songMediaBelow(songWith({ mv: mvEntry() }), ui({ panel: 'change' }));
  const link = /<div class="media-change">[\s\S]*?href="([^"]+)"[^>]*>유튜브에서 찾아보기 ↗/.exec(panel);
  assert.ok(link, 'search link inside the change panel');
  assert.equal(new URL(link[1].replace(/&amp;/g, '&')).searchParams.get('search_query'), '성시경 너의 모든 순간');
  const karaoke = songMediaBelow(songWith({}), ui({ side: 'karaoke', panel: 'change' }));
  assert.ok(/<div class="media-change">[\s\S]*search_query=%EA%B8%88%EC%98%81/.test(karaoke));
});

test('pins are listed by time in the current video and their text is escaped', () => {
  const pins = [{ id: 'p3', videoId: MV, t: 90, text: '셋' }, { id: 'p1', videoId: MV, t: 10, text: '<b>하나</b>' }, { id: 'p2', videoId: MV, t: 50, text: '둘' }];
  const html = songMediaBelow(songWith({ mv: mvEntry(), pins }), ui({ panel: 'pin' }));
  assert.ok(html.indexOf('data-pin-id="p1"') < html.indexOf('data-pin-id="p2"') && html.indexOf('data-pin-id="p2"') < html.indexOf('data-pin-id="p3"'));
  assert.ok(html.includes('&lt;b&gt;하나') && !html.includes('<b>하나'));
  assert.ok(html.includes('id="media-pin-form"') && html.includes('maxlength="60"'));
  assert.ok(songMediaBelow(songWith({ mv: mvEntry() }), ui()).includes('아직 메모가 없어요. 신경 쓰이는 곳에서 눌러 남겨요.'));
  assert.ok(!songMediaBelow(songWith({}), ui()).includes('data-action="media-pin-open"'));
});

test('the TJ card searches YouTube for the TJ video with the number, and nothing uses inline styles', () => {
  const evil = songWith({ mv: mvEntry(), sections: { duration: 243, items, checkedAt: when }, pins: [{ id: 'p', videoId: MV, t: 1, text: 'x' }] }, { title: '"><script>x</script>' });
  const html = songMediaBelow(evil, ui({ panel: 'pin' }));
  assert.ok(html.includes('TJ 노래방 영상 보기 ↗') && html.includes('유튜브에서 열려요 · TJ 38028') && html.includes('/channel/UCZUhx8ClCv6paFW7qi3qljg/search?query='));
  assert.ok(!html.includes('<script'));
  for (const view of [html, songMediaBelow(songWith({}), ui({ consent: false })), songMediaSides(ui())]) assert.ok(!view.includes('style="'));
});

test('side buttons, current video, and a player slot outside the redrawn parts', () => {
  assert.match(songMediaSides(ui({ side: 'karaoke' })), /data-id="karaoke" aria-pressed="true">노래방/);
  assert.match(songMediaSides(ui()), /data-id="mv" aria-pressed="true">원곡 MV/);
  const song = songWith({ mv: mvEntry(), karaoke: { none: true, foundAt: when } });
  assert.equal(currentVideoId(song, 'mv'), MV);
  assert.equal(currentVideoId(song, 'karaoke'), null);
  const v = { state: { ...defaultState(), songs: [song] }, selectedSongId: song.id, songUi: ui() };
  assert.equal(count(songDetailView(v), 'id="song-player-slot"'), 1);
  const parts = songDetailParts(v);
  assert.ok(!parts.top.includes('song-player-slot') && !parts.rest.includes('song-player-slot'));
  assert.ok(parts.top.includes('원곡 MV') && parts.rest.includes('내가 적어둔 곡 정보'));
  assert.equal(songDetailParts({ ...v, selectedSongId: 'nope' }), null);
  assert.ok(songDetailView({ state: { ...defaultState(), songs: [song] }, selectedSongId: song.id }).includes('song-detail-rest'));
});
