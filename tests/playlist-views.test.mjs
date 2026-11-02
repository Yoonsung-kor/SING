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
  const item = { title: '<img src=x onerror=alert(1)>', artist: 'a', reason: '<script>x</script>', songUrl: 'javascript:alert(1)', range: { lowestMidi: 48, highestMidi: 70, sourceUrl: 'https://s.org', sourceNotation: '' } };
  const list = setRecommendations(songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], 'A')), [item]);
  const html = view(list, songs);
  assert.ok(!html.includes('<img') && !html.includes('<script') && !html.includes('javascript:'));
  assert.match(html, /노래방 -5 반음 추천 · 담아둔 곡 기준 어림값/);
  assert.match(html, /href="https:\/\/s\.org"/);
  assert.match(html, /data-action="rec-add" data-id="0"[\s\S]*data-action="rec-nope" data-id="0"/);
});

test('an item without a range says so and offers no key', () => {
  const songs = three();
  const list = setRecommendations(songs.reduce((p, s) => addSong(p, s.id), createPlaylist([], 'A')), [{ title: 'T', artist: '', reason: 'r', songUrl: 'https://x.org', range: null }]);
  const html = view(list, songs);
  assert.match(html, /음역 정보 없음/);
  assert.ok(!html.includes('반음 추천'));
});

test('consent page names OpenAI, what is sent, and what is not', () => {
  const html = aiConsentView({ state: defaultState(), selectedPlaylistId: 'p' });
  for (const text of ['OpenAI', '플레이리스트 이름', '녹음, 허밍 기록, 연습 기록은 보내지 않아요.', 'data-action="ai-consent-accept"', '나의 기록']) assert.ok(html.includes(text), text);
});
