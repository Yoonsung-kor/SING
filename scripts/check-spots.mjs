// Local tool: `node scripts/check-spots.mjs <audio file or folder> [--comfort=69] [--notes=start,end]`
// reads a recording the way the app reads the microphone (detectPitch, 2048 samples every 25 ms, clarity 0.85)
// and prints the spots the report would show, so they can be checked by ear. It calls no AI and saves or sends nothing.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { detectPitch, frequencyToMidi } from '../src/pitch.js';
import { notesOf, spotCandidates, findSpots, SPOT_RULES } from '../src/hard-spots.js';
import { koreanNote } from '../src/notes.js';

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
if (!target) {
  console.error('사용법: node scripts/check-spots.mjs <소리 파일 또는 폴더> [--comfort=69] [--notes=시작초,끝초]');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).error) {
  console.error('ffmpeg가 필요해요. 설치하고 PATH에 넣은 뒤 다시 실행해 주세요.');
  process.exit(1);
}

const clock = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const name = midi => koreanNote(Math.round(midi)) || '?';

function framesOf(file) {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (decoded.status !== 0) throw new Error(`읽지 못했어요: ${String(decoded.stderr).slice(0, 200)}`);
  const bytes = new Uint8Array(decoded.stdout).slice();
  const samples = new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
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
