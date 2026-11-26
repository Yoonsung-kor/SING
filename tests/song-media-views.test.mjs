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

test('sing-along: offered whenever a video is shown (the report needs no lyrics); the panel asks for earphones', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  assert.ok(songMediaBelow(ready, ui(), singLines).includes('data-action="media-sing-open"'));
  assert.ok(songMediaBelow(ready, ui(), null).includes('media-sing-open'), 'no lyrics loaded (no consent)');
  assert.ok(songMediaBelow(songWith({ mv: audioEntry }), ui(), null).includes('media-sing-open'), 'no sections either');
  assert.ok(!songMediaBelow(songWith({ sections: twoSections }), ui(), singLines).includes('media-sing-open'));
  const panel = songMediaBelow(ready, ui({ panel: 'sing' }), singLines);
  assert.ok(panel.includes('이어폰을 끼고 불러 주세요. 스피커 소리가 마이크로 들어가면 측정이 틀려져요.'));
  assert.match(panel, /data-action="media-sing-start"[^>]*>부르기 시작/);
  const singing = songMediaBelow(ready, ui({ panel: 'sing', singing: true }), singLines);
  assert.match(singing, /data-action="media-sing-stop"[^>]*>멈추고 리포트 받기/);
  assert.match(songMediaBelow(ready, ui(), singLines), /data-action="media-sing-open"[^>]*>따라 부르고 리포트 받기/);
  assert.ok(!singing.includes('media-sing-start'));
});

test('sing-along: while measuring, the stop button stays even if another panel was opened', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  for (const panel of [null, 'pin', 'change']) {
    const html = songMediaBelow(ready, ui({ panel, singing: true }), singLines);
    assert.ok(html.includes('data-action="media-sing-stop"'), String(panel));
    assert.ok(!html.includes('data-action="media-sing-open"'), String(panel));
  }
});

// --- The report of demanding spots ---
const spotOf = (id, kind, outcome, extra = {}) => ({ id, kind, outcome, time: 40, end: 41, lineId: null, section: '', from: kind === 'leap' ? '1옥 도' : null, to: '2옥 라', over: null, repeated: false, ...extra });
const spotsReport = (spots, extra = {}) => ({ status: 'spots', result: { status: 'ok', voicedSeconds: 60, spots }, words: Object.fromEntries(spots.map(spot => [spot.id, `${spot.id} 문장`])), polish: 'idle', answers: {}, ...extra });
const spotsPage = (report, extra = {}) => reportOf(songMediaBelow(songWith({ mv: audioEntry, sections: twoSections }), ui({ consent: true, singReport: report, ...extra }), singLines));

test('spots report: each spot says where, how it went, what to try, and can be heard again', () => {
  const html = spotsPage(spotsReport([
    spotOf('s1', 'leap', 'sag', { time: 17.6, lineId: 0, section: '노래 시작 · 1절' }),
    spotOf('s2', 'high-hold', 'kept', { time: 50 }),
    spotOf('s3', 'leap', null, { time: 81.1, lineId: 2 }),
  ]));
  for (const text of ['따라 부르기 리포트', '이 노래의 어려운 자리', 's1 문장', 's2 문장', 's3 문장', '음이 내려왔어요', '잘 넘겼어요', '노래 시작 · 1절', 'word-a', 'word-c', '빨대로 미끄러지듯 오르내리기', '끊지 말고 미끄러지듯 넘어가기', '알아두기에서 읽기']) assert.ok(html.includes(text), text);
  assert.equal(count(html, '이렇게 연습해 봐요'), 2, 'no exercise for the spot that went well');
  assert.ok(!html.includes('립트릴'));
  assert.equal(count(html, 'data-action="media-spot"'), 3);
  assert.match(html, /data-action="media-spot" data-id="17.6"[^>]*>이 자리 다시 듣기/);
  assert.match(html, /data-action="spot-column" data-id="straw"/);
  assert.ok(html.includes('0:50'), 'a spot with no lyric line shows its time');
  assert.ok(!html.includes('style="'));
});

