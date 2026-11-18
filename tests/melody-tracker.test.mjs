import assert from 'node:assert/strict';
import test from 'node:test';
import { trackMelody, TRACKER_DEFAULTS } from '../src/melody-tracker.js';
import { makeMelody, renderVoice, renderGuide, karaokeEcho, mixAt, renderBacking, normalized, tally, rates, truthFromTrack, TRUTH_STEP_S } from './helpers/synth-voice.mjs';

// The experiment's synthetic material, made at 16 kHz directly. Numbers in comments are what the experiment measured.
const RATE = 16000;
const SECONDS = 20;
const notes = makeMelody({ seed: 21, seconds: SECONDS, low: 52, high: 69 });
const { samples, truth } = renderVoice(notes, RATE, { seed: 22, seconds: SECONDS });
const voice = karaokeEcho(samples, RATE);
const truthAt = truthFromTrack(truth, TRUTH_STEP_S);
const backing = renderBacking(SECONDS, RATE);
const scoreOf = audio => rates(tally(trackMelody(normalized(audio, RATE)), truthAt));
const voicedShare = audio => { const frames = trackMelody(normalized(audio, RATE)); return 100 * frames.filter(frame => frame.midi !== null).length / frames.length; };

test('the settings are the experiment\'s', () => {
  assert.ok(Object.isFrozen(TRACKER_DEFAULTS));
  assert.deepEqual(TRACKER_DEFAULTS, {
    rate: 16000, window: 1024, fft: 4096, hop: 320, lowMidi: 40, highMidi: 84, minPeakHz: 60, maxPeakHz: 5000, peakFloorDb: 45,
    lowCut: 150, presence: 1.0, harmonics: 20, decay: 0.85, compress: 1, binCents: 10, lobeCents: 40, candidates: 5,
    jumpCost: 0.12, jumpCap: 8, unvoiced: 0.2, switchCost: 0.3, oddReal: 0.25, aliasPenalty: 0.7, minRun: 3,
    machineGrid: 8, machineSpread: 50, noteFrames: 6,
  });
});

test('the singer alone is followed (93.8% within a semitone, 100% right when heard, 0.2% false voice)', () => {
  const score = scoreOf(voice);
  assert.ok(score.within100 >= 88, JSON.stringify(score));
  assert.ok(score.rightWhenHeard >= 99, JSON.stringify(score));
  assert.ok(score.falseVoice <= 3, JSON.stringify(score));
});

test('the singer over an accompaniment 6 dB quieter is followed (95.9%, 100%)', () => {
  const score = scoreOf(mixAt(voice, backing, RATE, 6));
  assert.ok(score.within100 >= 88, JSON.stringify(score));
  assert.ok(score.rightWhenHeard >= 97, JSON.stringify(score));
});

test('the accompaniment alone is not taken for a voice (0%)', () => {
  assert.ok(voicedShare(backing) <= 5);
});

test('a guide melody alone is mostly not taken for a voice (flute 16.6%, lead 9.7%)', () => {
  assert.ok(voicedShare(renderGuide(notes, RATE, { seconds: SECONDS, timbre: 'flute' })) <= 30);
  assert.ok(voicedShare(renderGuide(notes, RATE, { seconds: SECONDS, timbre: 'lead' })) <= 25);
});

test('silence has no notes, and no samples give no frames', () => {
  const quiet = trackMelody(new Float32Array(5 * RATE));
  assert.ok(quiet.length > 0);
  assert.equal(quiet.filter(frame => frame.midi !== null).length, 0);
  assert.deepEqual(trackMelody(new Float32Array(0)), []);
});

test('frames come every 20 ms with the song time of the window centre', () => {
  const frames = trackMelody(normalized(voice, RATE));
  assert.ok(Math.abs(frames[0].songTime - 1024 / 2 / RATE) < 1e-9);
  for (let i = 1; i < 50; i++) assert.ok(Math.abs(frames[i].songTime - frames[i - 1].songTime - 0.02) < 1e-9);
  assert.deepEqual(Object.keys(frames[0]).sort(), ['midi', 'songTime', 'strength']);
});

test('progress climbs and ends at 1; the same input gives the same answer, quickly', () => {
  const seen = [];
  const started = Date.now();
  const first = trackMelody(normalized(voice, RATE), { onProgress: value => seen.push(value) });
  assert.ok(Date.now() - started < 5000, 'twenty seconds in under five');
  assert.ok(seen.length >= 3);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
  assert.equal(seen.at(-1), 1);
  assert.deepEqual(trackMelody(normalized(voice, RATE)), first);
});
