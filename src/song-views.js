import { noteName } from './pitch.js';
import { searchSongs } from './songs.js';
import { koreanNote } from './notes.js';
import { rangeBar, zoneText } from './range-graphics.js';
import { keyHint } from './vocal-range.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const note = midi => noteName(midi)?.label || '미입력';
export const keyLabel = value => value === 0 ? '원키' : `${value > 0 ? '+' : ''}${value} 반음`;
// A checked top note (the server found the quote on its page) gets ✓; the page itself is never named or linked.
const topNote = song => song.highestMidi === null ? '' : `${koreanNote(song.highestMidi)}${song.rangeQuote ? ' ✓' : ''}`;
const OCTAVES = [[0, '원래 높이'], [-12, '한 옥타브 아래'], [12, '한 옥타브 위']];
const octaveName = shift => OCTAVES.find(([value]) => value === shift)?.[1] ?? '원래 높이';
const back = () => '<button class="back-button" data-action="song-back">‹ 돌아가기</button>';

export function songResults(songs, query = '') {
  const matches = searchSongs(songs, query);
  if (!matches.length) return `<div class="empty song-empty"><div class="song-empty-symbol" aria-hidden="true">♫</div><h2>${songs.length ? '찾는 곡이 아직 없어요' : '떠오른 한 곡을 적어볼까요?'}</h2><p>${songs.length ? '다른 제목이나 가수로 찾아보세요.' : '제목만 적어도 충분해요.<br>음역과 키는 나중에 천천히 채워가요.'}</p><button class="button" data-action="song-add">＋ ${songs.length ? '새 곡 추가하기' : '첫 곡 담기'}</button></div>`;
  return `<p class="song-result-count">${matches.length}곡${query ? ` · ‘${e(query)}’ 검색 결과` : ''}</p><div class="song-list">${matches.slice().reverse().map(song => `<article class="song-card"><div class="song-card-top"><span class="song-key">내 키 <strong>${keyLabel(song.keyOffset)}</strong></span></div><button class="song-title" data-action="song-detail" data-id="${e(song.id)}">${e(song.title)}<span aria-hidden="true">↗</span></button><p class="song-artist">${e(song.artist) || '가수 미입력'}</p><dl class="song-facts"><div><dt>원곡 키</dt><dd>${e(song.originalKey) || '미입력'}</dd></div><div><dt>원곡 최고음</dt><dd>${e(topNote(song)) || '미입력'}</dd></div></dl>${song.note ? `<p class="song-note-preview">${e(song.note)}</p>` : ''}<div class="song-card-actions"><button class="text-button" data-action="song-edit" data-id="${e(song.id)}">정보 수정</button>${song.lyricsUrl ? `<a class="source-link" href="${e(song.lyricsUrl)}" target="_blank" rel="noopener noreferrer">가사 페이지 열기 ↗</a>` : ''}</div></article>`).join('')}</div>`;
}

function noteOptions(selected) {
  const values = Array.from({ length: 88 }, (_, i) => i + 21);
  if (selected !== null && selected !== undefined && selected !== '' && !values.includes(Number(selected))) values.unshift(Number(selected));
  return `<option value="">모름 / 나중에 입력</option>${values.map(midi => `<option value="${midi}" ${Number(selected) === midi && selected !== '' && selected !== null ? 'selected' : ''}>${e(note(midi))}</option>`).join('')}`;
}

function playlistPicker(v, s) {
  const playlists = v.state?.playlists || [];
  const selected = s.playlistIds || [];
  const options = playlists.length
    ? playlists.map(p => `<label class="checkbox-label"><input type="checkbox" name="playlistIds" value="${e(p.id)}"${selected.includes(p.id) ? ' checked' : ''}><span>${e(p.name)}</span></label>`).join('')
    : '<p class="field-help">플레이리스트를 만들면 여기서 고를 수 있어요.</p>';
  return `<fieldset class="form-field playlist-pick"><legend>담을 플레이리스트</legend>${options}</fieldset>`;
}