test('spots report: a break is asked about first, and only a yes brings its exercise', () => {
  const ask = [spotOf('s1', 'high-hold', 'ask')];
  const before = spotsPage(spotsReport(ask));
  assert.ok(before.includes('확인해 볼 자리'));
  assert.match(before, /data-action="media-ask-yes" data-id="s1"[^>]*>네, 그랬어요/);
  assert.match(before, /data-action="media-ask-no" data-id="s1"[^>]*>아니요/);
  assert.ok(!before.includes('이렇게 연습해 봐요'));
  const yes = spotsPage(spotsReport(ask, { answers: { s1: 'yes' } }));
  assert.ok(yes.includes('이렇게 연습해 봐요') && !yes.includes('media-ask-yes'));
  const no = spotsPage(spotsReport(ask, { answers: { s1: 'no' } }));
  assert.ok(!no.includes('s1 문장'));
});

test('spots report: all went well, nothing found, and the AI touches', () => {
  assert.ok(spotsPage(spotsReport([spotOf('s1', 'high-hold', 'kept'), spotOf('s2', 'leap', 'kept', { time: 60 })])).includes('어려운 자리를 모두 잘 넘겼어요.'));
  assert.ok(!spotsPage(spotsReport([spotOf('s1', 'high-hold', 'kept'), spotOf('s2', 'leap', 'sag', { time: 60 })])).includes('모두 잘 넘겼어요'));
  assert.ok(spotsPage(spotsReport([])).includes('이번에는 크게 올라가거나 높이 올라가는 자리를 찾지 못했어요.'));
  assert.ok(spotsPage(spotsReport([spotOf('s1', 'leap', 'sag')], { polish: 'busy' })).includes('설명을 다듬고 있어요…'));
  const noConsent = spotsPage(spotsReport([spotOf('s1', 'leap', 'sag')]), { consent: false });
  assert.match(noConsent, /data-action="media-polish"[^>]*>AI로 설명 다듬기/);
  assert.ok(!spotsPage(spotsReport([spotOf('s1', 'leap', 'sag')])).includes('media-polish'), 'with consent the AI is asked by itself');
  assert.ok(!spotsPage(spotsReport([]), { consent: false }).includes('media-polish'), 'nothing to polish');
});

test('sing-along: too little voice asks for more singing, louder, and shows no report', () => {
  const ready = songWith({ mv: audioEntry, sections: twoSections });
  const short = songMediaBelow(ready, ui({ singReport: { status: 'short' } }), singLines);
  assert.ok(short.includes('조금 더 불러 주세요. 20초 넘게 소리가 잡혀야 리포트를 만들 수 있어요.'));
  assert.ok(short.includes('소리가 작으면 잘 안 잡혀요. 평소 크기로 불러 주세요.'));
  assert.equal(reportOf(short), '');
});

