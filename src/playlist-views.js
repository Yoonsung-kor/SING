import { songResults, keyLabel } from './song-views.js';
import { suggestKey, sameSong } from './recommend.js';
import { PLAYLIST_LIMITS } from './playlists.js';
import { noteName } from './pitch.js';
import { voiceCard } from './onboarding-views.js';
import { koreanNote } from './notes.js';
import { rangeBar, zoneText } from './range-graphics.js';
import { candidateShift, keyHint } from './vocal-range.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const songsById = state => new Map(state.songs.map(song => [song.id, song]));
const isHttps = url => { try { const u = new URL(url); return u.protocol === 'https:' && Boolean(u.hostname); } catch { return false; } };
// AI output is untrusted: every link is re-checked here even though the server already filtered it.
const outLink = (url, label) => isHttps(url) ? `<a class="source-link" href="${e(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
const note = midi => noteName(midi)?.label || '';
const backToLists = () => '<button class="back-button" data-action="songs">‹ 내 플레이리스트</button>';

function playlistCard(playlist, byId) {
  const titles = playlist.songIds.slice(-2).reverse().map(id => byId.get(id)?.title).filter(Boolean);
  return `<button class="playlist-card" data-action="playlist-open" data-id="${e(playlist.id)}"><span><strong>${e(playlist.name)}</strong><small>${playlist.songIds.length}곡${titles.length ? ` · ${titles.map(e).join(', ')}` : ''}</small></span><span class="chevron" aria-hidden="true">›</span></button>`;
}

export function playlistHomeResults(state, query) {
  if (query.trim()) return songResults(state.songs, query);
  const allSongs = `<button class="playlist-card all" data-action="all-songs"><span><strong>모든 곡</strong><small>${state.songs.length}곡</small></span><span class="chevron" aria-hidden="true">›</span></button>`;
  if (!state.playlists.length) {
    return `<div class="empty song-empty"><div class="song-empty-symbol" aria-hidden="true">♫</div><h2>아직 플레이리스트가 없어요</h2><p>‘어렵지 않게 부르는 거’, ‘도전하기’처럼<br>내 기준으로 이름을 붙여 곡을 나눠 담아요.</p><button class="button" data-action="playlist-new">＋ 새 플레이리스트 만들기</button></div><div class="playlist-list">${allSongs}</div>`;
  }
  const byId = songsById(state);
  return `<div class="playlist-list">${state.playlists.map(p => playlistCard(p, byId)).join('')}<button class="playlist-new" data-action="playlist-new">＋ 새 플레이리스트 만들기</button>${allSongs}</div>`;
}

export function playlistHomeView(v) {
  return `<div class="songbook"><div class="songbook-heading"><div><p class="eyebrow">뭐 부르지?</p><h1>내 플레이리스트</h1><p>부르는 곡을 내 기준으로 나눠 담아요.<br>리스트마다 어울리는 곡도 추천받을 수 있어요.</p></div><button class="button" data-action="song-add">＋ 곡 담기</button></div>${voiceCard(v.state)}<div class="song-tools"><label class="song-search-label" for="song-search">제목 · 가수 검색</label><input id="song-search" class="song-search" type="search" maxlength="120" placeholder="오늘 떠오른 노래가 있나요?" value="${e(v.songQuery)}" autocomplete="off"></div><div id="song-results" aria-live="polite">${playlistHomeResults(v.state, v.songQuery || '')}</div><p class="songbook-footnote">직접 적어두는 개인 플레이리스트예요. 허밍 기록만으로 이 곡을 편하게 부를 수 있는지 판단하지 않아요.</p></div>`;
}

// Only top notes the server checked against their page get a ✓; the page itself is never named or linked.
function recommendationRange(item, listSongs, voice) {
  const range = item.range;
  if (!range) return '<p class="rec-meta">최고음 확인 안 됨</p>';
  if (!range.sourceQuote) return `<p class="rec-meta">원곡 최고음 ${e(koreanNote(range.highestMidi))} (확인 전)</p>`;
  if (!voice) {
    const key = suggestKey(listSongs, range.highestMidi);
    return `<p class="rec-meta">최고음 ${e(koreanNote(range.highestMidi))} ✓${key === null ? '' : `<br>노래방 ${keyLabel(key)} 추천 · 담아둔 곡 기준 어림값`}</p>`;
  }
  const shift = candidateShift(voice.voiceType, item.vocal ?? null);
  const gap = range.highestMidi + shift - voice.comfortableHighMidi;
  const notes = [gap > 0 ? keyHint(gap) : '', shift < 0 ? '한 옥타브 아래 기준' : '', item.vocal === 'mixed' ? '듀엣 곡' : ''].filter(Boolean);
  return `${rangeBar(gap)}<p class="rec-meta">최고음 ${e(koreanNote(range.highestMidi))} ✓ · ${zoneText(gap)}${notes.map(n => ` · ${n}`).join('')}</p>`;
}

function recommendationCard(item, index, listSongs, voice) {
  const range = recommendationRange(item, listSongs, voice);
  return `<article class="rec-card"><p class="rec-title"><strong>${e(item.title)}</strong>${item.artist ? ` · ${e(item.artist)}` : ''}</p><p class="rec-reason">${e(item.reason)}</p>${range}<p class="rec-meta">${outLink(item.songUrl, '곡 정보 ↗')}</p><div class="rec-actions"><button class="button small" data-action="rec-add" data-id="${index}">＋ 담기</button><button class="button quiet small" data-action="rec-nope" data-id="${index}">별로예요</button></div></article>`;
}

export function recommendationSection(v, playlist) {
  const id = e(playlist.id);
  const byId = songsById(v.state);
  const listSongs = playlist.songIds.map(songId => byId.get(songId)).filter(Boolean);
  let body;
  if (listSongs.length < PLAYLIST_LIMITS.minSongsForRecs) body = '<div class="playlist-note">곡을 3개 이상 담으면 어울리는 곡을 추천해 드려요.</div>';
  else if (v.recLoading === playlist.id) body = '<div class="playlist-note" role="status">어울리는 곡을 찾고 있어요… 웹에서 출처를 확인하느라 조금 걸릴 수 있어요.</div>';
  else {
    const error = v.recError?.id === playlist.id ? `<div class="error-box" role="alert">${e(v.recError.message)} <button class="text-button" data-action="rec-fetch" data-id="${id}">다시 시도</button></div>` : '';
    const owned = v.state.songs;
    const items = (playlist.recommendations?.items || []).map((item, index) => ({ item, index })).filter(({ item }) => !owned.some(song => sameSong(song, item)));
    const voice = v.state.settings.voice;
    const nudge = voice ? '' : '<p class="voice-nudge">내 음역을 알려주면 실력에 맞춰 골라드려요 <button class="text-button" data-action="voice-start">알려주기</button></p>';
    const recs = playlist.recommendations;
    const fallback = recs?.fallback ? `<p class="playlist-note">확인된 ${recs.intent === 'comfortable' ? '편한' : '도전'} 곡을 못 찾아 분위기로 골랐어요.</p>` : '';
    body = nudge + (!playlist.recommendations
      ? `${error}<button class="button secondary" data-action="rec-fetch" data-id="${id}">추천 받기</button><p class="subtle">리스트 이름과 담긴 곡을 보고, 실제로 있는 곡인지 확인한 곡만 골라 드려요.</p>`
      : `${error}${fallback}${items.length ? `<div class="rec-list">${items.map(({ item, index }) => recommendationCard(item, index, listSongs, voice)).join('')}</div>` : '<div class="playlist-note">받은 추천을 모두 확인했어요.</div>'}<button class="button secondary" data-action="rec-fetch" data-id="${id}">다른 곡 추천 받기</button>`);
  }
  return `<section class="rec-section" aria-live="polite"><div class="rec-head"><h2>이 리스트에 어울리는 곡</h2><span class="rec-badge">AI 추천</span></div>${body}</section>`;
}

export function aiConsentView(v) {
  const back = 'data-action="consent-back"';
  return `<div class="narrow"><button class="back-button" ${back}>‹ 돌아가기</button><div class="lesson-header"><h1>AI 추천과 곡 검색을 쓰기 전에</h1><p>추천과 최고음 찾기는 OpenAI로, 곡 검색은 MusicBrainz로 아래 정보를 보내요.<br>처음 한 번만 확인할게요.</p></div><section class="surface"><h2>OpenAI로 보내는 정보</h2><ul class="instructions"><li>플레이리스트 이름</li><li>이 리스트에 담긴 곡의 제목·가수·내 노래방 키·원곡 최고음</li><li>이미 담아둔 모든 곡의 제목·가수 (같은 곡을 다시 추천하지 않으려고요)</li><li>이 리스트에서 ‘별로예요’를 누른 곡</li><li>내 편한 최고음 (알려주신 경우)</li></ul><p class="subtle">곡 정보와 온보딩의 ‘최고음 찾기’는 그 곡의 제목과 가수만 보내요.</p><h2>MusicBrainz로 보내는 정보</h2><p class="subtle">곡을 찾을 때 입력한 검색어만 보내요. MusicBrainz는 누구나 쓰는 공개 음악 데이터베이스예요.</p><p><strong>녹음, 허밍 기록, 연습 기록은 보내지 않아요.</strong></p><p class="subtle">동의는 ‘나의 기록 → 기록과 개인정보 관리’에서 언제든 철회할 수 있어요.</p></section><div class="action-row"><button class="button" data-action="ai-consent-accept">동의하고 계속하기</button><button class="button secondary" ${back}>돌아가기</button></div></div>`;
}

export function playlistView(v) {
  const playlist = v.state.playlists.find(p => p.id === v.selectedPlaylistId);
  if (!playlist) return playlistHomeView(v);
  const byId = songsById(v.state);
  const songs = playlist.songIds.map(id => byId.get(id)).filter(Boolean).reverse();
  const id = e(playlist.id);
  const list = songs.length
    ? `<div class="playlist-songs">${songs.map(song => `<article class="playlist-song"><button class="song-title" data-action="song-detail" data-id="${e(song.id)}">${e(song.title)}<span aria-hidden="true">↗</span></button><p class="song-artist">${e(song.artist) || '가수 미입력'}</p><div class="playlist-song-meta"><span class="song-key">내 키 <strong>${keyLabel(song.keyOffset)}</strong></span><button class="text-button" data-action="playlist-remove-song" data-id="${e(song.id)}">빼기</button></div></article>`).join('')}</div>`
    : '<div class="playlist-note">아직 담은 곡이 없어요. ‘＋ 곡 담기’로 시작해 보세요.</div>';
  return `<div class="narrow">${backToLists()}<section class="playlist-heading"><h1>${e(playlist.name)}</h1><p class="song-result-count">${songs.length}곡</p><div class="playlist-actions"><button class="button" data-action="song-add" data-id="${id}">＋ 곡 담기</button><button class="text-button" data-action="playlist-rename" data-id="${id}">이름 바꾸기</button><button class="text-button" data-action="playlist-delete" data-id="${id}">삭제</button></div></section>${list}${recommendationSection(v, playlist)}</div>`;
}

export function playlistFormView(v) {
  const draft = v.playlistDraft || {};
  const editing = Boolean(draft.id);
  const cancel = editing ? `data-action="playlist-open" data-id="${e(draft.id)}"` : 'data-action="songs"';
  return `<div class="narrow"><button class="back-button" ${cancel}>‹ 돌아가기</button><div class="lesson-header"><h1>${editing ? '플레이리스트 이름을 바꿔요.' : '새 플레이리스트를 만들어요.'}</h1><p>내가 알아보기 쉬운 이름이면 돼요.<br>예: 어렵지 않게 부르는 거, 도전하기</p></div><form id="playlist-form" class="song-form"><div class="form-field"><label for="playlist-name">플레이리스트 이름 <span>필수</span></label><input id="playlist-name" name="name" required maxlength="30" value="${e(draft.name)}" placeholder="예: 비 오는 날 부를 곡" autocomplete="off"></div>${v.playlistError ? `<div class="error-box" role="alert">${e(v.playlistError)}</div>` : ''}<div class="action-row"><button class="button" type="submit" ${v.busy ? 'disabled' : ''}>${editing ? '이름 바꾸기' : '만들기'}</button><button class="button secondary" type="button" ${cancel}>돌아가기</button></div></form></div>`;
}

export function allSongsView(v) {
  return `<div class="songbook">${backToLists()}<div class="songbook-heading"><div><h1>모든 곡</h1><p>플레이리스트와 상관없이 담아둔 곡 전체예요.</p></div><button class="button" data-action="song-add">＋ 곡 담기</button></div>${songResults(v.state.songs, '')}</div>`;
}
