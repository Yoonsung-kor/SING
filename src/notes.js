// Note names as people write them: Korean "n옥타브", scientific (C4 = middle C) and Japanese karaoke (hiA = A4).
// Shared by the browser (labels) and the server (checking a cited quote), so it stays free of node: modules.
import { noteName } from './pitch.js';

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFEGE = { 도: 'C', 레: 'D', 미: 'E', 파: 'F', 솔: 'G', 라: 'A', 시: 'B' };
const ACCIDENTALS = { '': 0, '#': 1, '♯': 1, b: -1, '♭': -1 };
// Japanese octave names change at A: hiA = A4 (440 Hz), but hiC = C5 and mid2G# = G#4.
const JAPANESE = { mid1: [3, 2], mid2: [4, 3], hi: [5, 4], hihi: [6, 5] };

const midiOf = (letter, accidental, octave) => (octave + 1) * 12 + LETTERS[letter] + ACCIDENTALS[accidental];

/** "2옥 시": Korean octave numbers are two below scientific ones (2옥타브 라 = A4). */
export function koreanNote(midi) {
  const note = noteName(midi);
  return note ? `${note.octave - 2}옥 ${note.name}` : '';
}

/** "2옥 시 (B4)" */
export function noteLabel(midi) {
  const note = noteName(midi);
  return note ? `${koreanNote(midi)} (${note.scientific})` : '';
}

/** Every note written in the text, as sorted unique MIDI numbers. */
export function notesInText(text) {
  const source = String(text ?? '').normalize('NFC');
  const found = new Set();
  for (const [, octave, syllable, accidental] of source.matchAll(/(-?\d)\s*옥(?:타브)?\s*(도|레|미|파|솔|라|시)([#♯b♭]?)/gu)) {
    found.add(midiOf(SOLFEGE[syllable], accidental, Number(octave) + 2));
  }
  for (const [, letter, accidental, octave] of source.matchAll(/(?<![A-Za-z])([A-G])([#♯b♭]?)([0-8])(?![0-9])/gu)) {
    found.add(midiOf(letter, accidental, Number(octave)));
  }
  for (const [, name, letter, accidental] of source.matchAll(/(?<![A-Za-z])(hihi|hi|mid2|mid1)([A-G])([#♯]?)/gu)) {
    const [fromC, fromA] = JAPANESE[name];
    found.add(midiOf(letter, accidental, letter === 'A' || letter === 'B' ? fromA : fromC));
  }
  return [...found].sort((a, b) => a - b);
}
