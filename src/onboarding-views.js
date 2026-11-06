// Screens for '내 음역': intro (doubles as the v2 consent), picking songs, the staff result, manual entry,
// and the small card on the playlist home.
import { koreanNote, noteLabel } from './notes.js';
import { staffSvg } from './range-graphics.js';
import { octaveChoice, RANGE_BOUNDS } from './vocal-range.js';
import { onboardingResult } from './onboarding.js';
import { hasCurrentConsent } from './consent.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const keyText = value => value === 0 ? '원키' : `${value > 0 ? '+' : '−'}${Math.abs(value)}키`;
const DUET_NOTE = '듀엣·혼성 곡이라 내 파트와 다를 수 있어요';

export function voiceIntroView(v) {
  const consent = hasCurrentConsent(v.state.settings);
  return `<div class="narrow voice-intro"><button class="back-button" data-action="voice-later">‹ 나중에 할게요</button><div class="lesson-header"><p class="eyebrow">뭐 부르지?</p><h1>자신 있게 부르는 곡이 있으세요?</h1><p>몇 곡만 알려주시면 편하게 내는 최고음을 어림해서,<br>실력에 맞는 곡을 추천해 드려요.</p></div><section class="surface"><h2>이렇게 찾아요</h2><ul class="instructions"><li>곡 검색: 입력한 검색어가 TJ미디어 노래방 검색으로 가요(안 되면 MusicBrainz 공개 음악 데이터베이스).</li><li>최고음 찾기: 곡 제목과 가수만 AI(OpenAI)로 가요. 출처 페이지에서 확인된 값만 써요.</li><li>추천을 받을 때는 플레이리스트 이름과 담긴 곡, 내 편한 최고음도 OpenAI로 가요.</li><li>곡 상세 화면: 곡 제목과 가수가 YouTube 검색과 가사 시간 정보 서비스로 가요. 가사는 화면에만 보여주고 저장하지 않아요.</li></ul><p class="subtle">연습 피드백을 받을 때 연습 측정값(목표음, 낸 음, 흔들림, 체감)이 OpenAI로 가요. 노래를 따라 부르고 받을 때는 곡 제목·가수와 구간 이름, 가사 줄 번호도 함께 가요. 녹음과 가사 글자는 보내지 않아요.</p><p><strong>녹음은 보내지 않아요. 연습 측정값은 피드백을 받을 때만 보내요.</strong></p>${consent ? '' : '<p class="subtle">동의는 ‘나의 기록 → 기록과 개인정보 관리’에서 언제든 철회할 수 있어요.</p>'}</section><div class="action-row">${consent ? '<button class="button" data-action="voice-begin">곡 고르기</button>' : '<button class="button" data-action="voice-consent-accept">동의하고 곡 고르기</button>'}<button class="button secondary" data-action="voice-manual">최고음을 직접 입력할게요</button></div><div class="action-row center"><button class="text-button" data-action="voice-later">나중에 할게요</button></div></div>`;
}

function voiceTypePicker(o) {
  const option = (id, label) => `<button class="voice-type-option" type="button" data-action="voice-type" data-id="${id}" aria-pressed="${o.voiceType === id}">${label}</button>`;
  return `<div class="voice-type" role="group" aria-label="주로 부르는 키"><span>주로 부르는 키</span>${option('male', '남자 키')}${option('female', '여자 키')}</div>`;
}

const SEARCH_STATUS = {
  loading: '찾고 있어요…',
  slow: '조금 오래 걸려요. 잠시만 기다려 주세요.',
  empty: '찾는 곡이 없어요. 철자를 확인하거나 아래에서 직접 적어 주세요.',
  error: '곡 검색이 안 돼요. 잠시 후 다시 찾거나 아래에서 직접 적어 주세요.',
};

