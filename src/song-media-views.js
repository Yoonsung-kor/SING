// The song screen's video part: side buttons above the player, and everything below it (status, change panel,
// lyrics, sections timeline, TJ link, pins). Lyrics arrive as an argument and are never part of the stored song. The player slot itself is never part of these strings, so redrawing them
// leaves a playing video alone. Positions are SVG attributes only (CSP has no inline styles).
import {
  readMedia, hasOtherCandidates, isAligned, pinVideoTime, pinSongTime, formatTime,
  youtubeWatchUrl, youtubeSearchUrl, videoSearchQuery, tjVideoSearchUrl,
} from './song-media.js';
import { exercisesFor } from './exercises.js';
import { spotTime } from './karaoke-file.js';
import { koreanNote } from './notes.js';
import { lineAt } from './hard-spots.js';

/** The song's first lyric line with words and a time: what "the first line" of a karaoke take is matched to. */
export const firstLyricLine = lines => (Array.isArray(lines) ? lines.find(line => line?.text && Number.isFinite(line.t)) ?? null : null);

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const out = (href, text) => `<a class="source-link" href="${e(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const pasteButton = '<button class="text-button" data-action="media-change">링크 붙여넣기</button>';
const PLAYER_ERRORS = { 100: '영상이 지워졌거나 비공개예요', 101: '이 영상은 앱 안에서 재생이 막혀 있어요', 150: '이 영상은 앱 안에서 재생이 막혀 있어요' };
const VIDEO_STATUS = {
  loading: '영상을 찾고 있어요…',
  quota: '오늘은 영상 자동 찾기를 더 할 수 없어요. 링크를 붙여 넣거나 내일 다시 열어 주세요.',
  'not-configured': '영상 자동 찾기가 꺼져 있어요. 유튜브 링크를 붙여 넣어 주세요.',
  failed: '영상을 찾지 못했어요. 잠시 후 다시 열어 주세요.',
};

export const defaultSongUi = () => ({ side: 'mv', consent: false, videos: { mv: 'idle', karaoke: 'idle' }, sections: 'idle', lyrics: 'idle', lyricsStyle: 'karaoke', panel: null, pasteError: '', pinError: '', playerError: null, singing: false, singReport: null, karaoke: null, lyricsSearch: null });

export function currentVideoId(song, side) {
  const entry = readMedia(song)[side];
  return entry && !entry.none ? entry.videoId : null;
}

export function songMediaSides(ui) {
  const side = (id, label) => `<button class="media-side" data-action="media-side" data-id="${id}" aria-pressed="${ui.side === id}">${label}</button>`;
  return `<div class="media-sides" role="group" aria-label="영상 고르기">${side('mv', '원곡')}${side('karaoke', '노래방')}</div>`;
}

function videoStatus(song, media, ui, videoId) {
  const entry = media[ui.side];
  const parts = [];
  if (ui.playerError) parts.push(`<p class="media-status error" role="alert">${PLAYER_ERRORS[ui.playerError.code] ?? '영상을 재생하지 못했어요'} ${out(youtubeWatchUrl(ui.playerError.videoId), '유튜브에서 열기 ↗')}</p>`);
  if (!videoId) {
    if (entry?.none) parts.push(`<p class="media-status">이 곡은 앱 안에서 볼 수 있는 영상을 찾지 못했어요</p><div class="media-links">${out(youtubeSearchUrl(videoSearchQuery(song, ui.side)), '유튜브에서 찾아보기 ↗')}${pasteButton}</div>`);
    else if (VIDEO_STATUS[ui.videos[ui.side]]) parts.push(`<p class="media-status">${VIDEO_STATUS[ui.videos[ui.side]]}</p>${ui.videos[ui.side] === 'loading' ? '' : `<div class="media-links">${pasteButton}</div>`}`);
    else if (!ui.consent) parts.push(`<p class="media-status">영상과 구간을 자동으로 찾으려면 동의가 필요해요</p><div class="media-links"><button class="button small" data-action="media-consent">동의하고 찾기</button>${pasteButton}</div>`);
    else parts.push(`<div class="media-links">${pasteButton}</div>`);
  } else if (ui.side === 'karaoke' && entry.kind === 'mr') parts.push('<p class="media-status">기본 버전을 찾지 못해서 멜로디 제거 버전이에요.</p>');
  else if (ui.side === 'mv' && entry.kind === 'mv') parts.push('<p class="media-status">음원 영상이 없어서 뮤직비디오예요.</p>');
  if (videoId) parts.push('<div class="media-links"><button class="text-button" data-action="media-change">영상 바꾸기</button></div>');
  return parts.join('');
}

function changePanel(song, media, ui) {
  if (ui.panel !== 'change') return '';
  const next = hasOtherCandidates(media[ui.side]) ? '<button class="button secondary small" data-action="media-next">다른 후보</button>' : '';
  return `<div class="media-change">${next}${out(youtubeSearchUrl(videoSearchQuery(song, ui.side)), '유튜브에서 찾아보기 ↗')}<form id="media-paste-form" class="media-paste"><label for="media-link">유튜브 링크</label><input id="media-link" name="link" type="text" inputmode="url" placeholder="https://youtu.be/…" autocomplete="off"><button class="button small" type="submit">넣기</button></form>${ui.pasteError ? `<p class="media-error" role="alert">${e(ui.pasteError)}</p>` : ''}<button class="text-button" data-action="media-panel-close">닫기</button></div>`;
}

const toX = (t, duration) => Math.round(Math.min(1000, Math.max(0, t / duration * 1000)) * 10) / 10;

function sectionsBlock(media, ui, videoId) {
  const sections = media.sections;
  if (sections?.items?.length) {
    const { duration, items } = sections;
    // The audio track follows the release's timing, so it needs no big prompt; a stand-in video does.
    const audio = media[ui.side]?.kind === 'audio';
    const realign = '<button class="text-button" data-action="media-align">다시 맞추기</button>';
    const align = !videoId ? '' : audio && !isAligned(media, videoId)
      ? `<p class="media-aligned">음원이라 구간이 바로 맞아요 · 어긋나 보이면 ${realign}</p>`
      : isAligned(media, videoId)
      ? '<p class="media-aligned">시작을 맞췄어요 · <button class="text-button" data-action="media-align">다시 맞추기</button></p>'
      : '<div class="media-align"><p>첫 소절이 시작되는 순간 눌러 주세요</p><button class="button small" data-action="media-align">지금이 노래 시작</button></div>';
    const segs = items.map((item, i) => {
      const x = toX(item.t, duration);
      return `<rect class="seg ${item.kind}" x="${x}" y="4" width="${Math.max(0, toX(items[i + 1]?.t ?? duration, duration) - x)}" height="16"/>`;
    }).join('');
    const pins = media.pins.map(pin => `<rect class="pin" x="${Math.max(0, toX(pinSongTime(media, pin), duration) - 1.5)}" y="0" width="3" height="24"/>`).join('');
    const chips = items.map((item, i) => `<button class="media-chip ${item.kind}" data-action="media-section" data-id="${i}">${e(item.label)}<small>${formatTime(item.t)}</small></button>`).join('');
    return `${align}<svg class="media-timeline" viewBox="0 0 1000 24" preserveAspectRatio="none" data-action="media-seek" role="img" aria-label="곡 전체 흐름">${segs}${pins}<line id="media-head" class="head" x1="0" x2="0" y1="0" y2="24"/></svg><div class="media-times"><span>0:00</span><span>${formatTime(duration)}</span></div><div class="media-sections">${chips}</div>`;
  }
  if (sections?.none) return `<p class="media-status">이 곡은 구간을 찾지 못했어요. 신경 쓰이는 곳은 메모로 표시해 보세요.${ui.consent && ui.lyrics !== 'none' && ui.panel !== 'lyrics' ? ` · ${FIND_LYRICS('가사 직접 찾기')}` : ''}</p>`;
  // A pasted video plays without consent; say what consent would add (the no-video prompt already asks).
  if (!ui.consent && videoId) return '<p class="media-status">구간과 가사를 보려면 동의가 필요해요 · <button class="text-button" data-action="media-consent">동의하고 찾기</button></p>';
  if (ui.sections === 'loading') return '<p class="media-status">구간을 찾고 있어요…</p>';
  if (ui.sections === 'busy') return '<p class="media-status">구간 정보를 불러오지 못했어요 · <button class="text-button" data-action="media-sections-retry">다시 시도</button></p>';
  return '';
}

function pinsBlock(media, ui, videoId) {
  const timed = media.pins.map(pin => ({ pin, t: videoId ? pinVideoTime(media, pin, videoId) : pin.t })).sort((a, b) => a.t - b.t);
  const form = ui.panel === 'pin' ? `<form id="media-pin-form" class="media-pin-form"><input name="text" maxlength="60" placeholder="예: 여기 숨 미리 쉬기" autocomplete="off" aria-label="메모 내용"><button class="button small" type="submit">저장</button><button class="text-button" type="button" data-action="media-pin-cancel">취소</button></form>${ui.pinError ? `<p class="media-error" role="alert">${e(ui.pinError)}</p>` : ''}` : '';
  const list = timed.length
    ? timed.map(({ pin, t }) => `<li data-pin-id="${e(pin.id)}" data-t="${t}"><button class="media-pin-time" data-action="media-pin-go" data-id="${e(pin.id)}">${formatTime(t)}</button><span>${e(pin.text)}</span><button class="media-pin-delete" data-action="media-pin-delete" data-id="${e(pin.id)}" aria-label="메모 지우기">×</button></li>`).join('')
    : '<li class="media-empty">아직 메모가 없어요. 신경 쓰이는 곳에서 눌러 남겨요.</li>';
  return `<section class="surface media-pins"><h2>구간 메모</h2>${videoId ? '<button class="button secondary small" data-action="media-pin-open">＋ 지금 위치에 메모</button>' : ''}${form}<ul class="media-pin-list">${list}</ul></section>`;
}

// Opens the search for the lyrics by hand (the song's name can differ from the lyrics record's, e.g. the artist's).
const FIND_LYRICS = label => `<button class="text-button" data-action="media-lyrics-search">${label}</button>`;

const SEARCH_NOTES = {
  loading: '찾고 있어요…',
  busy: '지금은 찾을 수 없어요. 잠시 뒤에 다시 해 주세요.',
  picking: '가사를 가져오고 있어요…',
  'pick-failed': '이 가사는 가져오지 못했어요. 다른 걸 골라 주세요.',
};

/** The search panel: the person's words, then records to pick (title, artist, length); the one in use is marked. */
function lyricsSearchBlock(media, search) {
  const candidates = Array.isArray(search.candidates) ? search.candidates : [];
  const waiting = search.status === 'loading' || search.status === 'picking';
  const off = waiting ? ' disabled' : '';
  const note = SEARCH_NOTES[search.status] ?? (search.status === 'done' && !candidates.length ? '맞는 가사가 없어요. 제목만 넣거나 가수 이름을 바꿔 보세요.' : '');
  const current = media.sections?.lyricsId;
  const list = candidates.length
    ? `<ul class="lyrics-candidates">${candidates.map((c, i) => `<li><button class="lyrics-candidate" data-action="media-lyrics-pick" data-id="${i}"${off}><span>${e(c.title)}</span><small>${[c.artist, c.duration ? formatTime(c.duration) : '', c.id === current ? '지금 가사' : ''].filter(Boolean).map(e).join(' · ')}</small></button></li>`).join('')}</ul>`
    : '';
  return `<div class="lyrics-search"><form id="lyrics-search-form" class="lyrics-search-form"><input id="lyrics-q" name="q" maxlength="120" value="${e(search.query)}" autocomplete="off" aria-label="가사를 찾을 제목과 가수"><button class="button small" type="submit"${off}>찾기</button><button class="text-button" type="button" data-action="media-panel-close">닫기</button></form><p class="lyrics-search-hint">제목과 가수로 찾아요. 안 나오면 가수 이름을 한글이나 영어로 바꿔 보세요.</p>${note ? `<p class="media-status" role="status">${note}</p>` : ''}${list}</div>`;
}

function lyricsBlock(media, ui, lines) {
  if (ui.panel === 'lyrics' && ui.lyricsSearch) return lyricsSearchBlock(media, ui.lyricsSearch);
  if (!lines?.length) {
    if (ui.lyrics === 'loading') return '<p class="media-status">가사를 불러오고 있어요…</p>';
    if (ui.lyrics === 'none') return `<p class="media-status">이 곡은 가사 시간 정보를 찾지 못했어요.${ui.consent ? ` · ${FIND_LYRICS('가사 직접 찾기')}` : ''}</p>`;
    if (ui.lyrics === 'busy') return `<p class="media-status">가사를 불러오지 못했어요${ui.sections === 'busy' ? '' : ' · <button class="text-button" data-action="media-sections-retry">다시 시도</button>'}</p>`;
    return '';
  }
  const style = ui.lyricsStyle === 'full' ? 'full' : 'karaoke';
  const button = (id, label) => `<button class="lyrics-style" data-action="media-lyrics-style" data-id="${id}" aria-pressed="${style === id}">${label}</button>`;
  const sections = media.sections?.items ?? [];
  let next = 0;
  let list = '';
  lines.forEach((line, i) => {
    while (next < sections.length && sections[next].t <= line.t + 0.05) list += `<h3>${e(sections[next++].label)}</h3>`;
    if (line.text) list += `<button class="lyric-line" data-action="media-lyric" data-id="${i}">${e(line.text)}</button>`;
  });
  // The current line is filled in by the app's timer (text and classes only), so the player is never redrawn.
  return `<div class="lyrics"><div class="lyrics-styles" role="group" aria-label="가사 보기 방식">${button('karaoke', '노래방 자막형')}${button('full', '전체 가사형')}</div>${ui.consent ? FIND_LYRICS('다른 가사 찾기') : ''}<div class="lyrics-karaoke"${style === 'karaoke' ? '' : ' hidden'}><p id="lyric-section" class="lyric-section"></p><p id="lyric-cur" class="lyric-cur">재생하면 가사가 흘러가요.</p><p id="lyric-next" class="lyric-next"></p></div><div class="lyrics-full" id="lyrics-full"${style === 'full' ? '' : ' hidden'}>${list}</div></div>`;
}

/** Sing along with earphones: offered whenever a video is shown (the report needs no lyrics or sections; they only
 * name the place when they are there); the panel asks for earphones first. */
function singBlock(media, ui, videoId) {
  const report = ui.singReport;
  const status = report?.status === 'short' ? '<p class="media-status" role="status">조금 더 불러 주세요. 20초 넘게 소리가 잡혀야 리포트를 만들 수 있어요.<br>소리가 작으면 잘 안 잡혀요. 평소 크기로 불러 주세요.</p>' : '';
  if (!videoId) return status;
  // While the microphone is open the stop button stays, whatever other panel was opened meanwhile.
  if (ui.panel !== 'sing' && !ui.singing) return `<div class="media-sing"><button class="button secondary small" data-action="media-sing-open">따라 부르고 리포트 받기</button>${status}</div>`;
  const act = ui.singing
    ? '<button class="button small" data-action="media-sing-stop">멈추고 리포트 받기</button><p class="media-status" role="status">듣고 있어요. 노래가 흐르는 동안만 재요.</p>'
    : '<button class="button small" data-action="media-sing-start">부르기 시작</button><button class="text-button" data-action="media-panel-close">닫기</button>';
  return `<div class="media-sing open"><p>이어폰을 끼고 불러 주세요. 스피커 소리가 마이크로 들어가면 측정이 틀려져요.</p>${act}${status}</div>`;
}

const OUTCOME_BADGES = { kept: '잘 넘겼어요', sag: '음이 내려왔어요', ask: '확인해 볼 자리' };

/** The report of demanding spots (src/hard-spots.js): where, how it went, the sentence, what to try, and a way to hear it again. */
function spotsReportBlock(ui, lines) {
  const report = ui.singReport;
  const answers = report.answers ?? {};
  const spots = (report.result?.spots ?? []).filter(spot => answers[spot.id] !== 'no');
  const exercises = exercisesFor(spots, answers);
  const item = spot => {
    const line = Number.isInteger(spot.lineId) ? lines?.[spot.lineId] : null;
    const where = [...(spot.section ? [e(spot.section)] : []), line?.text ? `“${e(line.text)}”` : formatTime(spot.time)].join(' · ');
    const badge = OUTCOME_BADGES[spot.outcome] ? `<span class="spot-badge spot-${spot.outcome}">${OUTCOME_BADGES[spot.outcome]}</span>` : '';
    const ask = spot.outcome === 'ask' && !answers[spot.id]
      ? `<div class="action-row"><button class="button secondary small" data-action="media-ask-yes" data-id="${e(spot.id)}">네, 그랬어요</button><button class="text-button" data-action="media-ask-no" data-id="${e(spot.id)}">아니요</button></div>` : '';
    return `<li class="spot"><span class="sing-where">${where}</span>${badge}<p>${e(report.words?.[spot.id] ?? '')}</p>${ask}${exerciseBlock(exercises[spot.id])}<button class="text-button" data-action="media-spot" data-id="${e(spot.time)}">이 자리 다시 듣기</button></li>`;
  };
  const allKept = spots.length > 0 && spots.every(spot => spot.outcome === 'kept');
  const polishing = report.polish === 'busy' ? '<p class="media-status" role="status">설명을 다듬고 있어요…</p>' : '';
  const polish = !ui.consent && spots.length && report.polish !== 'busy' ? '<button class="text-button" data-action="media-polish">AI로 설명 다듬기</button>' : '';
  const list = spots.length ? `<ol class="spot-list">${spots.map(item).join('')}</ol>` : '<p class="subtle">이번에는 크게 뛰어오르는 자리나 높은 음을 길게 낸 자리를 찾지 못했어요.</p>';
  return `<section class="surface practice-feedback sing-report"><h2>따라 부르기 리포트</h2>${allKept ? '<p class="spot-summary">어려운 자리를 모두 잘 넘겼어요.</p>' : ''}${polishing}${polish}<h3>이 노래의 어려운 자리</h3>${list}</section>`;
}

// --- Karaoke recording mode: a recording picked from the phone, analysed on the phone, never stored or sent. ---
const KARAOKE_PROBLEMS = {
  'too-big': '파일이 너무 커요. 50MB까지 분석할 수 있어요.',
  'too-long': '10분보다 긴 녹음은 분석하지 못해요.',
  unreadable: '이 파일은 읽지 못했어요. 다른 녹음 파일로 해 보세요.',
  unsupported: '이 브라우저에서는 노래방 녹음 분석을 쓸 수 없어요.',
  error: '이 파일은 읽지 못했어요. 다른 녹음 파일로 해 보세요.',
};
const LEFT_NOTICE = '<p class="subtle">화면을 벗어나 녹음을 멈췄어요. 여기까지 분석할게요.</p>';
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function karaokeBlock(ui) {
  const state = ui.karaoke;
  // While the microphone is open the time and the stop button stay, whatever other panel was opened meanwhile.
  if (state?.status === 'recording') {
    return `<div class="media-karaoke open"><p class="media-status"><span role="status">녹음하고 있어요. 화면을 켜 둔 채로 두세요.</span> <span class="karaoke-clock">${clock(Math.max(0, Math.floor(state.seconds ?? 0)))}</span></p><button class="button small" data-action="media-karaoke-record-stop">녹음 멈추고 분석하기</button></div>`;
  }
  const status = state?.status === 'analyzing' ? `${state.notice === 'left' ? LEFT_NOTICE : ''}<p class="media-status" role="status">녹음을 분석하고 있어요… ${Math.round((state.progress ?? 0) * 100)}%</p>`
    : state?.status === 'problem' ? `<div class="error-box" role="alert">${KARAOKE_PROBLEMS[state.problem] ?? KARAOKE_PROBLEMS.error}</div>`
    : state?.status === 'short' ? '<p class="media-status" role="status">목소리가 충분히 잡히지 않았어요. 다른 녹음으로 다시 해 보세요.</p>' : '';
  if (ui.panel !== 'karaoke') return `<div class="media-karaoke"><button class="button secondary small" data-action="media-karaoke-open">노래방 녹음 분석하기</button>${status}</div>`;
  const busy = state?.status === 'analyzing';
  // Recording in the app comes second, and only where it is switched on (plan N Task 7: until checked at a karaoke room).
  const record = ui.recordInApp ? `<button class="button secondary small" data-action="media-karaoke-record" ${busy ? 'disabled' : ''}>여기서 녹음하기</button>` : '';
  return `<div class="media-karaoke open"><p>노래방에서 부른 녹음을 이 폰 안에서 분석해요. 녹음은 어디로도 보내지 않고, 이 화면을 떠나면 지워져요.</p><button class="button small" data-action="media-karaoke-file" ${busy ? 'disabled' : ''}>녹음 파일 고르기</button><p class="subtle">노래방에서 폰의 녹음 앱으로 녹음한 파일을 골라 주세요.</p>${record}<button class="text-button" data-action="media-karaoke-close">닫기</button>${status}</div>`;
}

function exerciseBlock(exercise) {
  if (!exercise) return '';
  return `<div class="spot-exercise"><h4>이렇게 연습해 봐요</h4><p><strong>${e(exercise.title)}</strong> ${e(exercise.steps)}</p>${exercise.caution ? `<p class="subtle">${e(exercise.caution)}</p>` : ''}${exercise.columnId ? `<button class="text-button" data-action="spot-column" data-id="${e(exercise.columnId)}">알아두기에서 읽기</button>` : ''}</div>`;
}

/** The karaoke report: one sentence on how the long high notes went, the picture, the limits, the spots to hear again, and a suggestion.
 * With lyric times, it asks once whether the take's first voice is the song's first line; confirmed, each time gets its
 * line (on screen only; the karaoke backing is assumed to keep the original's tempo, so it is an extra, not the anchor). */
// The karaoke picture's frame in viewBox units: the left margin holds the note labels.
export const KARAOKE_GRAPH = Object.freeze({ width: 340, height: 170, left: 38, right: 8, top: 14, bottom: 20 });
const LONG_NOTE = 0.6;

/** Where a tap landed across the picture (0..1 of its width) as a time in the take. */
export function karaokeGraphTime(fraction, seconds) {
  const { width, left, right } = KARAOKE_GRAPH;
  const share = (fraction * width - left) / (width - left - right);
  return Math.round(Math.min(seconds, Math.max(0, share * seconds)) * 10) / 10;
}

/**
 * The sentence on top: how many long high notes there were and how many were kept to the end. Every long high note
 * counts, not only the ones listed; a result without them (made before the picture) counts the listed spots.
 */
function karaokeHeadline(result, spots) {
  const highs = Array.isArray(result.highs) ? result.highs : spots;
  const all = highs.length;
  const kept = highs.filter(high => high.outcome === 'kept').length;
  if (!all) return '이번 녹음에서는 길게 낸 높은 음을 찾지 못했어요.';
  if (kept === all) return all === 1 ? '길게 낸 높은 음 1번을 끝까지 지켰어요.' : `길게 낸 높은 음 ${all}번을 모두 끝까지 지켰어요.`;
  if (kept) return `길게 낸 높은 음 ${all}번 중 ${kept}번은 끝까지 지켰어요.`;
  return `길게 낸 높은 음이 ${all}번 있었어요. 다음엔 끝까지 같은 높이로 지켜 봐요.`;
}

/** The take as a picture: each note held 0.3 s or more, the comfortable top, the long high notes (chosen ones numbered
 * like the list). Tapping it plays the recording from there while the recording is still in memory. */
function karaokeGraph(result, spots, ui) {
  const { width: W, height: H, left: L, right: R, top: T, bottom: B } = KARAOKE_GRAPH;
  const contour = result.contour;
  const pitches = contour.map(note => note[2]).concat(Number.isFinite(ui.comfortHigh) ? [ui.comfortHigh] : []);
  let lo = Math.floor(Math.min(...pitches)) - 2;
  let hi = Math.ceil(Math.max(...pitches)) + 3;
  if (hi - lo < 14) { const middle = (hi + lo) / 2; lo = Math.floor(middle - 7); hi = Math.ceil(middle + 7); }
  const x = time => (L + (time / result.seconds) * (W - L - R)).toFixed(1);
  const y = midi => (T + ((hi - midi) / (hi - lo)) * (H - T - B)).toFixed(1);
  const pitchAt = time => contour.find(note => Math.abs(note[0] - time) < 0.05)?.[2] ?? result.range?.topHeld ?? hi - 3;
  const parts = [];
  for (let midi = Math.ceil(lo / 12) * 12; midi < hi; midi += 12) parts.push(`<line class="graph-grid" x1="${L}" x2="${W - R}" y1="${y(midi)}" y2="${y(midi)}"/><text class="graph-label" x="${L - 4}" y="${(Number(y(midi)) + 3).toFixed(1)}" text-anchor="end">${e(koreanNote(midi))}</text>`);
  const step = result.seconds <= 150 ? 30 : 60;
  for (let time = 0; time <= result.seconds; time += step) parts.push(`<text class="graph-label" x="${x(time)}" y="${H - 6}" text-anchor="middle">${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}</text>`);
  if (Number.isFinite(ui.comfortHigh)) parts.push(`<line class="graph-comfort" x1="${L}" x2="${W - R}" y1="${y(ui.comfortHigh)}" y2="${y(ui.comfortHigh)}"/>`);
  for (const [start, end, midi] of contour) parts.push(`<line class="graph-note ${end - start >= LONG_NOTE - 1e-9 ? 'long' : 'short'}" x1="${x(start)}" x2="${Math.max(Number(x(end)), Number(x(start)) + 1.5).toFixed(1)}" y1="${y(midi)}" y2="${y(midi)}"/>`);
  const chosen = spots.map(spot => spot.time);
  for (const high of result.highs ?? []) {
    if (chosen.some(time => Math.abs(time - high.time) < 1e-6)) continue;
    parts.push(`<circle class="graph-high" cx="${x((high.time + high.end) / 2)}" cy="${(Number(y(pitchAt(high.time))) - 7).toFixed(1)}" r="2.5"/>`);
  }
  spots.forEach((spot, i) => {
    const cx = x((spot.time + spot.end) / 2);
    const cy = Number(y(pitchAt(spot.time))) - 11;
    parts.push(`<g class="graph-spot"><circle cx="${cx}" cy="${cy.toFixed(1)}" r="7"/><text x="${cx}" y="${(cy + 3).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`);
  });
  const svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
  const picture = ui.karaokeAudio
    ? `<button type="button" class="pitch-graph" data-action="media-karaoke-graph" aria-label="음높이 그림. 누르면 그 시간부터 내 녹음이 나와요.">${svg}</button>`
    : `<div class="pitch-graph">${svg}</div>`;
  const legend = ['위로 갈수록 높은 음이고, 진한 선은 길게 낸 음이에요.'];
  if (Number.isFinite(ui.comfortHigh)) legend.push('점선은 편한 최고음이에요.');
  if (spots.length) legend.push('번호는 아래 자리예요.');
  if (ui.karaokeAudio) legend.push('그림을 누르면 그 시간부터 내 녹음이 나와요.');
  return `${picture}<p class="graph-legend">${legend.join(' ')}</p>`;
}

