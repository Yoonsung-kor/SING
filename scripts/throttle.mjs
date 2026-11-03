// One request queue per outside service: requests leave at least minIntervalMs apart, and a request that had to
// queue behind another is dropped (STALE) once a newer one has arrived, because the user has typed past it.
// A job that makes several requests (a search and its retries) runs as one task and checks isStale() between them.
export const STALE = Symbol('stale');

export function createQueue({ now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), minIntervalMs = 1000 } = {}) {
  let lastSent = -Infinity;
  let chain = Promise.resolve();
  let latest = 0;
  let pending = 0;
  return function run(task) {
    const ticket = ++latest;
    // Only a request that arrives when nothing is pending goes out no matter what; queued ones can go stale.
    const queued = pending > 0;
    pending++;
    const result = chain.then(async () => {
      if (queued && ticket !== latest) return STALE;
      const wait = lastSent + minIntervalMs - now();
      if (wait > 0) {
        await sleep(wait);
        if (ticket !== latest) return STALE;
      }
      lastSent = now();
      try { return await task({ isStale: () => ticket !== latest }); }
      finally { lastSent = now(); }
    });
    const settled = result.finally(() => { pending--; });
    chain = settled.catch(() => {});
    return settled;
  };
}
