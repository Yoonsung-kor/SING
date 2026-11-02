// Two pictures for one idea. The staff answers "which note is this" (drawn at real pitch on a treble staff);
// the bar answers "how hard is this for me" (easy / challenge / too high). Both share the green/peach colors.
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
/** Where a gap (song top note − my comfortable high) sits on a bar that spans ±6 semitones. */
export function gapPercent(gap) {
  return (clamp(gap, -6, 6) + 6) / 12 * 100;
}

/** One short phrase for where a song sits against my comfortable high. */
export function zoneText(gap) {
  const zone = gapZone(gap);
  if (zone === 'easy') return '편하게 부를 수 있어요';
  return zone === 'challenge' ? `도전 +${gap}` : `반음 ${gap}개 위`;
}

const ZONE_LABEL = { easy: () => '편한 구간', challenge: gap => `도전 구간, 반음 ${gap}개 위`, hard: gap => `아직 무리, 반음 ${gap}개 위` };

/** Easy / challenge / too-high bar: my comfortable high is the line in the middle, the song is the marker. */
export function rangeBar(gap) {
  const zone = gapZone(gap);
  const easyEnd = gapPercent(0.5), challengeEnd = gapPercent(3.5), song = gapPercent(gap);
  return `<div class="range-bar range-${zone}" role="img" aria-label="${ZONE_LABEL[zone](gap)}"><svg class="range-track" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">`
    + `<rect class="range-seg easy" x="0" y="7" width="${easyEnd}" height="7"/>`
    + `<rect class="range-seg challenge" x="${easyEnd}" y="7" width="${challengeEnd - easyEnd}" height="7"/>`
    + `<rect class="range-seg hard" x="${challengeEnd}" y="7" width="${100 - challengeEnd}" height="7"/>`
    + `<rect class="range-mark me" x="49.4" y="2" width="1.2" height="17"/>`
    + `<rect class="range-mark song" x="${clamp(song - 0.8, 0, 98.4)}" y="2" width="1.6" height="17"/>`
    + `</svg><span class="range-labels" aria-hidden="true"><span>편함</span><span>도전</span><span>무리</span></span></div>`;
}
