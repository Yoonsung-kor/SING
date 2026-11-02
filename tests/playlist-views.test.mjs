import assert from 'node:assert/strict';
import test from 'node:test';
import { playlistHomeView, playlistHomeResults, playlistView, playlistFormView } from '../src/playlist-views.js';
import { createPlaylist, addSong } from '../src/playlists.js';
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
