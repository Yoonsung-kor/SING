// Development check: `node scripts/check-tracker.mjs` feeds the same synthetic karaoke mix to the experiment's tracker
// (docs/superpowers/plans/karaoke-reference, kept only on the PC that ran the experiment) and to src/melody-tracker.js,
// and confirms they agree frame by frame. Without the reference folder it says so and stops.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trackMelody } from '../src/melody-tracker.js';
import { makeMelody, renderVoice, karaokeEcho, mixAt, renderBacking, normalized } from '../tests/helpers/synth-voice.mjs';

const reference = fileURLToPath(new URL('../docs/superpowers/plans/karaoke-reference/tracker.mjs', import.meta.url));
if (!existsSync(reference)) {
  console.log('참고 코드(docs/superpowers/plans/karaoke-reference)가 없어 대조를 건너뛰어요.');
  process.exit(0);
}
const { track } = await import(pathToFileURL(reference).href);

const RATE = 16000;
const notes = makeMelody({ seed: 21, seconds: 20, low: 52, high: 69 });
const { samples } = renderVoice(notes, RATE, { seed: 22, seconds: 20 });
const mix = normalized(mixAt(karaokeEcho(samples, RATE), renderBacking(20, RATE), RATE, 6), RATE);
const theirs = track(mix);
const ours = trackMelody(mix);
if (theirs.length !== ours.length) {
  console.log(`다름: 프레임 수 ${theirs.length} / ${ours.length}`);
  process.exit(1);
}
for (let i = 0; i < ours.length; i++) {
  const a = theirs[i].midi, b = ours[i].midi;
  const same = (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= 1e-9);
  if (!same || Math.abs(theirs[i].time - ours[i].songTime) > 1e-9) {
    console.log(`다름: 프레임 ${i} (${ours[i].songTime.toFixed(2)}초) 참고 ${a} / 앱 ${b}`);
    process.exit(1);
  }
}
console.log(`같음: 프레임 ${ours.length}개, 음이 잡힌 프레임 ${ours.filter(frame => frame.midi !== null).length}개`);
