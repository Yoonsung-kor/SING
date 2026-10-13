import test from 'node:test';
import assert from 'node:assert/strict';
import { songResults, songFormView, songDetailView } from '../src/song-views.js';
import { createSong } from '../src/songs.js';

test('song metadata and searches are escaped in cards, details, and form attributes', () => {
  const malicious = '\"><img src=x onerror=alert(1)>';
  const song = createSong({ title: malicious, artist: malicious, note: '</textarea><script>alert(1)</script>', lyricsUrl: 'https://example.com/?q="hello"' });
  for (const html of [songResults([song], malicious), songDetailView({state:{songs:[song]}, selectedSongId:song.id}), songFormView({songDraft:song})]) {
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&quot;'));
  }
});

test('a title-only song has unknown range and transposed range only appears for supplied notes', () => {
  const song = createSong({title:'제목만',keyOffset:-2});
  const render = s => songDetailView({state:{songs:[s]},selectedSongId:s.id});
  assert.ok(render(song).includes('아직 미입력'));
  assert.ok(!render(song).includes('내 설정으로 옮긴 음역'));
  const known = {...song,lowestMidi:60,highestMidi:72};
  assert.ok(render(known).includes('라♯ · A♯3 ~ 라♯ · A♯4'));
});
