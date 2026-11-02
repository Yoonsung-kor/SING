// Server-side services behind the API: the AI finds, this code checks. Each piece can be swapped in tests.
import { fetchSongRange } from './ai.mjs';
import { verifyHighest, fetchPageText } from './verify-source.mjs';

export function createServices({ apiKey, model, fetchImpl = fetch, getPage = fetchPageText, now = Date.now, budgetMs = 60000, search = null } = {}) {
  const aiOn = Boolean(apiKey && model);

  /** One song's highest notes, only when the cited page backs them up. */
  async function lookupRange({ title, artist }) {
    const raw = await fetchSongRange({ title, artist }, { apiKey, model, fetchImpl });
    if (!raw?.found) return null;
    return verifyHighest(raw, { getPage });
  }

  return { lookupRange: aiOn ? lookupRange : null, recommend: null, searchSongs: search, now, budgetMs };
}
