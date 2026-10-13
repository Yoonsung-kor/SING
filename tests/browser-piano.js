import { PianoBank } from '/src/piano.js';
import { detectPitch, frequencyToMidi } from '/src/pitch.js';

let passed = 0;
let failed = 0;
const bank = new PianoBank();
function assert(value, message) { if (!value) throw new Error(message); }
async function check(label, run) {
  const row = document.createElement('li');
  try { await run(); passed++; row.textContent = `PASS · ${label}`; }
  catch (error) { failed++; row.textContent = `FAIL · ${label}: ${error.message}`; }
  document.querySelector('#results').append(row);
}

await check('동봉한 피아노 17개 파일의 MIME, 실제 MP3 디코딩, 길이 확인', async () => {
  const context = new OfflineAudioContext(1, 44100, 44100);
  for (let midi = 36; midi <= 84; midi += 3) {
    const { buffer } = await bank.load(context, midi);
    assert(buffer.duration >= 1.6, `sample ${midi}: short buffer`);
    assert(buffer.numberOfChannels >= 1, `sample ${midi}: no channels`);
  }
  const response = await fetch('/assets/piano-C4.mp3', { method: 'HEAD' });
  assert(response.headers.get('Content-Type') === 'audio/mpeg', 'wrong MP3 Content-Type');
});

for (const midi of [45, 48, 55, 57, 60, 61, 65, 69, 73, 78, 80]) {
  await check(`실제 피아노 MIDI ${midi}의 조율 오차가 35센트 이내`, async () => {
    const context = new OfflineAudioContext(1, 44100, 44100);
    const sample = await bank.load(context, midi);
    const source = context.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = sample.playbackRate;
    source.connect(context.destination);
    source.start();
    const output = (await context.startRendering()).getChannelData(0);
    const estimates = [0.12, 0.22, 0.32, 0.42].map(time => detectPitch(output.slice(Math.round(time * 44100), Math.round(time * 44100) + 4096), 44100)).filter(Boolean);
    assert(estimates.length >= 2, 'too few pitched frames');
    const errors = estimates.map(frame => 100 * (frequencyToMidi(frame.frequency) - midi)).sort((a, b) => a - b);
    const cents = errors[Math.floor(errors.length / 2)];
    assert(Math.abs(cents) <= 35, `tuning error ${cents.toFixed(1)} cents`);
  });
}
document.querySelector('#summary').textContent = `${passed} passed / ${failed} failed · 마이크·사용자 기록 접근 없음`;
document.title = `SING piano: ${passed} passed, ${failed} failed`;
