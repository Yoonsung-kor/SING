import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPitch,
  frequencyToMidi,
  midiToFrequency,
  noteName,
  summarizePitch,
} from '../src/pitch.js';

// Analytic signals provide known frequencies, independent of the detector.
function tone(frequency, sampleRate = 48000, amplitude = 0.4, length = 4096) {
  return Float32Array.from({ length }, (_, i) =>
    amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate));
}

function noise(seed, length = 4096) {
  let state = seed;
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 0.4 * (state / 4294967296 - 0.5);
  });
}

function frame(frequency, overrides = {}) {
  return { frequency, clarity: 0.99, rms: 0.2, ...overrides };
}

function assertFrequency(actual, expected, toleranceCents = 5) {
  assert.ok(actual, `Expected detection near ${expected} Hz`);
  const errorCents = 1200 * Math.log2(actual.frequency / expected);
  assert.ok(Math.abs(errorCents) <= toleranceCents,
    `${actual.frequency} Hz differs from ${expected} Hz by ${errorCents} cents`);
  assert.ok(actual.clarity > 0.85 && actual.clarity <= 1);
  assert.ok(Number.isFinite(actual.rms) && actual.rms > 0);
}

for (const sampleRate of [44100, 48000]) {
  for (const frequency of [110, 220, 440]) {
    test(`detects ${frequency} Hz at ${sampleRate} Hz without changing the input`, () => {
      const samples = tone(frequency, sampleRate);
      const before = samples.slice();
      assertFrequency(detectPitch(samples, sampleRate), frequency);
      assert.deepEqual(samples, before);
    });
  }
}

test('detects a fundamental even when the second harmonic is louder', () => {
  for (const sampleRate of [44100, 48000]) {
    const samples = Float32Array.from({ length: 4096 }, (_, i) => {
      const phase = 2 * Math.PI * 110 * i / sampleRate;
      return 0.12 * Math.sin(phase) + 0.45 * Math.sin(2 * phase) + 0.07 * Math.sin(3 * phase);
    });
    assertFrequency(detectPitch(samples, sampleRate), 110);
  }
});

test('keeps detuning rather than snapping a detected tone to a note', () => {
  assertFrequency(detectPitch(tone(445), 48000), 445);
});

test('detects low and high tones across the supported range without selecting period multiples', () => {
  for (const sampleRate of [44100, 48000]) {
    for (const frequency of [70, 75, 82.4069, 659.255, 880, 960, 990, 1000]) {
      assertFrequency(detectPitch(tone(frequency, sampleRate), sampleRate), frequency, 8);
    }
  }
});

test('rejects silence, near silence, DC offsets, and seeded broadband noise', () => {
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
  assert.equal(detectPitch(tone(220, 48000, 0.001), 48000), null);
  assert.equal(detectPitch(new Float32Array(4096).fill(0.2), 48000), null);
  for (const seed of [1, 42, 8192, 65535]) {
    assert.equal(detectPitch(noise(seed), 48000), null);
  }
});

test('rejects clearly saturated audio', () => {
  const clipped = tone(220, 48000, 3).map(value => Math.max(-1, Math.min(1, value)));
  assert.equal(detectPitch(clipped, 48000), null);
});

test('does not alias out-of-range pure tones into the supported range', () => {
  assert.equal(detectPitch(tone(50), 48000), null);
  assert.equal(detectPitch(tone(69), 48000), null);
  assert.equal(detectPitch(tone(1010), 48000), null);
  assert.equal(detectPitch(tone(1500), 48000), null);
});

test('handles empty, short, nonfinite, and invalid sample-rate inputs', () => {
  assert.equal(detectPitch(new Float32Array(), 48000), null);
  assert.equal(detectPitch(tone(220, 48000, 0.4, 64), 48000), null);
  assert.equal(detectPitch(null, 48000), null);
  for (const sampleRate of [0, -1, NaN, Infinity]) {
    assert.equal(detectPitch(tone(220), sampleRate), null);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    const samples = tone(220);
    samples[400] = value;
    assert.equal(detectPitch(samples, 48000), null);
  }
});

