// Starts the karaoke analysis in a module worker and hands back { promise, cancel }. The promise ends with the
// report, { status: 'cancelled' }, { status: 'error' } or { status: 'unsupported' }; the worker is always ended.
export function runAnalysis(samples, options, { WorkerImpl = globalThis.Worker, onProgress = () => {} } = {}) {
  const unsupported = { promise: Promise.resolve({ status: 'unsupported' }), cancel() {} };
  if (typeof WorkerImpl !== 'function') return unsupported;
  let worker;
  try { worker = new WorkerImpl('/src/analysis-worker.js', { type: 'module' }); }
  catch { return unsupported; }
  let settle;
  const promise = new Promise(resolve => { settle = resolve; });
  let done = false;
  const end = value => {
    if (done) return;
    done = true;
    worker.terminate();
    settle(value);
  };
  worker.onmessage = event => {
    const data = event.data ?? {};
    if (typeof data.progress === 'number') { if (!done) onProgress(data.progress); }
    else if (data.result) end(data.result);
    else end({ status: 'error' });
  };
  worker.onerror = () => end({ status: 'error' });
  // A copy goes to the worker: the page keeps the recording for "내 녹음 듣기".
  const copy = Float32Array.from(samples);
  worker.postMessage({ samples: copy, options }, [copy.buffer]);
  return { promise, cancel: () => end({ status: 'cancelled' }) };
}
