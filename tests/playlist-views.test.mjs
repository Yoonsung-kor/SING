import assert from 'node:assert/strict';
import test from 'node:test';
import { playlistHomeView, playlistHomeResults, playlistView, playlistFormView, recommendationSection, aiConsentView } from '../src/playlist-views.js';
import { createPlaylist, addSong, setRecommendations } from '../src/playlists.js';
import { createSong } from '../src/songs.js';
import { defaultState } from '../src/storage.js';

const state = (playlists = [], songs = []) => ({ ...defaultState(), songs, playlists });

test('home shows an empty state, cards, or search results', () => {
  assert.match(playlistHomeView({ state: state(), songQuery: '' }), /아직 플레이리스트가 없어요[\s\S]*data-action="playlist-new"/);
  const song = createSong({ title: '봄날', artist: '방탄소년단' });
  const list = addSong(createPlaylist([], '도전하기'), song.id);
  const cards = playlistHomeResults(state([list], [song]), '');
  assert.match(cards, /data-action="playlist-open" data-id="[^"]+"[\s\S]*도전하기[\s\S]*1곡 · 봄날/);
  assert.match(cards, /data-action="all-songs"/);
  const search = playlistHomeResults(state([list], [song]), '봄');
  assert.ok(search.includes('data-action="song-detail"') && !search.includes('playlist-open'));
});

test('playlist page lists newest songs first with remove buttons, and names are escaped', () => {
  const a = createSong({ title: '첫 곡' }), b = createSong({ title: '둘째 곡', keyOffset: -2 });
  const list = [a, b].reduce((p, s) => addSong(p, s.id), createPlaylist([], '<img src=x>'));
  const html = playlistView({ state: state([list], [a, b]), selectedPlaylistId: list.id });
  assert.ok(html.indexOf('둘째 곡') < html.indexOf('첫 곡'));
  assert.match(html, /2곡/);
  assert.match(html, new RegExp(`data-action="playlist-remove-song" data-id="${b.id}"`));
  assert.ok(html.includes('&lt;img') && !html.includes('<img'));
});

test('playlist song cards show the TJ number, so it can be read without opening the song', () => {
  const numbered = createSong({ title: '바라보기', artist: 'MC THE MAX', tjNumber: '39408' }), plain = createSong({ title: '번호 없는 곡' });
  const list = [numbered, plain].reduce((p, s) => addSong(p, s.id), createPlaylist([], '도전하기'));
  const html = playlistView({ state: state([list], [numbered, plain]), selectedPlaylistId: list.id });
  assert.match(html, /바라보기[^]*?<span class="song-tj">TJ 39408<\/span>[^]*?<\/article>/);
  assert.equal((html.match(/class="song-tj"/g) || []).length, 1);
});

test('playlist form prefills a rename and shows an escaped error', () => {
  const html = playlistFormView({ playlistDraft: { id: 'x', name: '"퇴근길' }, playlistError: '<b>같은 이름</b>' });
  assert.ok(html.includes('value="&quot;퇴근길"') && html.includes('&lt;b&gt;'));
  assert.match(html, /이름 바꾸기/);
});

const three = () => [1, 2, 3].map(n => createSong({ title: `곡${n}`, highestMidi: 67, lowestMidi: 48, keyOffset: -2 }));
const view = (playlist, songs, extra = {}) => recommendationSection({ state: { ...defaultState(), songs, playlists: [playlist] }, recLoading: null, recError: null, ...extra }, playlist);

test('section states: too few songs, ask, loading, error', () => {
  const songs = three();
  const few = addSong(createPlaylist([], 'A'), songs[0].id);
  assert.match(view(few, songs), /곡을 3개 이상 담으면 어울리는 곡을 추천해 드려요/);
  const full = songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], 'A'));
  assert.match(view(full, songs), new RegExp(`data-action="rec-fetch" data-id="${full.id}"[^>]*>추천 받기`));
  assert.match(view(full, songs, { recLoading: full.id }), /어울리는 곡을 찾고 있어요/);
  assert.match(view(full, songs, { recError: { id: full.id, message: '지금은 추천을 불러오지 못했어요.' } }), /지금은 추천을 불러오지 못했어요[\s\S]*다시 시도/);
});

test('malicious AI item is escaped and only https links render', () => {
  const songs = three();
  const item = { title: '<img src=x onerror=alert(1)>', artist: 'a', reason: '<script>x</script>', songUrl: 'javascript:alert(1)', range: { highestMidi: 70, falsettoHighestMidi: null, lowestMidi: null, sourceUrl: 'https://s.org', sourceQuote: '최고음 2옥 라#' } };
  const list = setRecommendations(songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], 'A')), [item]);
  const html = view(list, songs);
  assert.ok(!html.includes('<img') && !html.includes('<script') && !html.includes('javascript:'));
  assert.match(html, /노래방 -5 반음 추천 · 담아둔 곡 기준 어림값/);
  assert.doesNotMatch(html, /s\.org/);
  assert.match(html, /data-action="rec-add" data-id="0"[\s\S]*data-action="rec-nope" data-id="0"/);
});

test('an item without a range says so and offers no key', () => {
  const songs = three();
  const list = setRecommendations(songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], 'A')), [{ title: 'T', artist: '', reason: 'r', songUrl: 'https://x.org', range: null }]);
  const html = view(list, songs);
  assert.match(html, /최고음 확인 안 됨/);
  assert.ok(!html.includes('반음 추천'));
});

