import { songResults, keyLabel } from './song-views.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const songsById = state => new Map(state.songs.map(song => [song.id, song]));
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
  return `<div class="songbook"><div class="songbook-heading"><div><p class="eyebrow">뭐 부르지?</p><h1>내 플레이리스트</h1><p>부르는 곡을 내 기준으로 나눠 담아요.<br>리스트마다 어울리는 곡도 추천받을 수 있어요.</p></div><button class="button" data-action="song-add">＋ 곡 담기</button></div><div class="song-tools"><label class="song-search-label" for="song-search">제목 · 가수 검색</label><input id="song-search" class="song-search" type="search" maxlength="120" placeholder="오늘 떠오른 노래가 있나요?" value="${e(v.songQuery)}" autocomplete="off"></div><div id="song-results" aria-live="polite">${playlistHomeResults(v.state, v.songQuery || '')}</div><p class="songbook-footnote">직접 적어두는 개인 플레이리스트예요. 허밍 기록만으로 이 곡을 편하게 부를 수 있는지 판단하지 않아요.</p></div>`;
}

// Filled in by the recommendation task; the playlist page already reserves its place.
export function recommendationSection() {
  return '';
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
