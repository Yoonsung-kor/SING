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
  assert.match(songMediaSides(ui()), /data-id="mv" aria-pressed="true">원곡</);
  const song = songWith({ mv: mvEntry(), karaoke: { none: true, foundAt: when } });
  assert.equal(currentVideoId(song, 'mv'), MV);
  assert.equal(currentVideoId(song, 'karaoke'), null);
  const v = { state: { ...defaultState(), songs: [song] }, selectedSongId: song.id, songUi: ui() };
  assert.equal(count(songDetailView(v), 'id="song-player-slot"'), 1);
  const parts = songDetailParts(v);
  assert.ok(!parts.top.includes('song-player-slot') && !parts.rest.includes('song-player-slot'));
  assert.ok(parts.top.includes('>원곡<') && parts.rest.includes('내가 적어둔 곡 정보'));
  assert.equal(songDetailParts({ ...v, selectedSongId: 'nope' }), null);
  assert.ok(songDetailView({ state: { ...defaultState(), songs: [song] }, selectedSongId: song.id }).includes('song-detail-rest'));
});

// --- Lyrics view and the audio-first original side ---
const lyricLines = [{ t: 17.6, text: 'word-a' }, { t: 30.9, text: '<b>x</b>' }, { t: 59.4, text: '' }, { t: 81.1, text: 'word-c' }];
const twoSections = { duration: 243, items: [{ t: 17.6, label: '노래 시작 · 1절', kind: 'start' }, { t: 81.1, label: '후렴 1', kind: 'chorus' }], checkedAt: when };
const audioEntry = { videoId: 'izssDYTMXis', kind: 'audio', source: 'auto', foundAt: when, candidates: [{ videoId: 'izssDYTMXis', kind: 'audio' }] };

test('lyrics: two styles, the karaoke subtitle first, the full list centred with section titles', () => {
  const song = songWith({ mv: audioEntry, sections: twoSections });
  const html = songMediaBelow(song, ui(), lyricLines);
  assert.equal(count(html, 'data-action="media-lyrics-style"'), 2);
  assert.match(html, /data-id="karaoke" aria-pressed="true">노래방 자막형/);
  assert.match(html, /data-id="full" aria-pressed="false">전체 가사형/);
  assert.equal(count(html, 'class="lyric-line'), 3);
  const full = /<div class="lyrics-full"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(full && full[0].includes('hidden'), 'full list hidden in karaoke style');
  assert.equal(count(full[1], '<h3'), 2);
  assert.ok(/<div class="lyrics-karaoke"(?![^>]*hidden)/.test(html));
  assert.ok(html.includes('재생하면 가사가 흘러가요.'));
  assert.ok(html.includes('&lt;b&gt;x') && !html.includes('<b>x'));
  assert.ok(html.indexOf('lyrics-karaoke') < html.indexOf('media-timeline'));
  const fullStyle = songMediaBelow(song, ui({ lyricsStyle: 'full' }), lyricLines);
  assert.ok(/<div class="lyrics-karaoke"[^>]*hidden/.test(fullStyle) && !/<div class="lyrics-full"[^>]*hidden/.test(fullStyle));
  assert.ok(!html.includes('style="') && !fullStyle.includes('style="'));
});

test('lyrics status without lines: loading, none, busy', () => {
  const song = songWith({ mv: audioEntry });
  assert.ok(songMediaBelow(song, ui({ lyrics: 'loading' })).includes('가사를 불러오고 있어요…'));
  assert.ok(songMediaBelow(song, ui({ lyrics: 'none' })).includes('이 곡은 가사 시간 정보를 찾지 못했어요.'));
  const busy = songMediaBelow(song, ui({ lyrics: 'busy' }));
  assert.ok(busy.includes('가사를 불러오지 못했어요') && busy.includes('data-action="media-sections-retry"'));
});

test('the original side: audio needs no big alignment prompt, an MV stand-in says so', () => {
  const audio = songMediaBelow(songWith({ mv: audioEntry, sections: twoSections }), ui());
  assert.ok(audio.includes('음원이라 구간이 바로 맞아요 · ') && audio.includes('data-action="media-align"'));
  assert.ok(!audio.includes('첫 소절이 시작되는 순간'));
  const mv = songMediaBelow(songWith({ mv: mvEntry({ kind: 'mv' }), sections: twoSections }), ui());
  assert.ok(mv.includes('음원 영상이 없어서 뮤직비디오예요.') && mv.includes('첫 소절이 시작되는 순간 눌러 주세요'));
  assert.match(songMediaSides(ui()), /data-id="mv" aria-pressed="true">원곡</);
  assert.ok(!songMediaSides(ui()).includes('원곡 MV'));
});

test('audio line copy: before and after lining up again', () => {
  const plain = songMediaBelow(songWith({ mv: audioEntry, sections: twoSections }), ui());
  assert.ok(plain.includes('음원이라 구간이 바로 맞아요 · 어긋나 보이면 <button class="text-button" data-action="media-align">다시 맞추기</button>'));
  const aligned = songMediaBelow(songWith({ mv: audioEntry, sections: twoSections, starts: { izssDYTMXis: 1.2 } }), ui());
  assert.ok(aligned.includes('시작을 맞췄어요 · ') && !aligned.includes('바로 맞아요'));
});