/** Search results with their state: TJ numbers, fallback and retry notes, the artist list and '더 보기'. */
export function searchResultsHtml(o) {
  const s = o.search;
  if (s.status === 'loading' || s.status === 'slow') return `<p class="subtle" role="status">${SEARCH_STATUS[s.status]}</p>`;
  if (s.status === 'error') return `<p class="error-box" role="alert">${SEARCH_STATUS.error}</p>`;
  if (s.status !== 'done') return '';
  if (!s.results.length) return `<p class="subtle">${SEARCH_STATUS.empty}</p>`;
  const notes = [s.source === 'musicbrainz' ? '노래방 번호 없이 찾은 결과예요' : '', s.retriedWith ? `‘${e(s.retriedWith)}’로 찾은 결과예요` : ''].filter(Boolean)
    .map(note => `<p class="subtle search-note">${note}</p>`).join('');
  const artistList = s.mode === 'search' && s.artist ? `<button class="text-button" data-action="search-artist">‘${e(s.artist)}’ 곡 전체 보기</button>` : '';
  const heading = s.mode === 'artist' && s.artistTitle ? `<p class="subtle">‘${e(s.artistTitle)}’ 곡 전체 · ${s.results.length}곡${s.hasMore ? ' 이상' : ''}</p>` : '';
  const rows = s.results.slice(0, s.shown).map((r, i) => `<button class="voice-result-item" data-action="voice-add" data-id="${i}"><span>${e(r.title)}<small>${r.artist ? ` · ${e(r.artist)}` : ''}${r.tjNumber ? ` · TJ ${e(r.tjNumber)}` : ''}</small></span><span aria-hidden="true">＋</span></button>`).join('');
  const more = s.loadingMore ? '<p class="subtle" role="status">더 불러오고 있어요…</p>'
    : s.shown < s.results.length || s.hasMore ? '<button class="button secondary small" data-action="search-more">더 보기</button>' : '';
  return `${notes}${artistList}${heading}<div class="voice-results">${rows}</div>${more}`;
}

/** The search box with its pop toggle; shared by onboarding and '곡 찾아 담기'. */
export function searchPanelHtml(o) {
  return `<div class="form-field"><label for="voice-search">곡 제목이나 가수로 찾기</label><input id="voice-search" class="song-search" type="search" maxlength="120" value="${e(o.query)}" placeholder="예: 취중고백, 엠씨더맥스" autocomplete="off"></div><label class="checkbox-label search-pop"><input type="checkbox" id="search-pop"${o.scope === 'all' ? ' checked' : ''}> <span>외국 노래 포함</span></label><div id="voice-results" aria-live="polite">${searchResultsHtml(o)}</div>`;
}

function pickStatus(p) {
  if (p.status === 'looking') return `<span class="pick-status">${p.slow ? '최고음 찾는 중… 조금 오래 걸려요' : '최고음 찾는 중…'}</span>`;
  if (p.status === 'found') return `<span class="pick-status ok">${p.range.sourceQuote ? '최고음 찾음 ✓' : '최고음'} ${e(koreanNote(p.range.highestMidi))}</span>`;
  if (p.status === 'missing') return '<span class="pick-status no">최고음을 못 찾았어요 · 계산에서 빠져요</span>';
  return '<span class="pick-status no">지금은 찾지 못했어요</span>';
}

function pickRow(p, o) {
  const choice = octaveChoice(o.voiceType, p.vocal);
  const keys = Array.from({ length: 25 }, (_, i) => i - 12).map(value => `<option value="${value}"${value === p.keyOffset ? ' selected' : ''}>${keyText(value)}</option>`).join('');
  const octave = choice ? `<label class="checkbox-label pick-octave"><input type="checkbox" data-action="voice-octave" data-id="${e(p.key)}"${p.octaveShift !== 0 ? ' checked' : ''}> <span>${choice.shift < 0 ? '한 옥타브 아래로 불렀어요' : '한 옥타브 위로 불렀어요'}</span></label>` : '';
  const duet = p.vocal === 'mixed' ? `<p class="field-help">${DUET_NOTE}</p>` : '';
  return `<article class="voice-pick-row"><div class="pick-head"><span class="pick-title">${e(p.title)}${p.artist ? `<small> · ${e(p.artist)}</small>` : ''}${p.tjNumber ? `<small> · TJ ${e(p.tjNumber)}</small>` : ''}</span>${pickStatus(p)}</div><div class="pick-controls"><label class="pick-key"><span>${o.kind === 'songs' ? '내 노래방 키' : '불렀던 키'}</span><select name="pickKey" data-key="${e(p.key)}">${keys}</select></label><button class="text-button" data-action="voice-remove" data-id="${e(p.key)}">빼기</button></div>${octave}${duet}</article>`;
}

