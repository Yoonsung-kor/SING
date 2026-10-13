import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneLease } from '../src/capture.js';

function stream() {
  const track = { stops: 0, stop() { this.stops++; } };
  return { getTracks: () => [track], track };
}

test('permission granted after cancellation immediately releases the microphone', async () => {
  let resolve;
  const lease = new MicrophoneLease({ getUserMedia: () => new Promise(r => { resolve = r; }) });
  const pending = lease.acquire();
  lease.release();
  const mic = stream();
  resolve(mic);
  assert.equal(await pending, null);
  assert.equal(mic.track.stops, 1);
});

test('a newer request owns the mic and older late results are discarded', async () => {
  const pending = [];
  const lease = new MicrophoneLease({ getUserMedia: () => new Promise(r => pending.push(r)) });
  const first = lease.acquire();
  const second = lease.acquire();
  const oldMic = stream();
  const newMic = stream();
  pending[1](newMic);
  assert.equal(await second, newMic);
  pending[0](oldMic);
  assert.equal(await first, null);
  assert.equal(oldMic.track.stops, 1);
  assert.equal(newMic.track.stops, 0);
  lease.release();
  assert.equal(newMic.track.stops, 1);
});

test('normal release is idempotent and permission denial remains retryable', async () => {
  const mic = stream();
  let tries = 0;
  const lease = new MicrophoneLease({ getUserMedia: async () => {
    if (++tries === 1) throw new Error('permission denied');
    return mic;
  } });
  await assert.rejects(lease.acquire(), /permission/);
  assert.equal(await lease.acquire(), mic);
  lease.release();
  lease.release();
  assert.equal(mic.track.stops, 1);
});
