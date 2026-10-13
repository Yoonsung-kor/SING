import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleFor, PianoBank } from '../src/piano.js';

test('references use nearby recorded piano notes with exact semitone transposition', () => {
  assert.deepEqual(sampleFor(60), { midi: 60, url: '/assets/piano-C4.mp3', playbackRate: 1 });
  const d = sampleFor(62);
  assert.equal(d.midi, 63);
  assert.equal(d.url, '/assets/piano-Ds4.mp3');
  assert.ok(Math.abs(d.playbackRate - 2 ** (-1 / 12)) < 1e-10);
  for (let midi = 36; midi <= 84; midi++) {
    const chosen = sampleFor(midi);
    assert.ok(Math.abs(chosen.midi - midi) <= 1);
    assert.ok(Math.abs(chosen.playbackRate * 440 * 2 ** ((chosen.midi - 69) / 12) - 440 * 2 ** ((midi - 69) / 12)) < 1e-8);
  }
});

test('invalid target notes never request a sample', () => {
  for (const value of [null, NaN, Infinity, '60', 35, 85, 60.5]) assert.throws(() => sampleFor(value));
});

test('decoded sample cache serves adjacent notes without another download', async () => {
  let downloads = 0;
  const bank = new PianoBank(async url => {
    downloads++;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  });
  const context = { decodeAudioData: async bytes => ({ decoded: new TextDecoder().decode(bytes) }) };
  const first = await bank.load(context, 60);
  const second = await bank.load(context, 61);
  assert.equal(first.buffer, second.buffer);
  assert.equal(first.buffer.decoded, '/assets/piano-C4.mp3');
  assert.equal(downloads, 1);
  assert.notEqual(first.playbackRate, second.playbackRate);
});

test('missing or undecodable samples fail clearly and can be retried', async () => {
  let attempts = 0;
  const bank = new PianoBank(async () => ({ ok: ++attempts > 1, arrayBuffer: async () => new ArrayBuffer(4) }));
  const context = { decodeAudioData: async () => ({ duration: 3 }) };
  await assert.rejects(bank.load(context, 60), /피아노/);
  assert.equal((await bank.load(context, 60)).buffer.duration, 3);
  const broken = new PianoBank(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
  await assert.rejects(broken.load({ decodeAudioData: async () => { throw new Error('bad codec'); } }, 60), /피아노/);
});
