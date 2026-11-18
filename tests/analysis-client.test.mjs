import assert from 'node:assert/strict';
import test from 'node:test';
import { runAnalysis } from '../src/analysis-client.js';

class FakeWorker {
  static made = [];
  constructor(url, options) { this.url = url; this.options = options; this.sent = []; this.terminated = 0; FakeWorker.made.push(this); }
  postMessage(data, transfer) { this.sent.push({ data, transfer }); }
  terminate() { this.terminated++; }
  emit(data) { this.onmessage?.({ data }); }
}
const last = () => FakeWorker.made.at(-1);

test('the analysis runs in a module worker; progress comes through and the worker ends with the result', async () => {
  const samples = Float32Array.from([0.1, 0.2, 0.3]);
  const progress = [];
  const run = runAnalysis(samples, { comfortableHighMidi: 66 }, { WorkerImpl: FakeWorker, onProgress: value => progress.push(value) });
  const worker = last();
  assert.equal(worker.url, '/src/analysis-worker.js');
  assert.deepEqual(worker.options, { type: 'module' });
  const sent = worker.sent[0].data;
  assert.notEqual(sent.samples, samples, 'a copy is sent; the page keeps the recording for listening');
  assert.deepEqual(Array.from(sent.samples), Array.from(samples));
  assert.deepEqual(sent.options, { comfortableHighMidi: 66 });
  assert.equal(samples.length, 3);
  worker.emit({ progress: 0.4 });
  worker.emit({ progress: 0.8 });
  worker.emit({ result: { status: 'ok', spots: [] } });
  assert.deepEqual(await run.promise, { status: 'ok', spots: [] });
  assert.deepEqual(progress, [0.4, 0.8]);
  assert.equal(worker.terminated, 1);
});

test('cancelling ends the worker; a failing worker reports an error; no worker support says so', async () => {
  const cancelled = runAnalysis(new Float32Array(4), {}, { WorkerImpl: FakeWorker });
  cancelled.cancel();
  assert.deepEqual(await cancelled.promise, { status: 'cancelled' });
  assert.equal(last().terminated, 1);
  last().emit({ result: { status: 'ok' } });
  assert.equal(last().terminated, 1, 'a late answer changes nothing');

  const failing = runAnalysis(new Float32Array(4), {}, { WorkerImpl: FakeWorker });
  last().emit({ error: true });
  assert.deepEqual(await failing.promise, { status: 'error' });

  const crashed = runAnalysis(new Float32Array(4), {}, { WorkerImpl: FakeWorker });
  last().onerror?.(new Error('module failed'));
  assert.deepEqual(await crashed.promise, { status: 'error' });

  assert.deepEqual(await runAnalysis(new Float32Array(4), {}, { WorkerImpl: undefined }).promise, { status: 'unsupported' });
});