test('converts known pitches without rounding fractional MIDI values', () => {
  assert.equal(frequencyToMidi(440), 69);
  assert.equal(frequencyToMidi(220), 57);
  assert.ok(Math.abs(frequencyToMidi(445) - 69.19562175) < 0.000001);
  assert.equal(midiToFrequency(69), 440);
  assert.equal(midiToFrequency(57), 220);
  assert.ok(Math.abs(midiToFrequency(60) - 261.6255653) < 0.000001);
});

test('does not turn invalid numeric inputs into usable notes', () => {
  for (const value of [0, -1, NaN, Infinity, null, undefined, '440']) {
    assert.ok(Number.isNaN(frequencyToMidi(value)));
  }
  for (const value of [NaN, Infinity, null, undefined, '69']) {
    assert.ok(Number.isNaN(midiToFrequency(value)));
    assert.equal(noteName(value), null);
  }
});

test('labels middle C and octave boundaries consistently in Korean and scientific notation', () => {
  assert.deepEqual(noteName(60), { name: '도', octave: 4, label: '도 · C4', scientific: 'C4' });
  assert.deepEqual(noteName(61), { name: '도♯', octave: 4, label: '도♯ · C♯4', scientific: 'C♯4' });
  assert.deepEqual(noteName(59), { name: '시', octave: 3, label: '시 · B3', scientific: 'B3' });
  assert.deepEqual(noteName(69.2), { name: '라', octave: 4, label: '라 · A4', scientific: 'A4' });
});

test('summarizes a sustained, slightly detuned tone without hiding cents', () => {
  const frames = Array.from({ length: 60 }, (_, i) => i < 45 ? frame(445) : null);
  const result = summarizePitch(frames);
  assert.equal(result.reliable, true);
  assert.equal(result.midi, 69);
  assert.ok(Math.abs(result.frequency - 445) < 0.000001);
  assert.ok(Math.abs(result.cents - 19.562175) < 0.00001);
  assert.equal(typeof result.reason, 'string');
});

test('accepts small natural pitch variation with enough valid frames', () => {
  const frames = Array.from({ length: 40 }, (_, i) => frame([219, 220, 221, 220][i % 4]));
  const result = summarizePitch(frames);
  assert.equal(result.reliable, true);
  assert.equal(result.midi, 57);
  assert.ok(Math.abs(result.cents) < 1);
});

test('counts null frames when refusing a sparse or very short voiced segment', () => {
  const sparse = [...Array.from({ length: 20 }, () => frame(220)), ...Array(40).fill(null)];
  assert.equal(summarizePitch(sparse).reliable, false);
  assert.equal(summarizePitch(Array.from({ length: 9 }, () => frame(220))).reliable, false);
  const enough = [...Array.from({ length: 27 }, () => frame(220)), ...Array(33).fill(null)];
  assert.equal(summarizePitch(enough).reliable, true);
});

test('rejects temporal octave changes instead of correcting them', () => {
  const frames = [...Array.from({ length: 30 }, () => frame(220)), ...Array.from({ length: 30 }, () => frame(440))];
  const result = summarizePitch(frames);
  assert.equal(result.reliable, false);
  assert.equal(result.midi, null);
  assert.equal(result.frequency, null);
  assert.equal(result.cents, null);
});

test('rejects wide drifting pitches and an isolated large pitch jump', () => {
  const drifting = Array.from({ length: 60 }, (_, i) => frame(200 + i));
  assert.equal(summarizePitch(drifting).reliable, false);
  const jumping = Array.from({ length: 60 }, (_, i) => frame(i === 30 ? 440 : 220));
  assert.equal(summarizePitch(jumping).reliable, false);
});

test('excludes invalid and low-confidence frames from reliable results', () => {
  const invalid = [null, frame(NaN), frame(0), frame(1500), frame(220, { clarity: 0.2 }), frame(220, { rms: 0 })];
  for (const frames of [[], null, Array(60).fill(null), ...invalid.map(value => Array(60).fill(value))]) {
    const result = summarizePitch(frames);
    assert.equal(result.reliable, false);
    assert.equal(result.midi, null);
    assert.equal(result.frequency, null);
    assert.equal(result.cents, null);
    assert.ok(result.reason.length > 0);
  }
});
