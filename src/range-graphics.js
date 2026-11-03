// Two pictures for one idea. The staff answers "which note is this" (drawn at real pitch on a treble staff);
// the key row answers "which karaoke key should I pick" (original key in the middle, the key that fits me marked).
// Positions use SVG attributes and CSS classes only: the page's CSP blocks inline style attributes.
import { koreanNote, noteLabel } from './notes.js';
import { gapZone } from './vocal-range.js';

export const STAFF = Object.freeze({ bottomLineY: 100, stepPx: 5, width: 250, height: 170 });
const NOTE_X = 150;
// Natural letter (C=0 … B=6) under each pitch class; sharps sit on the letter below them.
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];
const E4_DIATONIC = 4 * 7 + 2;

/** Staff step from E4 (bottom line), whether a sharp is drawn, the note's y and its ledger lines' y values. */
export function staffPosition(midi) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const step = octave * 7 + LETTER[pitchClass] - E4_DIATONIC;
  const y = STAFF.bottomLineY - step * STAFF.stepPx;
  const ledgers = [];
  if (step <= -2) for (let s = -2; s >= step; s -= 2) ledgers.push(STAFF.bottomLineY - s * STAFF.stepPx);
  if (step >= 10) for (let s = 10; s <= step; s += 2) ledgers.push(STAFF.bottomLineY - s * STAFF.stepPx);
  return { step, sharp: SHARP[pitchClass], y, ledgers };
}

/** My note on a treble staff, with the next 1–3 semitones shaded as the challenge zone. */
export function staffSvg(midi, { band = true } = {}) {
  const { step, sharp, y, ledgers } = staffPosition(midi);
  const lines = [0, 2, 4, 6, 8].map(s => STAFF.bottomLineY - s * STAFF.stepPx)
    .map(lineY => `<line class="staff-line" x1="10" y1="${lineY}" x2="240" y2="${lineY}"/>`).join('');
  let zone = '';
  if (band && midi < 88) {
    const top = Math.min(midi + 3, 88);
    const yTop = staffPosition(top).y - STAFF.stepPx;
    const yBottom = staffPosition(midi + 1).y + STAFF.stepPx;
    zone = `<rect class="staff-band" x="54" y="${yTop}" width="186" height="${yBottom - yTop}" rx="4"/><text class="staff-band-label" x="236" y="${Math.max(12, yTop - 4)}" text-anchor="end">도전 구간 · ${koreanNote(midi + 1)}~${koreanNote(top)}</text>`;
  }
  const stemUp = step < 4;
  const stem = stemUp
    ? `<line class="staff-stem" x1="${NOTE_X + 6.8}" y1="${y - 1}" x2="${NOTE_X + 6.8}" y2="${y - 32}"/>`
    : `<line class="staff-stem" x1="${NOTE_X - 6.8}" y1="${y + 1}" x2="${NOTE_X - 6.8}" y2="${y + 32}"/>`;
  const ledgerLines = ledgers.map(ly => `<line class="staff-line" x1="${NOTE_X - 14}" y1="${ly}" x2="${NOTE_X + 14}" y2="${ly}"/>`).join('');
  const sharpMark = sharp ? `<text class="staff-sharp" x="${NOTE_X - 22}" y="${y + 5}">♯</text>` : '';
  return `<svg class="staff" width="${STAFF.width}" height="${STAFF.height}" viewBox="0 0 ${STAFF.width} ${STAFF.height}" role="img" aria-label="${noteLabel(midi)} 음표">${zone}${lines}<text class="staff-clef" x="14" y="108">𝄞</text>${ledgerLines}${sharpMark}<ellipse class="staff-note" cx="${NOTE_X}" cy="${y}" rx="7.5" ry="5.4" transform="rotate(-20 ${NOTE_X} ${y})"/>${stem}<circle class="staff-halo" cx="${NOTE_X}" cy="${y}" r="15"/></svg>`;
}

