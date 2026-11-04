// Song sections from line timing alone. Input lines are { t: seconds, key }; keys are made by the server from each
// sung line, so this module never sees lyric text. Only keys are compared.
// - Chorus: the earliest pair of consecutive lines that comes back together later in the song.
// - Before the chorus: a repeated line that shows up within 30 s before every chorus.
// - Interlude: more than 15 s between two line starts.
export const SECTION_KINDS = ['start', 'verse', 'pre', 'chorus', 'break'];

const PRE_WINDOW = 30;
const BREAK_GAP = 15;
const round1 = value => Math.round(value * 10) / 10;

export function computeSections(lines, duration) {
  const sung = lines.filter(line => line.key);
  if (!sung.length) return [];
  const pairAt = i => `${sung[i].key}\u0000${sung[i + 1]?.key ?? ''}`;
  const pairCount = new Map();
  for (let i = 0; i + 1 < sung.length; i++) pairCount.set(pairAt(i), (pairCount.get(pairAt(i)) ?? 0) + 1);
  let chorusPair = null;
  for (let i = 0; i + 1 < sung.length && !chorusPair; i++) if (pairCount.get(pairAt(i)) > 1) chorusPair = pairAt(i);
  const chorusStarts = chorusPair ? sung.map((_, i) => i).filter(i => pairAt(i) === chorusPair) : [];

  const keyCount = new Map();
  for (const line of sung) keyCount.set(line.key, (keyCount.get(line.key) ?? 0) + 1);
  const chorusKeys = new Set(chorusPair ? chorusPair.split('\u0000') : []);
  let preKey = null;
  if (chorusStarts.length > 1) {
    for (const [key, count] of keyCount) {
      if (count < 2 || chorusKeys.has(key) || preKey) continue;
      const fits = chorusStarts.every((c, n) => sung.some((line, q) => line.key === key && q < c && q > (chorusStarts[n - 1] ?? -1) && sung[c].t - line.t <= PRE_WINDOW));
      if (fits) preKey = key;
    }
  }

  const events = [];
  const breakAfter = [];
  for (let i = 1; i < sung.length; i++) {
    if (sung[i].t - sung[i - 1].t > BREAK_GAP) {
      breakAfter.push(i);
      events.push({ t: round1(Math.min(sung[i - 1].t + 7, sung[i].t - 1)), label: '간주', kind: 'break' });
    }
  }
  // A song that opens on its chorus gets one button there, not a start and a chorus at the same time.
  const opensOnChorus = chorusStarts[0] === 0;
  chorusStarts.forEach((i, n) => {
    const label = n === 0 && opensOnChorus ? '노래 시작 · 후렴 1' : n === chorusStarts.length - 1 && chorusStarts.length > 2 ? '마지막 후렴' : `후렴 ${n + 1}`;
    events.push({ t: sung[i].t, label, kind: 'chorus' });
  });
  if (preKey) sung.forEach((line, i) => { if (line.key === preKey && !chorusStarts.includes(i)) events.push({ t: line.t, label: '후렴 전', kind: 'pre' }); });

  if (!opensOnChorus) events.push({ t: sung[0].t, label: '노래 시작 · 1절', kind: 'start' });
  const lastChorus = chorusStarts.at(-1) ?? -1;
  let verse = 1;
  for (const i of breakAfter) {
    if (chorusStarts.includes(i) || sung[i].key === preKey) continue;
    if (lastChorus >= 0 && i > lastChorus) events.push({ t: sung[i].t, label: '마무리', kind: 'verse' });
    else events.push({ t: sung[i].t, label: `${++verse}절`, kind: 'verse' });
  }
  return events.sort((a, b) => a.t - b.t).filter(event => event.t < duration);
}
