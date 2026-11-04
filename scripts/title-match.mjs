// Matching a stored song title against titles from outside services (YouTube, LRCLIB).
// The stored title often comes from TJ ("너의모든순간(별에서온그대OST)"), so its bracketed parts come off;
// a candidate title keeps them, because the song name can sit inside them ("Every Moment Of You(너의 모든 순간)").

/** The title without (…) and […] parts; the whole title when nothing else is left. */
export function coreTitle(title) {
  const text = String(title ?? '');
  const core = text.replace(/\([^)]*\)|\[[^\]]*\]/gu, '').replace(/\s+/gu, ' ').trim();
  return core || text.trim();
}

/** Lowercase letters and digits only: spaces, punctuation and symbols removed, bracketed text kept. */
export const matchKey = text => String(text ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export function titleMatches(candidateTitle, songTitle) {
  const want = matchKey(coreTitle(songTitle));
  const have = matchKey(candidateTitle);
  if (!want) return false;
  return want.length < 2 ? have === want : have.includes(want);
}
