const STATUSES = ['want', 'practicing', 'comfortable'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message) { throw new Error(message); }
function text(value, label, max, required = false) {
  if (typeof value !== 'string') fail(`${label}을(를) 확인해 주세요.`);
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > max) fail(`${label}을(를) 확인해 주세요. (최대 ${max}자)`);
  return trimmed;
}
function midi(value, label) {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 127)) fail(`${label}은(는) 0~127 사이의 음이어야 해요.`);
}
function time(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label}이(가) 올바르지 않아요.`);
}
function checkFields(song) {
  text(song.title, '제목', 120, true);
  text(song.artist, '가수', 120);
  text(song.originalKey, '원곡 키', 40);
  midi(song.lowestMidi, '최저음');
  midi(song.highestMidi, '최고음');
  if ((song.lowestMidi === null) !== (song.highestMidi === null)
    || (song.lowestMidi !== null && song.lowestMidi > song.highestMidi)) fail('음역은 최저음과 최고음을 함께 올바른 순서로 입력해 주세요.');
  if (!Number.isInteger(song.keyOffset) || song.keyOffset < -12 || song.keyOffset > 12) fail('키 조정은 -12~12 반음으로 입력해 주세요.');
  if (!STATUSES.includes(song.status)) fail('곡 상태를 확인해 주세요.');
  const url = text(song.lyricsUrl, '가사 링크', 2048);
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { fail('가사 링크는 HTTPS 주소로 입력해 주세요.'); }
    if (parsed.protocol !== 'https:' || !parsed.hostname) fail('가사 링크는 HTTPS 주소로 입력해 주세요.');
  }
  text(song.note, '메모', 1000);
}

export function validateSong(song) {
  if (!song || typeof song !== 'object' || Array.isArray(song)) fail('곡 정보가 올바르지 않아요.');
  if (typeof song.id !== 'string' || !UUID.test(song.id)) fail('곡 ID가 올바르지 않아요.');
  checkFields(song);
  time(song.createdAt, '생성 날짜');
  time(song.updatedAt, '수정 날짜');
  return song;
}

function isoNow(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) fail('날짜가 올바르지 않아요.');
  return now.toISOString();
}
function buildFields(fields, base) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail('곡 정보를 입력해 주세요.');
  const pick = key => fields[key] === undefined ? base[key] : fields[key];
  const song = {
    title: pick('title'),
    artist: pick('artist'),
    originalKey: pick('originalKey'),
    lowestMidi: pick('lowestMidi'),
    highestMidi: pick('highestMidi'),
    keyOffset: pick('keyOffset'),
    status: pick('status'),
    lyricsUrl: pick('lyricsUrl'),
    note: pick('note'),
  };
  // Persist normalized text so search and the UI see the same values.
  for (const key of ['title', 'artist', 'originalKey', 'lyricsUrl', 'note']) {
    if (typeof song[key] === 'string') song[key] = song[key].trim();
  }
  checkFields(song);
  return song;
}

export function createSong(fields, now = new Date()) {
  const timestamp = isoNow(now);
  const data = buildFields(fields, {
    title: undefined, artist: '', originalKey: '', lowestMidi: null,
    highestMidi: null, keyOffset: 0, status: 'want', lyricsUrl: '', note: '',
  });
  return { id: crypto.randomUUID(), ...data, createdAt: timestamp, updatedAt: timestamp };
}

export function updateSong(existing, fields, now = new Date()) {
  validateSong(existing);
  const timestamp = isoNow(now);
  const data = buildFields(fields, existing);
  return { ...existing, ...data, updatedAt: timestamp };
}

function searchText(value) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '');
}

export function searchSongs(songs, query, status = 'all') {
  if (!Array.isArray(songs)) fail('곡 목록이 올바르지 않아요.');
  if (typeof query !== 'string') fail('검색어를 확인해 주세요.');
  if (status !== 'all' && !STATUSES.includes(status)) fail('곡 상태를 확인해 주세요.');
  const needle = searchText(query);
  return songs.filter(song => (status === 'all' || song.status === status)
    && (!needle || searchText(song.title).includes(needle) || searchText(song.artist).includes(needle)));
}