// gap below = song top note (in the octave I sing it) − my comfortable high, in semitones, at the original key.
const KEY_LIMIT = 12;
const keyText = key => key === 0 ? '원키' : `${key > 0 ? '+' : '−'}${Math.abs(key)}`;

/** The karaoke key that brings the song's top note down to my comfortable high; 0 when the original already fits. */
export function fitKey(gap) {
  return gap > 0 ? -Math.min(gap, KEY_LIMIT) : 0;
}

/** Two soft lines: the key that fits now, then how the original key (or my saved key) would feel. */
export function keyGuide(gap, savedKey = 0) {
  const fit = fitKey(gap);
  const main = fit === 0 ? '원키 그대로 편하게 불러요' : `지금은 ${keyText(fit)}키로 부르면 편해요`;
  if (savedKey) {
    const zone = gapZone(gap + savedKey);
    const saved = `저장한 내 키(${keyText(savedKey)})`;
    return { main, sub: zone === 'easy' ? `${saved}도 편하게 맞아요` : zone === 'challenge' ? `${saved}는 도전해 보기 좋아요` : `${saved}에서 조금 더 내려도 좋아요` };
  }
  if (fit === 0) return { main, sub: '' };
  return { main, sub: gapZone(gap) === 'challenge' ? '원키도 연습 삼아 도전해 볼 만해요' : '원키는 연습하면서 한 키씩 올려 봐요' };
}

const ROW = Object.freeze({ width: 300, pad: 14, gap: 3, cellY: 18, cellHeight: 22 });

/** Keys from low to high with the original key in the middle: the key that fits me filled, the keys on the way shaded, my saved key ringed. */
export function keyRow(gap, savedKey = 0) {
  const fit = fitKey(gap);
  const ringed = savedKey !== 0 && savedKey !== fit ? savedKey : null;
  const span = Math.min(KEY_LIMIT, Math.max(6, -fit, Math.abs(ringed ?? 0)));
  const count = span * 2 + 1;
  const cell = (ROW.width - ROW.pad * 2 - ROW.gap * (count - 1)) / count;
  const left = key => ROW.pad + (key + span) * (cell + ROW.gap);
  const mid = key => (left(key) + cell / 2).toFixed(1);
  const savedLow = ringed !== null && Math.abs(ringed - fit) < 3;
  const height = savedLow ? 74 : 60;
  const cells = Array.from({ length: count }, (_, i) => i - span).map(key => {
    const classes = ['key-cell', key < 0 && key > fit && 'path', key === fit && 'fit', key === 0 && 'origin', key === ringed && 'saved'].filter(Boolean).join(' ');
    return `<rect class="${classes}" x="${left(key).toFixed(1)}" y="${ROW.cellY}" width="${cell.toFixed(1)}" height="${ROW.cellHeight}" rx="4"/>`;
  }).join('');
  const labels = `<text class="key-origin-label" x="${mid(0)}" y="12" text-anchor="middle">원키</text>`
    + `<text class="key-fit-label" x="${mid(fit)}" y="56" text-anchor="middle">${fit === 0 ? '그대로' : keyText(fit)}</text>`
    + (ringed === null ? '' : `<text class="key-saved-label" x="${mid(ringed)}" y="${savedLow ? 70 : 56}" text-anchor="middle">내 키 ${keyText(ringed)}</text>`);
  return `<div class="key-row" role="img" aria-label="${keyGuide(gap).main}"><svg class="key-track" viewBox="0 0 ${ROW.width} ${height}" aria-hidden="true">${cells}${labels}</svg>`
    + '<span class="key-ends" aria-hidden="true"><span>← 낮게</span><span>높게 →</span></span></div>';
}

/** The guidance under a key row: the fitting key in bold, the softer second line under it. */
export function keyGuideHtml(gap, savedKey = 0) {
  const { main, sub } = keyGuide(gap, savedKey);
  return `<p class="key-guide"><strong>${main}</strong>${sub ? `<span>${sub}</span>` : ''}</p>`;
}
