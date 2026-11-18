// Local tool: `node scripts/check-spots.mjs <audio file or folder> [--comfort=69] [--notes=start,end] [--karaoke]`
// reads a recording the way the app reads the microphone (detectPitch, 2048 samples every 25 ms, clarity 0.85)
// and prints the spots the report would show, so they can be checked by ear. With --karaoke it reads it the way the
// karaoke mode does (monoAt16k → analyzeKaraoke) and prints the long high notes and the range. It calls no AI and
// saves or sends nothing.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { detectPitch, frequencyToMidi } from '../src/pitch.js';
import { notesOf, spotCandidates, findSpots, SPOT_RULES } from '../src/hard-spots.js';
import { koreanNote } from '../src/notes.js';
import { monoAt16k, leveled } from '../src/resample.js';
import { analyzeKaraoke } from '../src/karaoke-analysis.js';
import { trackMelody } from '../src/melody-tracker.js';

const RATE = 48000;
const WINDOW = 2048;
const HOP = Math.round(RATE * 0.025);
const CLARITY = 0.85;
const AUDIO = /\.(m4a|mp3|wav|aac|ogg|webm|3gp|flac)$/i;

const args = process.argv.slice(2);
const target = args.find(arg => !arg.startsWith('--'));
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const comfort = option('comfort') !== undefined ? Number(option('comfort')) : 69;
const notesWindow = option('notes')?.split(',').map(Number);
const karaoke = args.includes('--karaoke');
if (!target) {
  console.error('사용법: node scripts/check-spots.mjs <소리 파일 또는 폴더> [--comfort=69] [--notes=시작초,끝초] [--karaoke]');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).error) {
  console.error('ffmpeg가 필요해요. 설치하고 PATH에 넣은 뒤 다시 실행해 주세요.');
  process.exit(1);
}

const clock = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const name = midi => koreanNote(Math.round(midi)) || '?';

/** The recording as 48 kHz mono samples. */
function samplesOf(file) {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (decoded.status !== 0) throw new Error(`읽지 못했어요: ${String(decoded.stderr).slice(0, 200)}`);
  const bytes = new Uint8Array(decoded.stdout).slice();
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
}

/** The karaoke mode's report on one recording: what the long notes reached and each long high note. */
function printKaraoke(file) {
  const samples = monoAt16k([samplesOf(file)], RATE);
  const result = analyzeKaraoke(samples, { comfortableHighMidi: comfort });
  console.log(`\n${path.basename(file)} · 소리 난 시간 ${result.voicedSeconds.toFixed(1)}초`);
  if (result.status === 'short') return console.log('  소리가 20초보다 짧아서 리포트를 만들지 않아요.');
  const label = midi => (Number.isInteger(midi) ? name(midi) : '없음');
  const line = spot => `${clock(spot.time)} ${spot.outcome ?? '-'} ${spot.to} ${(spot.end - spot.time).toFixed(1)}초${spot.over ? ` (+${spot.over})` : ''}`;
  console.log(`  길게 낸 가장 높은 음(topHeld) ${label(result.range.topHeld)} · 지킨 가장 높은 음(keptHigh) ${label(result.range.keptHigh)} · 편한 최고음 ${label(comfort)} · 제안 ${label(result.suggestion)}`);
  if (!result.spots.length) console.log('  고른 자리 없음');
  for (const spot of result.spots) console.log(`  리포트: ${line(spot)}${spot.repeated ? ' (두 번)' : ''}`);
  // Every long high note the report chose from, to check more of them by ear than the report shows.
  const candidates = spotCandidates(notesOf(trackMelody(leveled(samples))), { comfortableHighMidi: comfort, source: 'karaoke' });
  console.log(`  길게 낸 높은 음 후보 ${candidates.length}개:`);
  for (const spot of candidates) console.log(`    ${line(spot)}`);
}

function framesOf(file) {
  const samples = samplesOf(file);
  const frames = [];
  for (let start = 0; start + WINDOW <= samples.length; start += HOP) {
    const pitch = detectPitch(samples.slice(start, start + WINDOW), RATE);
    frames.push({ songTime: (start + WINDOW / 2) / RATE, midi: pitch && pitch.clarity >= CLARITY ? frequencyToMidi(pitch.frequency) : null });
  }
  return frames;
}

const files = statSync(target).isDirectory()
  ? readdirSync(target).filter(entry => AUDIO.test(entry)).sort().map(entry => path.join(target, entry))
  : [target];
for (const file of files) {
  if (karaoke) { printKaraoke(file); continue; }
  const frames = framesOf(file);
  const notes = notesOf(frames);
  const held = notes.filter(note => note.end - note.start >= SPOT_RULES.held).length;
  const candidates = spotCandidates(notes, { comfortableHighMidi: comfort });
  const kinds = ['leap', 'high-hold', 'over'].map(kind => `${kind} ${candidates.filter(spot => spot.kind === kind).length}`).join(', ');
  const result = findSpots(frames, { comfortableHighMidi: comfort });
  console.log(`\n${path.basename(file)} · 소리 난 시간 ${result.voicedSeconds.toFixed(1)}초 · 음 ${notes.length}개 · 길게 낸 음(${SPOT_RULES.held}초 이상) ${held}개 · 후보: ${kinds}`);
  if (result.status === 'short') console.log('  소리가 20초보다 짧아서 리포트를 만들지 않아요.');
  else if (!result.spots.length) console.log('  고른 자리 없음');
  for (const spot of result.spots ?? []) {
    console.log(`  ${clock(spot.time)} ${spot.kind} ${spot.outcome ?? '-'} ${spot.from ? `${spot.from}→` : ''}${spot.to}${spot.over ? ` (+${spot.over})` : ''}${spot.repeated ? ' (두 번)' : ''}`);
  }
  if (notesWindow?.length === 2) {
    const [from, to] = notesWindow;
    console.log(`  ${clock(from)}~${clock(to)}의 음:`);
    for (const note of notes.filter(entry => entry.start >= from && entry.start <= to)) {
      console.log(`    ${clock(note.start)} 길이 ${(note.end - note.start).toFixed(2)}초 · ${name(note.midi)} (${note.midi.toFixed(2)}) · 앞 ${note.first.toFixed(2)} 가운데 ${note.middle.toFixed(2)} 뒤 ${note.last.toFixed(2)}${note.breaks.length ? ` · 끊김 ${note.breaks.length}번` : ''}`);
    }
  }
}
