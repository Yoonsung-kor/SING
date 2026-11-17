import assert from 'node:assert/strict';
import test from 'node:test';
import { FILE_LIMITS, fileProblem, decodeToMono, spotTime } from '../src/karaoke-file.js';

const file = (size = 1000) => ({ size, arrayBuffer: async () => new ArrayBuffer(8) });
function fakeContext({ duration = 2, sampleRate = 48000, channels = 2, fail = false } = {}) {
  const made = [];
  class Context {
    constructor(options) { this.options = options; this.closed = 0; made.push(this); }
    async decodeAudioData() {
      if (fail) throw new Error('bad data');
      const rate = this.options?.sampleRate ?? sampleRate;
      const length = Math.round(duration * rate);
      return { duration, sampleRate: rate, numberOfChannels: channels, getChannelData: () => new Float32Array(length).fill(0.1) };
    }
    async close() { this.closed++; }
  }
  return { Context, made };
}

test('files over 50 MB are refused before reading', () => {
  assert.deepEqual(FILE_LIMITS, { bytes: 50 * 1024 * 1024, seconds: 600 });
  assert.equal(fileProblem(file(50 * 1024 * 1024 + 1)), 'too-big');
  assert.equal(fileProblem(file(50 * 1024 * 1024)), null);
});

test('a recording is decoded to 16 kHz mono and the decoder is closed', async () => {
  const { Context, made } = fakeContext({ duration: 2 });
  const { samples } = await decodeToMono(file(), { AudioContextImpl: Context });
  assert.ok(Math.abs(samples.length - 32000) <= 1, String(samples.length));
  assert.ok(Math.abs(samples[1000] - 0.1) < 1e-6);
  assert.equal(made.at(-1).closed, 1);
});

test('a decoder that cannot take the 16 kHz rate still works at its own rate', async () => {
  const { Context } = fakeContext({ duration: 1, sampleRate: 44100 });
  class Picky extends Context { constructor(options) { if (options) throw new Error('rate not supported'); super(); } }
  const { samples } = await decodeToMono(file(), { AudioContextImpl: Picky });
  assert.ok(Math.abs(samples.length - 16000) <= 1, String(samples.length));
});

test('long, unreadable or unsupported recordings are named, and the decoder is still closed', async () => {
  const long = fakeContext({ duration: 601 });
  assert.deepEqual(await decodeToMono(file(), { AudioContextImpl: long.Context }), { problem: 'too-long' });
  assert.equal(long.made.at(-1).closed, 1);
  const broken = fakeContext({ fail: true });
  assert.deepEqual(await decodeToMono(file(), { AudioContextImpl: broken.Context }), { problem: 'unreadable' });
  assert.equal(broken.made.at(-1).closed, 1);
  assert.deepEqual(await decodeToMono(file(), { AudioContextImpl: undefined }), { problem: 'unsupported' });
});

test('a spot\'s time reads like speech', () => {
  assert.equal(spotTime(72.4), '1분 12초쯤');
  assert.equal(spotTime(42), '42초쯤');
  assert.equal(spotTime(125.9), '2분 5초쯤');
});
