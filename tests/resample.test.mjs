import assert from 'node:assert/strict';
import test from 'node:test';
import { monoAt16k, leveled } from '../src/resample.js';

const sine = (rate, seconds, hz, amplitude = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate));
const upward = samples => { let count = 0; for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) count++; return count; };
const peakOf = samples => samples.reduce((top, v) => Math.max(top, Math.abs(v)), 0);
const loudness = samples => {
  const size = 800;
  const levels = [];
  for (let i = 0; i + size <= samples.length; i += size) { let sum = 0; for (let j = i; j < i + size; j++) sum += samples[j] ** 2; levels.push(Math.sqrt(sum / size)); }
  return levels.sort((a, b) => a - b)[Math.floor(levels.length * 0.95)];
};

test('48 kHz and 44.1 kHz recordings become 16 kHz with the pitch and the loudness kept', () => {
  for (const rate of [48000, 44100]) {
    const out = monoAt16k([sine(rate, 1, 440)], rate);
    assert.equal(out.length, 16000, String(rate));
    const crossings = upward(out);
    assert.ok(crossings >= 438 && crossings <= 442, `${rate}: ${crossings}`);
    assert.ok(peakOf(out.subarray(100)) >= 0.45, `${rate}: ${peakOf(out)}`);
  }
});

test('channels are averaged into one', () => {
  const left = sine(48000, 1, 440);
  const out = monoAt16k([left, new Float32Array(left.length)], 48000);
  assert.ok(Math.abs(peakOf(out.subarray(100)) - 0.25) < 0.02, String(peakOf(out)));
});

test('16 kHz audio is left as it is', () => {
  const input = sine(16000, 0.5, 300);
  assert.deepEqual(Array.from(monoAt16k([input], 16000)), Array.from(input));
});

test('a rate that is too low or not a number is refused', () => {
  assert.throws(() => monoAt16k([new Float32Array(100)], 4000));
  assert.throws(() => monoAt16k([new Float32Array(100)], Number.NaN));
});

test('the level is brought to the same loudness, never past 0.95, and silence stays silent', () => {
  const quiet = leveled(sine(16000, 2, 300, 0.01));
  assert.ok(Math.abs(loudness(quiet) - 0.1) <= 0.01, String(loudness(quiet)));
  const click = new Float32Array(16000);
  click[100] = 1;
  assert.ok(peakOf(leveled(click)) <= 0.95);
  assert.ok(leveled(new Float32Array(16000)).every(v => v === 0));
});
