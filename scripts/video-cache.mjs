// Found videos, kept in memory for a week: YouTube's daily search quota is small, and friends open the same songs.
// Only answers with at least one video are kept; failures and empty answers are asked again next time.
const normal = text => String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

export function createVideoCache({ find, now = Date.now, ttlMs = 7 * 86400000, max = 500 }) {
  // key -> { at, result }, in insertion order (a Map keeps it), so the first entry is the oldest.
  const kept = new Map();
  const pending = new Map();

  return async function cachedFind({ side, title, artist, duration }) {
    const key = [side, normal(title), normal(artist), Number.isFinite(duration) ? Math.round(duration) : ''].join('\u0000');
    const hit = kept.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.result;
    if (hit) kept.delete(key);
    if (pending.has(key)) return pending.get(key);
    const search = (async () => {
      const result = await find({ side, title, artist, duration });
      if (Array.isArray(result?.candidates) && result.candidates.length) {
        kept.set(key, { at: now(), result });
        while (kept.size > max) kept.delete(kept.keys().next().value);
      }
      return result;
    })();
    pending.set(key, search);
    try { return await search; }
    finally { pending.delete(key); }
  };
}