export function songFormView(v) {
  const s = v.songDraft || {};
  const editing = Boolean(s.id);
  return `<div class="narrow">${back()}<div class="lesson-header"><h1>${editing ? '곡 정보를 다듬어요.' : '부르고 싶은 곡을 담아요.'}</h1><p>제목만 있어도 저장할 수 있어요.<br>나머지는 아는 만큼, 필요할 때 채워요.</p></div><form id="song-form" class="song-form"><div class="form-field"><label for="song-title">노래 제목 <span>필수</span></label><input id="song-title" name="title" required maxlength="120" value="${e(s.title)}" placeholder="부르고 싶은 노래 제목" autocomplete="off"></div><div class="form-field"><label for="song-artist">가수</label><input id="song-artist" name="artist" maxlength="120" value="${e(s.artist)}" placeholder="가수 이름" autocomplete="off"></div>${playlistPicker(v, s)}<div class="form-section"><h2>내가 기억해둘 정보</h2><div class="form-two"><div class="form-field"><label for="song-original-key">원곡 키</label><input id="song-original-key" name="originalKey" maxlength="40" value="${e(s.originalKey)}" placeholder="예: C major, A minor"></div><div class="form-field"><label for="song-key-offset">내 노래방 키</label><select id="song-key-offset" name="keyOffset">${Array.from({ length: 25 }, (_, i) => i - 12).map(value => `<option value="${value}" ${Number(s.keyOffset ?? 0) === value ? 'selected' : ''}>${keyLabel(value)}${value === 0 ? ' (±0)' : ''}</option>`).join('')}</select></div></div><p class="field-help">원곡 키는 곡의 조성이에요. 내 노래방 키는 원키에서 몇 반음 올리거나 내릴지 적는 설정이에요.</p><div class="form-two"><div class="form-field"><label for="song-highest">원곡 진성 최고음</label><select id="song-highest" name="highestMidi">${noteOptions(s.highestMidi)}</select></div><div class="form-field"><label for="song-falsetto">가성 최고음</label><select id="song-falsetto" name="falsettoHighestMidi">${noteOptions(s.falsettoHighestMidi)}</select></div></div><div class="form-two"><div class="form-field"><label for="song-lowest">원곡 최저음</label><select id="song-lowest" name="lowestMidi">${noteOptions(s.lowestMidi)}</select></div><div class="form-field"><label for="song-octave">부르는 옥타브</label><select id="song-octave" name="octaveShift">${OCTAVES.map(([value, label]) => `<option value="${value}"${Number(s.octaveShift ?? 0) === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div></div><p class="field-help">최고음만 알아도 돼요. C4는 가온도예요. 가성 최고음과 최저음은 알 때만 적어요.</p><input type="hidden" name="rangeSourceUrl" value="${e(s.rangeSourceUrl)}"><input type="hidden" name="rangeQuote" value="${e(s.rangeQuote)}"><button class="button secondary small" type="button" data-action="song-range" ${v.busy ? 'disabled' : ''}>${v.busy === 'range' ? '출처를 확인하고 있어요…' : '최고음 찾기 (AI)'}</button>${s.rangeQuote ? '<p class="field-help">최고음은 출처에서 확인한 값이에요 ✓ 값을 바꾸면 확인 표시가 지워져요.</p>' : ''}</div><div class="form-field"><label for="song-lyrics">가사 링크</label><input id="song-lyrics" name="lyricsUrl" type="url" maxlength="2048" value="${e(s.lyricsUrl)}" placeholder="https://…" inputmode="url"><p class="field-help">가사를 볼 수 있는 공식 음원 서비스 등의 페이지를 연결해요.</p></div><div class="form-field"><label for="song-note">나를 위한 메모</label><textarea id="song-note" name="note" maxlength="1000" rows="4" placeholder="예: 노래방에서 -2가 편했어요. 후렴 진입 전에 숨을 챙기기.">${e(s.note)}</textarea></div>${v.songError ? `<div class="error-box" role="alert">${e(v.songError)}</div>` : ''}<div class="action-row"><button class="button" type="submit" ${v.busy ? 'disabled' : ''}>${v.busy ? '저장하고 있어요' : editing ? '수정 저장하기' : '저장하기'}</button><button class="button secondary" type="button" data-action="song-back">돌아가기</button></div></form></div>`;
}

function rangeFacts(song) {
  const sung = song.highestMidi === null ? null : song.highestMidi + song.keyOffset + song.octaveShift;
  const top = song.highestMidi === null ? '아직 미입력' : `진성 ${topNote(song)}${song.falsettoHighestMidi !== null ? ` (가성 ${koreanNote(song.falsettoHighestMidi)})` : ''}`;
  return `<div><dt>원곡 최고음</dt><dd>${e(top)}</dd></div>${song.lowestMidi !== null ? `<div><dt>원곡 최저음</dt><dd>${e(koreanNote(song.lowestMidi))}</dd></div>` : ''}<div><dt>내 노래방 키</dt><dd>${keyLabel(song.keyOffset)}</dd></div>${song.octaveShift ? `<div><dt>부르는 옥타브</dt><dd>${octaveName(song.octaveShift)}</dd></div>` : ''}${sung !== null && sung !== song.highestMidi && sung >= 0 && sung <= 127 ? `<div><dt>내가 부르는 최고음</dt><dd>${e(koreanNote(sung))}</dd></div>` : ''}`;
}

function myRangeBar(song, voice) {
  if (!voice || song.highestMidi === null) return '';
  const gap = song.highestMidi + song.keyOffset + song.octaveShift - voice.comfortableHighMidi;
  return `<div class="song-range">${rangeBar(gap)}<p class="subtle">내 편한 최고음 기준 · ${zoneText(gap)}${gap > 0 ? ` · ${keyHint(gap)}` : ''}</p></div>`;
}

export function songDetailView(v) {
  const song = (v.state.songs || []).find(s => s.id === v.selectedSongId);
  if (!song) return `<div class="narrow">${back()}<div class="empty"><h2>곡을 찾지 못했어요</h2><p>삭제되었거나 다른 기기에서 바뀐 곡일 수 있어요.</p></div></div>`;
  const voice = v.state.settings?.voice ?? null;
  const lists = (v.state.playlists || []).filter(p => p.songIds.includes(song.id)).map(p => e(p.name));
  const aiNote = song.origin !== 'ai' ? '' : voice ? '<div class="hint">AI 추천으로 담은 곡 · 원키로 담았어요. 불러본 뒤 키를 고쳐 주세요.</div>' : '<div class="hint">AI 추천으로 담은 곡 · 키는 추천값이에요. 불러본 뒤 곡 정보에서 고쳐 주세요.</div>';
  const origin = song.rangeQuote ? '최고음은 출처에서 확인한 값이에요. ' : song.rangeSourceUrl ? '예전에 AI가 찾은 값이라 아직 확인 전이에요. ' : '직접 입력한 정보예요. ';
  return `<div class="narrow">${back()}<section class="song-detail-heading"><h1>${e(song.title)}</h1><p>${e(song.artist) || '가수 미입력'}</p><p class="song-lists">${lists.length ? `담긴 플레이리스트: ${lists.join(', ')}` : '아직 어느 플레이리스트에도 없어요.'}</p>${aiNote}</section><section class="surface"><h2>내가 적어둔 곡 정보</h2><dl class="song-detail-facts"><div><dt>원곡 키</dt><dd>${e(song.originalKey) || '아직 미입력'}</dd></div>${rangeFacts(song)}</dl>${myRangeBar(song, voice)}<p class="subtle">${origin}원곡·라이브·편곡 버전은 키나 음역이 다를 수 있어요.</p>${song.lyricsUrl ? `<a class="button secondary" href="${e(song.lyricsUrl)}" target="_blank" rel="noopener noreferrer">가사 페이지 열기 ↗</a>` : ''}</section><section class="surface"><h2>나를 위한 메모</h2><p class="song-full-note">${song.note ? e(song.note) : '아직 메모가 없어요. 직접 불러본 느낌을 남겨보세요.'}</p></section><div class="action-row"><button class="button" data-action="song-edit" data-id="${e(song.id)}">곡 정보 수정</button><button class="button quiet" data-action="song-delete" data-id="${e(song.id)}">곡 삭제</button></div><p class="subtle">곡과 플레이리스트도 이 기기에 저장돼요. ‘나의 기록 → 기록과 개인정보 관리’에서 함께 백업할 수 있어요.</p></div>`;
}