test('consent page names OpenAI, what is sent, and what is not', () => {
  const html = aiConsentView({ state: defaultState(), selectedPlaylistId: 'p' });
  for (const text of ['OpenAI', '플레이리스트 이름', '녹음은 보내지 않아요. 연습 측정값은 피드백을 받을 때만 보내요.', '연습 피드백을 받을 때 연습 측정값(목표음, 낸 음, 흔들림, 체감)이 OpenAI로 가요. 노래를 따라 부르고 받을 때는 곡 제목·가수와 구간 이름, 가사 줄 번호도 함께 가요. 녹음과 가사 글자는 보내지 않아요.', 'data-action="ai-consent-accept"', '나의 기록']) assert.ok(html.includes(text), text);
});

test('consent v2 also covers MusicBrainz search and my comfortable high', () => {
  const html = aiConsentView({ state: defaultState(), selectedPlaylistId: 'p' });
  for (const text of ['AI 추천·곡 검색·영상 찾기를 쓰기 전에', 'MusicBrainz', '내 편한 최고음', '동의하고 계속하기', '최고음 찾기']) assert.ok(html.includes(text), text);
});

test('consent v4 says the song screen sends title and artist to YouTube search and lyric timing', () => {
  const html = aiConsentView({ state: defaultState(), selectedPlaylistId: 'p' });
  for (const text of ['곡 상세 화면에서 보내는 정보', 'YouTube 검색', '가사 시간 정보 서비스', '가사는 이 화면에서만 보여주고 저장하지 않아요.']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('받자마자 버리고'));
  assert.ok(html.includes('원곡(음원 영상, 없으면 뮤직비디오)과 금영 노래방 영상을 찾으려고요.') && !html.includes('원곡 MV'));
  assert.ok(!html.includes('LRCLIB'));
});

test('cards for songs already in the library are hidden but keep their index', () => {
  const songs = three();
  const owned = createSong({ title: '아로하', artist: '조정석' });
  const items = [{ title: '아로하 (Live)', artist: '조정석', reason: 'r', songUrl: 'https://x.org/1', range: null }, { title: '응급실', artist: 'izi', reason: 'r', songUrl: 'https://x.org/2', range: null }];
  const list = setRecommendations(songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], 'A')), items);
  const html = recommendationSection({ state: { ...defaultState(), songs: [...songs, owned], playlists: [list] }, recLoading: null, recError: null }, list);
  assert.ok(!html.includes('아로하'));
  assert.match(html, /응급실[\s\S]*data-action="rec-add" data-id="1"/);
});

const myVoice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: '2026-11-03T01:00:00.000Z', basis: [] };
const v2 = (highestMidi, vocal = 'male') => ({ title: `곡${highestMidi}`, artist: '가수', reason: '어울려요.', songUrl: 'https://example.org/song', vocal,
  range: { highestMidi, falsettoHighestMidi: null, lowestMidi: null, sourceUrl: 'https://namu.example/w/x', sourceQuote: '최고음 확인 문장' } });
function section(items, { voice = myVoice, meta = {} } = {}) {
  const songs = three();
  const list = setRecommendations(songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], '도전하기')), items, new Date(), meta);
  const settings = { ...defaultState().settings, voice };
  return recommendationSection({ state: { ...defaultState(), settings, songs, playlists: [list] }, recLoading: null, recError: null }, list);
}

test('cards show the key that fits me, an octave down for a woman\'s song in a man\'s key', () => {
  const html = section([v2(81, 'female'), v2(74)]);
  assert.match(html, /최고음 3옥 라 ✓ · 한 옥타브 아래 기준<\/p><div class="key-row" role="img" aria-label="원키 그대로 편하게 불러요"[^]*?<span>\+2키까지 올려도 편하게 부를 수 있어요<\/span>/);
  assert.match(html, /최고음 3옥 레 ✓<\/p><div class="key-row" role="img" aria-label="지금은 −3키로 부르면 편해요"[\s\S]*<strong>지금은 −3키로 부르면 편해요<\/strong><span>한 키씩 올리면서 원키까지 도전해 봐요<\/span>/);
  assert.doesNotMatch(html, /버거우면|range-bar/);
});

test('unchecked and old ranges never get a check mark, and no source is named or linked', () => {
  const legacy = { title: '예전 곡', artist: '가수', reason: '어울려요.', songUrl: 'https://example.org/old', range: { lowestMidi: 50, highestMidi: 70, sourceUrl: 'https://namu.example/w/old', sourceNotation: '2옥 라#' } };
  const html = section([legacy, { ...v2(72), range: null }]);
  assert.match(html, /원곡 최고음 2옥 라♯ \(확인 전\)/);
  assert.match(html, /최고음 확인 안 됨/);
  assert.doesNotMatch(html, /✓/);
  assert.doesNotMatch(section([v2(74)]), /namu|출처 보기|음역 출처/);
});

test('without my range the section offers to set it, and a fallback pick says so', () => {
  assert.match(section([v2(74)], { voice: null }), /내 음역을 알려주면 실력에 맞춰 골라드려요[\s\S]*data-action="voice-start"/);
  assert.doesNotMatch(section([v2(74)]), /data-action="voice-start"/);
  assert.match(section([{ ...v2(72), range: null }], { meta: { intent: 'challenge', fallback: true } }), /확인된 도전 곡을 못 찾아 분위기로 골랐어요\./);
  assert.match(section([{ ...v2(72), range: null }], { meta: { intent: 'comfortable', fallback: true } }), /확인된 편한 곡을 못 찾아 분위기로 골랐어요\./);
});

test('final #16: the consent copy names the lowest note it also sends', () => {
  assert.match(aiConsentView({ state: defaultState(), selectedPlaylistId: 'p' }), /원곡 최고음·최저음/);
});

test('consent v3 says search terms go to TJ', () => {
  assert.match(aiConsentView({ state: defaultState(), selectedPlaylistId: 'p' }), /TJ미디어/);
});
