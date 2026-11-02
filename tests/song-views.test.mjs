import test from 'node:test';
import assert from 'node:assert/strict';
import { songResults, songFormView, songDetailView } from '../src/song-views.js';
import { createSong } from '../src/songs.js';
import { createPlaylist, addSong } from '../src/playlists.js';
import { defaultState } from '../src/storage.js';

test('song metadata and searches are escaped in cards, details, and form attributes', () => {
  const malicious = '\"><img src=x onerror=alert(1)>';
  const song = createSong({ title: malicious, artist: malicious, note: '</textarea><script>alert(1)</script>', lyricsUrl: 'https://example.com/?q="hello"' });
  for (const html of [songResults([song], malicious), songDetailView({state:{...defaultState(), songs:[song]}, selectedSongId:song.id}), songFormView({state:defaultState(), songDraft:song})]) {
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&quot;'));
  }
});

test('a title-only song has unknown range and transposed range only appears for supplied notes', () => {
  const song = createSong({title:'제목만',keyOffset:-2});
  const render = s => songDetailView({state:{...defaultState(), songs:[s]},selectedSongId:s.id});
  assert.ok(render(song).includes('아직 미입력'));
  assert.ok(!render(song).includes('내 설정으로 옮긴 음역'));
  const known = {...song,lowestMidi:60,highestMidi:72};
  assert.ok(render(known).includes('라♯ · A♯3 ~ 라♯ · A♯4'));
});

test('form offers a checkbox per playlist and detail shows membership, AI note and https source', () => {
  const song = createSong({ title: 'A', lowestMidi: 48, highestMidi: 67, rangeSourceUrl: 'https://src.org/a', origin: 'ai' });
  const a = addSong(createPlaylist([], '도전하기'), song.id), b = createPlaylist([], '퇴근길');
  const st = { ...defaultState(), songs: [song], playlists: [a, b] };
  const form = songFormView({ state: st, songDraft: { ...song, playlistIds: [a.id] } });
  assert.match(form, new RegExp(`name="playlistIds" value="${a.id}" checked`));
  assert.match(form, new RegExp(`name="playlistIds" value="${b.id}"(?! checked)`));
  assert.ok(!form.includes('지금 이 곡은'));
  const detail = songDetailView({ state: st, selectedSongId: song.id });
  assert.match(detail, /도전하기/);
  assert.match(detail, /AI 추천으로 담은 곡 · 키는 추천값이에요/);
  assert.match(detail, /href="https:\/\/src\.org\/a"[^>]*rel="noopener noreferrer"/);
  assert.match(detail, /data-action="song-back"/);
});

test('the word 노래장 no longer appears in any view', () => {
  const st = { ...defaultState(), songs: [createSong({ title: 'A' })] };
  for (const html of [songFormView({ state: st, songDraft: {} }), songDetailView({ state: st, selectedSongId: st.songs[0].id }), songResults(st.songs, '')]) assert.ok(!html.includes('노래장'));
});

test('song form offers AI range lookup and keeps a found source in the form', () => {
  const st = defaultState();
  assert.match(songFormView({ state: st, songDraft: {} }), /data-action="song-range"/);
  const html = songFormView({ state: st, songDraft: { title: '봄날', lowestMidi: 48, highestMidi: 67, rangeSourceUrl: 'https://src.org/r' } });
  assert.match(html, /name="rangeSourceUrl" value="https:\/\/src\.org\/r"/);
  assert.match(html, /음역 출처 보기/);
});