test('the paste field lets links without https through to our own check', () => {
  const html = songMediaBelow(songWith({ mv: audioEntry }), ui({ panel: 'change' }));
  assert.ok(html.includes('id="media-link" name="link" type="text" inputmode="url"') && !html.includes('type="url"'));
});

test('without consent a playing video still says sections and lyrics need consent, once', () => {
  const withVideo = songMediaBelow(songWith({ mv: audioEntry }), ui({ consent: false }));
  assert.ok(withVideo.includes('구간과 가사를 보려면 동의가 필요해요'));
  assert.equal(count(withVideo, 'data-action="media-consent"'), 1);
  const noVideo = songMediaBelow(songWith({}), ui({ consent: false }));
  assert.equal(count(noVideo, 'data-action="media-consent"'), 1);
});

// --- Sing-along feedback ---
const reportOf = html => html.match(/<section class="surface practice-feedback sing-report">[\s\S]*?<\/section>/)?.[0] ?? '';
const singLines = [{ t: 17.6, text: 'word-a' }, { t: 30.9, text: '<i>word-b</i>' }, { t: 81.1, text: 'word-c' }];

test('sing-along: offered only with a video, sections and lyrics; the panel asks for earphones', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  assert.ok(songMediaBelow(ready, ui(), singLines).includes('data-action="media-sing-open"'));
  assert.ok(!songMediaBelow(ready, ui(), null).includes('media-sing-open'));
  assert.ok(!songMediaBelow(songWith({ sections: twoSections }), ui(), singLines).includes('media-sing-open'));
  const panel = songMediaBelow(ready, ui({ panel: 'sing' }), singLines);
  assert.ok(panel.includes('이어폰을 끼고 불러 주세요. 스피커 소리가 마이크로 들어가면 측정이 틀려져요.'));
  assert.match(panel, /data-action="media-sing-start"[^>]*>부르기 시작/);
  const singing = songMediaBelow(ready, ui({ panel: 'sing', singing: true }), singLines);
  assert.match(singing, /data-action="media-sing-stop"[^>]*>멈추고 피드백 받기/);
  assert.ok(!singing.includes('media-sing-start'));
});

test('sing-along report: section, the line (escaped) or its time, a jump button, and the plain states', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  const feedback = { good: [{ lineId: 0, text: '안정적이에요' }], improve: [{ lineId: 1, text: '<b>숨</b>이 끊겼어요' }], practice: [{ text: '허밍해요', link: 'practice' }] };
  const report = { status: 'done', feedback, starts: { 0: 17.6, 1: 30.9 } };
  const page = songMediaBelow(ready, ui({ singReport: report }), singLines);
  const html = reportOf(page);
  for (const text of ['잘한 점', '아쉬운 점', '추천 연습', '노래 시작 · 1절', 'word-a', '&lt;i&gt;word-b', '&lt;b&gt;숨', '안정적이에요']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<i>word-b') && !html.includes('<b>숨'));
  assert.match(html, /data-action="media-lyric" data-id="1"/);
  assert.ok(html.includes('여기로 가기'));
  const noLyrics = reportOf(songMediaBelow(ready, ui({ singReport: report }), null));
  assert.ok(noLyrics.includes('0:30') && !noLyrics.includes('word-b'));
  assert.ok(songMediaBelow(ready, ui({ singReport: { status: 'busy' } }), singLines).includes('피드백을 만들고 있어요…'));
  assert.ok(songMediaBelow(ready, ui({ singReport: { status: 'short' } }), singLines).includes('조금 더 불러 주세요. 가사 4줄 이상 부르면 피드백을 드릴게요.'));
  assert.ok(songMediaBelow(ready, ui({ singReport: { status: 'failed' } }), singLines).includes('지금은 피드백을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'));
  assert.ok(!page.includes('style="'));
});

test('sing-along: while measuring, the stop button stays even if another panel was opened', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  for (const panel of [null, 'pin', 'change']) {
    const html = songMediaBelow(ready, ui({ panel, singing: true }), singLines);
    assert.ok(html.includes('data-action="media-sing-stop"'), String(panel));
    assert.ok(!html.includes('data-action="media-sing-open"'), String(panel));
  }
});

test('sing-along report: when no line had a problem, it says so', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  const report = { status: 'done', feedback: { good: [{ lineId: 0, text: '안정적이에요' }], improve: [], practice: [] }, starts: { 0: 17.6 } };
  assert.match(reportOf(songMediaBelow(ready, ui({ singReport: report }), singLines)), /아쉬운 점<\/h3>[\s\S]*?이번엔 크게 아쉬운 점이 없었어요\./);
});

test('sing-along report: AI switched off says so; odd values from the server do not break the page', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  assert.ok(songMediaBelow(ready, ui({ singReport: { status: 'off' } }), singLines).includes('지금은 AI 피드백을 쓸 수 없어요.'));
  const report = { status: 'done', feedback: { good: [{ lineId: '1"><b', text: '좋아요' }], improve: [], practice: [{ text: '허밍해요', link: 'evil' }] }, starts: {} };
  const html = reportOf(songMediaBelow(ready, ui({ singReport: report }), singLines));
  assert.ok(html.includes('허밍해요') && !html.includes('"><b'));
});