test('spots report: words and lyric lines are escaped; odd values do not break the page', () => {
  const report = spotsReport([spotOf('s1', 'leap', 'sag', { lineId: 1 }), spotOf('s2', 'high-hold', 'kept', { time: 60, section: '<b>구간</b>' })]);
  const html = spotsPage({ ...report, words: { s1: '<b>숨</b>이 내려왔어요', s2: '"><img src=x>' } });
  for (const text of ['&lt;i&gt;word-b', '&lt;b&gt;숨', '&lt;b&gt;구간', '&quot;&gt;&lt;img']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<b>') && !html.includes('<img') && !html.includes('<i>'));
  assert.equal(spotsPage({ status: 'spots', result: { status: 'ok', spots: [] }, words: {}, polish: 'idle' }).includes('찾지 못했어요'), true);
});

// --- Karaoke recording mode ---
const karaokePage = (karaoke, extra = {}) => songMediaBelow(songWith({ mv: audioEntry, sections: twoSections }), ui({ consent: true, karaoke, comfortHigh: 69, karaokeAudio: true, ...extra }), singLines);
const karaokeReportOf = html => html.match(/<section class="surface practice-feedback karaoke-report">[\s\S]*?<\/section>/)?.[0] ?? '';
const karaokeDone = (extra = {}) => ({
  status: 'done', polish: 'idle', answers: {}, suggestionDone: false,
  result: { status: 'ok', voicedSeconds: 120, range: { topHeld: 72, keptHigh: 71 }, suggestion: 71, spots: [
    { id: 's1', kind: 'high-hold', outcome: 'kept', time: 72.4, end: 73.4, lineId: null, section: '', from: null, to: '2옥 라', over: null, repeated: false },
    { id: 's2', kind: 'high-hold', outcome: 'sag', time: 150, end: 151.2, lineId: null, section: '', from: null, to: '2옥 시', over: 2, repeated: false },
  ] },
  words: { s1: 's1 문장', s2: 's2 문장' },
  ...extra,
});

test('karaoke mode: the panel explains that the recording stays on the phone and asks for a file', () => {
  assert.match(karaokePage(null), /data-action="media-karaoke-open"[^>]*>노래방 녹음 분석하기/);
  const panel = karaokePage(null, { panel: 'karaoke' });
  for (const text of ['노래방에서 부른 녹음을 이 폰 안에서 분석해요. 녹음은 어디로도 보내지 않고, 이 화면을 떠나면 지워져요.', '노래방에서 폰의 녹음 앱으로 녹음한 파일을 골라 주세요.']) assert.ok(panel.includes(text), text);
  assert.match(panel, /data-action="media-karaoke-file"[^>]*>녹음 파일 고르기/);
  assert.ok(!panel.includes('id="karaoke-file"'), 'the file input lives outside the redrawn page (index.html)');
  assert.ok(karaokePage({ status: 'analyzing', progress: 0.4 }, { panel: 'karaoke' }).includes('녹음을 분석하고 있어요… 40%'));
});

test('karaoke mode: each problem has its own words, and a take with too little voice says so', () => {
  const words = {
    'too-big': '파일이 너무 커요. 50MB까지 분석할 수 있어요.',
    'too-long': '10분보다 긴 녹음은 분석하지 못해요.',
    unreadable: '이 파일은 읽지 못했어요. 다른 녹음 파일로 해 보세요.',
    unsupported: '이 브라우저에서는 노래방 녹음 분석을 쓸 수 없어요.',
    error: '이 파일은 읽지 못했어요. 다른 녹음 파일로 해 보세요.',
  };
  for (const [problem, text] of Object.entries(words)) assert.ok(karaokePage({ status: 'problem', problem }, { panel: 'karaoke' }).includes(text), problem);
  assert.ok(karaokePage({ status: 'short' }, { panel: 'karaoke' }).includes('목소리가 충분히 잡히지 않았어요. 다른 녹음으로 다시 해 보세요.'));
});

test('karaoke report: the top long note, the limits, each spot by time with a way to hear it, and the range suggestion', () => {
  const html = karaokeReportOf(karaokePage(karaokeDone()));
  for (const text of ['노래방 녹음 리포트', '가장 높게 길게 낸 음은 3옥 도예요.', '편한 최고음보다 반음 3개 높아요.', '노래방 녹음에서는 길게 낸 높은 음을 중심으로 봐요. 반주가 섞여 있어서 짧은 음은 정확하지 않을 수 있어요.', '이 노래의 어려운 자리', '1분 12초쯤', '2분 30초쯤', 's1 문장', 's2 문장', '잘 넘겼어요', '음이 내려왔어요', '노래방 키 낮추기', '이 노래에서 2옥 시까지 길게 지켰어요. 편한 최고음을 여기(2옥 시)로 바꿀까요?']) assert.ok(html.includes(text), text);
  assert.equal(count(html, 'data-action="media-karaoke-play"'), 2);
  assert.match(html, /data-action="media-karaoke-play" data-id="72.4"[^>]*>내 녹음 듣기/);
  assert.match(html, /data-action="media-karaoke-high-yes"[^>]*>바꾸기/);
  assert.match(html, /data-action="media-karaoke-high-no"[^>]*>그대로 두기/);
  assert.ok(!html.includes('style="'));
  assert.ok(!karaokeReportOf(karaokePage(karaokeDone({ suggestionDone: true }))).includes('바꿀까요'));
  assert.ok(!karaokeReportOf(karaokePage(karaokeDone(), { karaokeAudio: false })).includes('내 녹음 듣기'), 'the recording is gone');
});

test('karaoke report: the summary\'s second half follows the comfortable top', () => {
  const summary = comfortHigh => karaokeReportOf(karaokePage(karaokeDone(), { comfortHigh }));
  assert.ok(summary(72).includes('편한 최고음과 같아요.'));
  assert.ok(summary(74).includes('편한 최고음 안쪽이에요.'));
  // Without a comfortable top there is nothing to compare with, and no suggestion either (suggestHigh needs one).
  const unknown = karaokeReportOf(karaokePage(karaokeDone({ result: { ...karaokeDone().result, suggestion: null } }), { comfortHigh: null }));
  assert.ok(unknown.includes('가장 높게 길게 낸 음은 3옥 도예요.') && !unknown.includes('편한 최고음'));
  const sol = karaokeReportOf(karaokePage(karaokeDone({ result: { ...karaokeDone().result, range: { topHeld: 67, keptHigh: null }, suggestion: null } })));
  assert.ok(sol.includes('가장 높게 길게 낸 음은 2옥 솔이에요.'), 'a note ending in a consonant takes 이에요');
  const none = karaokeReportOf(karaokePage(karaokeDone({ result: { ...karaokeDone().result, spots: [], range: { topHeld: null, keptHigh: null }, suggestion: null } })));
  assert.ok(none.includes('이번에는 크게 올라가거나 높이 올라가는 자리를 찾지 못했어요.') && !none.includes('가장 높게'));
});

test('karaoke report: with lyric times it asks once whether the first voice is the first line, then adds the lines', () => {
  const withVoice = extra => karaokeDone({ result: { ...karaokeDone().result, firstVoice: 7 }, ...extra });
  const ask = karaokeReportOf(karaokePage(withVoice()));
  assert.ok(ask.includes('여기가 노래의 첫 소절이 맞나요?'));
  assert.match(ask, /data-action="media-karaoke-first-play"[^>]*>들어 보기/);
  assert.match(ask, /data-action="media-karaoke-first-yes"[^>]*>맞아요/);
  assert.match(ask, /data-action="media-karaoke-first-no"[^>]*>아니에요, 시간으로만 볼게요/);
  assert.ok(!ask.includes('word-'), 'times only until it is confirmed');
  // Confirmed: the take's 7 s is the first line's 17.6 s, so 72.4 s in the take is 83 s in the song (line word-c).
  const yes = karaokeReportOf(karaokePage(withVoice({ firstLine: 'yes', lineOffset: -10.6 })));
  assert.ok(!yes.includes('첫 소절이 맞나요'));
  assert.ok(yes.includes('1분 12초쯤 · “word-c”'), yes);
  assert.ok(yes.includes('2분 30초쯤') && !yes.includes('2분 30초쯤 · '), 'a spot past the lines keeps its time only');
  const escaped = karaokeReportOf(karaokePage(withVoice({ firstLine: 'yes', lineOffset: 72.4 - 31 })));
  assert.ok(escaped.includes('“&lt;i&gt;word-b&lt;/i&gt;”') && !escaped.includes('<i>'), 'lyric text is escaped');
  const no = karaokeReportOf(karaokePage(withVoice({ firstLine: 'no' })));
  assert.ok(!no.includes('첫 소절이 맞나요') && !no.includes('word-'));
});

test('karaoke report: no first-line question without lyric times, a first voice, spots, or the recording itself', () => {
  const withVoice = karaokeDone({ result: { ...karaokeDone().result, firstVoice: 7 } });
  const page = (karaoke, lines, extra = {}) => karaokeReportOf(songMediaBelow(songWith({ mv: audioEntry, sections: twoSections }), ui({ consent: true, karaoke, comfortHigh: 69, karaokeAudio: true, ...extra }), lines));
  assert.ok(!page(withVoice, null).includes('첫 소절'), 'no lyrics');
  assert.ok(!page(withVoice, [{ t: 3, text: '' }]).includes('첫 소절'), 'no line with words');
  assert.ok(!page(karaokeDone(), singLines).includes('첫 소절'), 'no first voice');
  assert.ok(!page({ ...withVoice, result: { ...withVoice.result, spots: [] } }, singLines).includes('첫 소절'), 'no spots to name');
  assert.ok(!page(withVoice, singLines, { karaokeAudio: false }).includes('첫 소절'), 'nothing to listen to');
});

test('karaoke mode: recording in the app is offered only when it is switched on, after the file button', () => {
  assert.ok(!karaokePage(null, { panel: 'karaoke' }).includes('media-karaoke-record'));
  const panel = karaokePage(null, { panel: 'karaoke', recordInApp: true });
  assert.match(panel, /data-action="media-karaoke-record"[^>]*>여기서 녹음하기/);
  assert.ok(panel.indexOf('data-action="media-karaoke-file"') < panel.indexOf('data-action="media-karaoke-record"'), 'the file comes first');
});

test('karaoke mode: while recording, the time heard and the stop button stay whatever panel is open', () => {
  for (const panel of ['karaoke', 'sing', null]) {
    const html = karaokePage({ status: 'recording', seconds: 65 }, { panel, recordInApp: true });
    assert.ok(html.includes('녹음하고 있어요. 화면을 켜 둔 채로 두세요.'), String(panel));
    assert.ok(html.includes('1:05'), String(panel));
    assert.match(html, /data-action="media-karaoke-record-stop"[^>]*>녹음 멈추고 분석하기/);
    assert.ok(!html.includes('data-action="media-karaoke-record"'), 'no second recording meanwhile');
  }
  assert.ok(karaokePage({ status: 'recording', seconds: 5 }, { panel: 'karaoke', recordInApp: true }).includes('0:05'));
});

test('karaoke mode: a recording cut short by leaving the screen says so while analysing and in the report', () => {
  const text = '화면을 벗어나 녹음을 멈췄어요. 여기까지 분석할게요.';
  assert.ok(karaokePage({ status: 'analyzing', progress: 0.1, notice: 'left' }).includes(text));
  assert.ok(karaokeReportOf(karaokePage(karaokeDone({ notice: 'left' }))).includes(text));
  assert.ok(!karaokeReportOf(karaokePage(karaokeDone())).includes(text));
});

// The picture: three notes (one long), two long high notes (one chosen), 120 s long.
const withPicture = (extra = {}) => karaokeDone({ result: { ...karaokeDone().result, seconds: 120, voicedSeconds: 75.4, range: { topHeld: 72, keptHigh: 71, lowHeld: 55 },
  contour: [[10, 10.4, 55.2], [72.4, 73.4, 69.1], [150, 151.2, 71.2]],
  highs: [{ time: 72.4, end: 73.4, outcome: 'kept' }, { time: 100, end: 101, outcome: 'kept' }, { time: 150, end: 151.2, outcome: 'sag' }] }, ...extra });

test('karaoke report: three numbers on how the take went, from the analysis only', () => {
  const html = karaokeReportOf(karaokePage(withPicture()));
  for (const text of ['따라간 목소리', '1분 15초', '2분 중', '부른 음역', '1옥 솔 ~ 3옥 도', '길게 낸 높은 음', '3번', '2번은 끝까지 지켰어요']) assert.ok(html.includes(text), text);
  const old = karaokeReportOf(karaokePage(karaokeDone()));
  assert.ok(!old.includes('따라간 목소리') && !old.includes('<svg'), 'a report without the picture data shows neither');
});

test('karaoke report: the picture draws each note, the comfortable top, and numbers the chosen spots like the list', () => {
  const html = karaokeReportOf(karaokePage(withPicture()));
  assert.equal(count(html, 'class="graph-note long"'), 2, 'held 0.6 s or more');
  assert.equal(count(html, 'class="graph-note short"'), 1);
  assert.equal(count(html, 'class="graph-comfort"'), 1);
  assert.equal(count(html, 'class="graph-spot"'), 2, 'the two spots in the list');
  assert.equal(count(html, 'class="graph-high"'), 1, 'the long high note the report did not choose');
  assert.ok(html.includes('진한 선은 길게 낸 음, 점선은 편한 최고음이에요.'));
  assert.ok(!html.includes('style="'));
  assert.equal(count(karaokeReportOf(karaokePage(withPicture(), { comfortHigh: null })), 'class="graph-comfort"'), 0);
});

test('karaoke report: tapping the picture plays the recording from there, only while the recording is still here', () => {
  const html = karaokeReportOf(karaokePage(withPicture()));
  assert.match(html, /<button type="button" class="pitch-graph" data-action="media-karaoke-graph" aria-label="음높이 그림\. 누르면 그 시간부터 내 녹음이 나와요\.">/);
  assert.ok(html.includes('그림을 누르면 그 시간부터 내 녹음이 나와요.'));
  const gone = karaokeReportOf(karaokePage(withPicture(), { karaokeAudio: false }));
  assert.ok(gone.includes('<svg') && !gone.includes('media-karaoke-graph') && !gone.includes('그림을 누르면'));
});

test('karaoke picture: a tap\'s place across the picture becomes a time in the take', async () => {
  const { karaokeGraphTime, KARAOKE_GRAPH } = await import('../src/song-media-views.js');
  const { width, left, right } = KARAOKE_GRAPH;
  assert.equal(karaokeGraphTime(left / width, 120), 0);
  assert.equal(karaokeGraphTime((width - right) / width, 120), 120);
  assert.equal(karaokeGraphTime((left + (width - left - right) / 2) / width, 120), 60);
  assert.equal(karaokeGraphTime(0, 120), 0, 'the label area counts as the start');
  assert.equal(karaokeGraphTime(1, 120), 120);
});
