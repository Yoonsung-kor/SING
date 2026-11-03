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

test('a title-only song has an unknown top note, and the sung top note appears only once a top note is known', () => {
  const song = createSong({title:'제목만',keyOffset:-2});
  const render = s => songDetailView({state:{...defaultState(), songs:[s]},selectedSongId:s.id});
  assert.ok(render(song).includes('아직 미입력'));
  assert.ok(!render(song).includes('내가 부르는 최고음'));
  const known = {...song,lowestMidi:60,highestMidi:72};
  assert.match(render(known), /내가 부르는 최고음<\/dt><dd>2옥 라♯/);
  assert.match(render(known), /원곡 최저음<\/dt><dd>2옥 도/);
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
  // Sources are checked by the server but never named or linked on screen.
  assert.doesNotMatch(detail, /src\.org|출처 보기/);
  assert.match(detail, /확인 전/);
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
  assert.doesNotMatch(html, /음역 출처 보기|<a[^>]*src\.org/);
});

const voice = { comfortableHighMidi: 71, voiceType: 'male', method: 'songs', updatedAt: '2026-11-03T01:00:00.000Z', basis: [] };
const withVoice = { ...defaultState().settings, voice };

test('song detail marks checked top notes, shows falsetto, and shows the key row only with my range', () => {
  const checked = createSong({ title: '사건의 지평선', artist: '윤하', highestMidi: 74, falsettoHighestMidi: 78, rangeSourceUrl: 'https://example.org/r', rangeQuote: '진성 3옥타브 레(D5), 가성 3옥타브 파#(F#5)', vocal: 'female' });
  const plain = createSong({ title: '직접 적은 곡', highestMidi: 74 });
  const render = (song, settings = defaultState().settings) => songDetailView({ state: { ...defaultState(), settings, songs: [song] }, selectedSongId: song.id });
  assert.match(render(checked), /진성 3옥 레 ✓ \(가성 3옥 파♯\)/);
  assert.match(render(checked), /최고음은 출처에서 확인한 값이에요/);
  assert.doesNotMatch(render(checked), /example\.org|key-row/);
  assert.doesNotMatch(render(plain), /✓/);
  const barred = render(checked, withVoice);
  assert.match(barred, /class="key-row" role="img" aria-label="지금은 −3키로 부르면 편해요"/);
  assert.match(barred, /한 키씩 올리면서 원키까지 도전해 봐요/);
  assert.doesNotMatch(barred, /버거우면|내 키 /);
  const saved = render({ ...checked, keyOffset: -1 }, withVoice);
  assert.match(saved, /aria-label="지금은 −3키로 부르면 편해요"[\s\S]*>내 키 −1<\/text>/);
  assert.match(saved, /저장한 내 키\(−1\)로 도전 중이에요\. 힘들면 −3키로 내려도 돼요/);
});

test('the song form looks up top notes, offers falsetto and octave fields, and links no source', () => {
  const html = songFormView({ state: defaultState(), songDraft: { title: '봄날', highestMidi: 67, rangeSourceUrl: 'https://src.org/r', rangeQuote: '최고음 2옥타브 솔(G4)' } });
  assert.match(html, /data-action="song-range"[^>]*>최고음 찾기 \(AI\)/);
  assert.match(html, /name="falsettoHighestMidi"/);
  assert.match(html, /name="octaveShift"[\s\S]*한 옥타브 아래/);
  assert.match(html, /name="rangeQuote" value="최고음 2옥타브 솔\(G4\)"/);
  assert.match(html, /최고음은 출처에서 확인한 값이에요 ✓/);
  assert.doesNotMatch(html, /<a[^>]*src\.org/);
});

test('the TJ number can be entered and is shown on cards and details', () => {
  const song = createSong({ title: '어디에도', artist: 'MC THE MAX', tjNumber: '46009' });
  const st = { ...defaultState(), songs: [song] };
  assert.match(songFormView({ state: st, songDraft: song }), /name="tjNumber"[^>]*value="46009"|value="46009"[^>]*name="tjNumber"/);
  assert.match(songDetailView({ state: st, selectedSongId: song.id }), /TJ 46009/);
  assert.match(songResults(st.songs, ''), /TJ 46009/);
});
