// The song screen's video part: side buttons above the player, and everything below it (status, change panel,
// TJ link, sections timeline, pins). The player slot itself is never part of these strings, so redrawing them
// leaves a playing video alone. Positions are SVG attributes only (CSP has no inline styles).
import {
  readMedia, hasOtherCandidates, isAligned, pinVideoTime, pinSongTime, formatTime,
  youtubeWatchUrl, youtubeSearchUrl, videoSearchQuery, tjVideoSearchUrl,
} from './song-media.js';

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

export const defaultSongUi = () => ({ side: 'mv', consent: false, videos: { mv: 'idle', karaoke: 'idle' }, sections: 'idle', panel: null, pasteError: '', pinError: '', playerError: null });

export function currentVideoId(song, side) {
  const entry = readMedia(song)[side];
  return entry && !entry.none ? entry.videoId : null;
}

export function songMediaSides(ui) {
  const side = (id, label) => `<button class="media-side" data-action="media-side" data-id="${id}" aria-pressed="${ui.side === id}">${label}</button>`;
  return `<div class="media-sides" role="group" aria-label="영상 고르기">${side('mv', '원곡 MV')}${side('karaoke', '노래방')}</div>`;
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
  if (videoId) parts.push('<div class="media-links"><button class="text-button" data-action="media-change">영상 바꾸기</button></div>');
  return parts.join('');
}

function changePanel(song, media, ui) {
  if (ui.panel !== 'change') return '';
  const next = hasOtherCandidates(media[ui.side]) ? '<button class="button secondary small" data-action="media-next">다른 후보</button>' : '';
  return `<div class="media-change">${next}${out(youtubeSearchUrl(videoSearchQuery(song, ui.side)), '유튜브에서 찾아보기 ↗')}<form id="media-paste-form" class="media-paste"><label for="media-link">유튜브 링크</label><input id="media-link" name="link" type="url" inputmode="url" placeholder="https://youtu.be/…" autocomplete="off"><button class="button small" type="submit">넣기</button></form>${ui.pasteError ? `<p class="media-error" role="alert">${e(ui.pasteError)}</p>` : ''}<button class="text-button" data-action="media-panel-close">닫기</button></div>`;
}

const toX = (t, duration) => Math.round(Math.min(1000, Math.max(0, t / duration * 1000)) * 10) / 10;

function sectionsBlock(media, ui, videoId) {
  const sections = media.sections;
  if (sections?.items?.length) {
    const { duration, items } = sections;
    const align = !videoId ? '' : isAligned(media, videoId)
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
  if (sections?.none) return '<p class="media-status">이 곡은 구간을 찾지 못했어요. 신경 쓰이는 곳은 메모로 표시해 보세요.</p>';
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

/** Everything under the player, in the order of the spec's screen (section 5). */
export function songMediaBelow(song, ui) {
  const media = readMedia(song);
  const videoId = currentVideoId(song, ui.side);
  const tj = `<a class="media-tj" href="${e(tjVideoSearchUrl(song.title, song.artist))}" target="_blank" rel="noopener noreferrer"><strong>TJ 노래방 영상 보기 ↗</strong><span>유튜브에서 열려요${song.tjNumber ? ` · TJ ${e(song.tjNumber)}` : ''}</span></a>`;
  return `<section class="song-media">${videoStatus(song, media, ui, videoId)}${changePanel(song, media, ui)}${tj}${sectionsBlock(media, ui, videoId)}</section>${pinsBlock(media, ui, videoId)}`;
}
