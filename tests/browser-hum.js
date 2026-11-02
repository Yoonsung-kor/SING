import { HUM_SAMPLES, HumBank } from '/src/voice.js';
import { detectPitch, frequencyToMidi } from '/src/pitch.js';

const TOLERANCE_CENTS = 15;
let passed = 0;
let failed = 0;
const bank = new HumBank();
function assert(value, message) { if (!value) throw new Error(message); }
async function check(label, run) {
  const row = document.createElement('li');
  try { await run(); passed++; row.textContent = `PASS · ${label}`; }
  catch (error) { failed++; row.textContent = `FAIL · ${label}: ${error.message}`; }
  document.querySelector('#results').append(row);
}

if (!HUM_SAMPLES.length) {
  const row = document.createElement('li');
  row.textContent = '등록된 사람 예시음이 없어요';
  document.querySelector('#results').append(row);
}
for (const { midi, ai } of HUM_SAMPLES) {
  await check(`MIDI ${midi}${ai ? ' (AI)' : ''}: 1.5초 이상, 목표음 ±${TOLERANCE_CENTS}센트`, async () => {
    const context = new OfflineAudioContext(1, 44100, 44100);
    const { buffer } = await bank.load(context, midi);
    assert(buffer.duration >= 1.5, `too short: ${buffer.duration.toFixed(2)}s`);
    const samples = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    const estimates = [0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5].map(time => detectPitch(samples.slice(Math.round(time * rate), Math.round(time * rate) + 4096), rate)).filter(Boolean);
    assert(estimates.length >= 3, `only ${estimates.length} pitched frames`);
    const errors = estimates.map(frame => 100 * (frequencyToMidi(frame.frequency) - midi)).sort((a, b) => a - b);
    const cents = errors[Math.floor(errors.length / 2)];
    assert(Math.abs(cents) <= TOLERANCE_CENTS, `median error ${cents.toFixed(1)} cents`);
  });
}
document.querySelector('#summary').textContent = `${passed} passed / ${failed} failed · 마이크·사용자 기록 접근 없음`;
document.title = `SING hum: ${passed} passed, ${failed} failed`;