function karaokeReportBlock(ui, lines) {
  const report = ui.karaoke;
  if (report?.status !== 'done') return '';
  const { spots = [], suggestion = null, firstVoice = null } = report.result ?? {};
  const asking = !report.firstLine && spots.length > 0 && Number.isFinite(firstVoice) && firstLyricLine(lines) && ui.karaokeAudio;
  const firstLine = asking
    ? '<div class="suggest-card first-line"><p>자리마다 가사 줄을 붙여 드릴게요. 녹음에서 처음 나온 목소리가 노래의 첫 소절이 맞나요?</p><div class="action-row"><button class="button secondary small" data-action="media-karaoke-first-play">들어 보기</button><button class="button small" data-action="media-karaoke-first-yes">맞아요</button><button class="text-button" data-action="media-karaoke-first-no">아니에요, 시간으로만 볼게요</button></div></div>' : '';
  const lineOf = spot => {
    if (report.firstLine !== 'yes' || !Number.isFinite(report.lineOffset)) return '';
    const text = lines?.[lineAt(lines, spot.time - report.lineOffset)]?.text;
    return text ? ` · “${e(text)}”` : '';
  };
  const exercises = exercisesFor(spots, report.answers ?? {});
  const item = spot => {
    const badge = OUTCOME_BADGES[spot.outcome] ? `<span class="spot-badge spot-${spot.outcome}">${OUTCOME_BADGES[spot.outcome]}</span>` : '';
    const play = ui.karaokeAudio ? `<button class="text-button" data-action="media-karaoke-play" data-id="${e(spot.time)}">내 녹음 듣기</button>` : '';
    return `<li class="spot"><span class="sing-where">${e(spotTime(spot.time))}${lineOf(spot)}</span>${badge}<p>${e(report.words?.[spot.id] ?? '')}</p>${exerciseBlock(exercises[spot.id])}${play}</li>`;
  };
  const polishing = report.polish === 'busy' ? '<p class="media-status" role="status">설명을 다듬고 있어요…</p>' : '';
  const polish = !ui.consent && spots.length && report.polish !== 'busy' ? '<button class="text-button" data-action="media-polish" data-id="karaoke">AI로 설명 다듬기</button>' : '';
  const list = spots.length ? `<h3>다시 들어 볼 자리</h3>${firstLine}<ol class="spot-list">${spots.map(item).join('')}</ol>` : '';
  const name = Number.isInteger(suggestion) ? e(koreanNote(suggestion)) : '';
  const suggest = name && !report.suggestionDone
    ? `<div class="suggest-card"><p>이 노래에서 ${name}까지는 두 번 이상 길게 지켰어요. 편한 최고음을 여기(${name})로 바꿀까요?</p><div class="action-row"><button class="button small" data-action="media-karaoke-high-yes">바꾸기</button><button class="text-button" data-action="media-karaoke-high-no">그대로 두기</button></div></div>` : '';
  const result = report.result ?? {};
  const pictured = Array.isArray(result.contour) && result.contour.length > 0 && result.seconds > 0;
  const picture = pictured ? karaokeGraph(result, spots, ui) : '';
  const headline = `<p class="spot-summary">${karaokeHeadline(result, spots)}</p>`;
  return `<section class="surface practice-feedback karaoke-report"><h2>노래방 녹음 리포트</h2>${report.notice === 'left' ? LEFT_NOTICE : ''}${headline}${picture}<p class="subtle">노래방 녹음에서는 길게 낸 높은 음만 봐요. 반주가 섞여 있어서 짧은 음과 낮은 음은 정확하지 않을 수 있어요.</p>${polishing}${polish}${list}${suggest}</section>`;
}

/** The sing-along report, once there is one. */
function singReportBlock(ui, lines) {
  return ui.singReport?.status === 'spots' ? spotsReportBlock(ui, lines) : '';
}

/** Everything under the player, in the order of the spec's screen (section 5, lyrics from 11.2). */
export function songMediaBelow(song, ui, lines = null) {
  const media = readMedia(song);
  const videoId = currentVideoId(song, ui.side);
  const tj = `<a class="media-tj" href="${e(tjVideoSearchUrl(song.title, song.artist))}" target="_blank" rel="noopener noreferrer"><strong>TJ 노래방 영상 보기 ↗</strong><span>유튜브에서 열려요${song.tjNumber ? ` · TJ ${e(song.tjNumber)}` : ''}</span></a>`;
  return `<section class="song-media">${videoStatus(song, media, ui, videoId)}${changePanel(song, media, ui)}${lyricsBlock(media, ui, lines)}${sectionsBlock(media, ui, videoId)}${singBlock(media, ui, videoId)}${karaokeBlock(ui)}${tj}</section>${singReportBlock(ui, lines)}${karaokeReportBlock(ui, lines)}${pinsBlock(media, ui, videoId)}`;
}