/** A title typed by hand becomes a pick too (with its own top-note lookup). */
function directFormHtml() {
  return '<form id="voice-direct-form" class="voice-direct"><p class="field-help">검색에 없으면 직접 적어 주세요.</p><input name="title" maxlength="120" placeholder="노래 제목" required autocomplete="off"><input name="artist" maxlength="120" placeholder="가수" autocomplete="off"><button class="button secondary small" type="submit">추가</button></form>';
}

export function voicePicksHtml(o) {
  return o.picks.length ? o.picks.map(p => pickRow(p, o)).join('') : '<p class="subtle">아직 고른 곡이 없어요.</p>';
}

/** The bottom buttons for either screen. */
export function pickActionsHtml(o) {
  if (o.kind !== 'songs') return voiceActionsHtml(o);
  if (o.waiting) return '<p class="subtle" role="status">아직 최고음을 찾고 있는 곡이 있어요. 다 찾으면 바로 담을게요.</p><button class="button secondary" data-action="pick-save-now">기다리지 않고 담기</button>';
  return `<button class="button" data-action="pick-save"${o.picks.length ? '' : ' disabled'}>${o.picks.length}곡 담기</button>`;
}

export function songPickView(v) {
  const o = v.onboarding;
  const list = o.playlistId ? (v.state.playlists || []).find(p => p.id === o.playlistId) : null;
  return `<div class="narrow voice-pick song-pick"><button class="back-button" data-action="song-back">‹ 돌아가기</button><div class="lesson-header"><h1>곡 찾아 담기</h1><p>${list ? `‘${e(list.name)}’에 담아요. ` : ''}검색해서 고르면 최고음은 출처에서 찾아 채워요.</p></div>${searchPanelHtml(o)}${directFormHtml()}<p class="field-help">키·음역·메모까지 한 곡씩 적으려면 <button class="text-button" data-action="pick-manual">곡 정보 직접 입력</button></p><h2 class="voice-picked-title">고른 곡 ${o.picks.length}</h2><div id="voice-picks" class="voice-picks" aria-live="polite">${voicePicksHtml(o)}</div><div id="voice-actions" class="action-row">${pickActionsHtml(o)}</div></div>`;
}

export function voiceActionsHtml(o) {
  const ready = Boolean(o.voiceType) && o.picks.some(p => p.status === 'found');
  const waiting = o.waiting ? '<p class="subtle" role="status">아직 최고음을 찾고 있는 곡이 있어요. 다 찾으면 결과를 보여 드릴게요.</p>' : '';
  const hint = !o.voiceType ? '<p class="subtle">주로 부르는 키를 먼저 골라 주세요.</p>' : '';
  return `${waiting}${hint}<button class="button" data-action="voice-result"${ready && !o.waiting ? '' : ' disabled'}>결과 보기</button>`;
}

export function voicePickView(v) {
  const o = v.onboarding;
  return `<div class="narrow voice-pick"><button class="back-button" data-action="voice-intro">‹ 돌아가기</button><div class="lesson-header"><h1>자신 있게 부르는 곡</h1><p>고르는 동안 최고음을 미리 찾아둘게요. 불렀던 키도 골라 주세요.</p></div>${voiceTypePicker(o)}${searchPanelHtml(o)}${directFormHtml()}<h2 class="voice-picked-title">고른 곡 ${o.picks.length}</h2><div id="voice-picks" class="voice-picks" aria-live="polite">${voicePicksHtml(o)}</div><div id="voice-actions" class="action-row">${voiceActionsHtml(o)}</div></div>`;
}

function basisLine(p) {
  if (p.status !== 'found') return `<li class="muted">‘${e(p.title)}’은(는) 최고음을 못 찾아 계산에서 뺐어요</li>`;
  const high = p.range.highestMidi;
  const sung = high + p.keyOffset + p.octaveShift;
  const octave = p.octaveShift < 0 ? ', 옥타브 아래로' : p.octaveShift > 0 ? ', 옥타브 위로' : '';
  const shifted = sung === high ? '' : ` → ${e(koreanNote(sung))}`;
  const duet = p.vocal === 'mixed' ? `<small> · ${DUET_NOTE}</small>` : '';
  return `<li>${e(p.title)} (${keyText(p.keyOffset)}${octave}) ${e(koreanNote(high))}${shifted}${duet}</li>`;
}

function listenStaff(midi) {
  return `<button class="staff-button" data-action="voice-listen" data-id="${midi}" aria-label="${e(noteLabel(midi))} 들어보기">${staffSvg(midi)}</button>`;
}

export function voiceResultView(v) {
  const o = v.onboarding;
  const { midi } = onboardingResult(o);
  if (midi === null) return `<div class="narrow"><button class="back-button" data-action="voice-begin">‹ 곡 다시 고르기</button><div class="empty"><h2>최고음을 찾은 곡이 아직 없어요</h2><p>다른 곡을 고르거나 직접 입력해 주세요.</p><button class="button" data-action="voice-manual">직접 입력하기</button></div></div>`;
  return `<div class="narrow voice-result"><button class="back-button" data-action="voice-begin">‹ 곡 다시 고르기</button><div class="lesson-header"><h1>이 정도까지 편하게 내시는 것 같아요</h1></div><section class="surface voice-staff">${listenStaff(midi)}<p class="voice-note">${e(noteLabel(midi))}</p><p class="subtle">♪ 음표를 누르면 피아노로 들려드려요 · 진성 기준 · 옅은 띠는 도전 구간이에요</p></section><section class="surface"><h2>이렇게 계산했어요</h2><ul class="voice-basis">${o.picks.map(basisLine).join('')}</ul></section><label class="checkbox-label"><input type="checkbox" id="voice-create-list"${o.createList ? ' checked' : ''}><span>이 곡들로 '자신 있는 곡' 플레이리스트 만들기</span></label><div class="action-row"><button class="button" data-action="voice-save"${v.busy ? ' disabled' : ''}>이대로 저장</button><button class="button secondary" data-action="voice-manual">직접 고치기</button></div></div>`;
}

export function voiceManualView(v) {
  const o = v.onboarding;
  const m = o.manualMidi;
  const back = o.picks.length ? 'voice-begin' : 'voice-intro';
  return `<div class="narrow voice-manual"><button class="back-button" data-action="${back}">‹ 돌아가기</button><div class="lesson-header"><h1>편하게 내는 최고음을 골라 주세요</h1><p>진성으로 불러도 편한 가장 높은 음이에요. 대략이어도 괜찮아요.</p></div>${voiceTypePicker(o)}<section class="surface voice-staff">${listenStaff(m)}<div class="voice-stepper"><button class="button secondary small" data-action="voice-step" data-id="-1"${m <= RANGE_BOUNDS.min ? ' disabled' : ''} aria-label="반음 내리기">−</button><strong class="voice-note">${e(noteLabel(m))}</strong><button class="button secondary small" data-action="voice-step" data-id="1"${m >= RANGE_BOUNDS.max ? ' disabled' : ''} aria-label="반음 올리기">＋</button></div></section><div class="action-row"><button class="button" data-action="voice-manual-save"${o.voiceType && !v.busy ? '' : ' disabled'}>저장</button></div></div>`;
}

export function voiceCard(state) {
  const voice = state.settings.voice;
  if (!voice) return '<button class="voice-card empty" data-action="voice-start"><span><strong>내 음역 알려주기</strong><small>자신 있는 곡 몇 개로 실력에 맞는 추천을 받아요</small></span><span class="chevron" aria-hidden="true">›</span></button>';
  return `<div class="voice-card"><span><small>편하게 내는 최고음</small><strong>${e(noteLabel(voice.comfortableHighMidi))}</strong></span><button class="text-button" data-action="voice-start">다시 고르기</button></div>`;
}
