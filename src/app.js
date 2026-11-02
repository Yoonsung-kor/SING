import { createLesson, recordAttempt, nextTarget, finishLesson, summarizeLesson, recommendedNote, localDay, addActivity, needsDailyCheck } from './lesson.js';
import { defaultState, openStore } from './storage.js';
import { AudioEngine, microphoneError } from './audio.js';
import { noteName, frequencyToMidi } from './pitch.js';
import { renderView } from './views.js';
import { createSong, updateSong } from './songs.js';
import { createPlaylist, renamePlaylist, removeSong, applyMembership, removeSongEverywhere, addSong, setRecommendations, takeRecommendation, rejectRecommendation, isValidRecItem, PLAYLIST_LIMITS } from './playlists.js';
import { buildRecommendationRequest, suggestKey } from './recommend.js';
import { playlistHomeResults } from './playlist-views.js';

const root = document.querySelector('#app');
const audio = new AudioEngine();
let store = null;
let state = defaultState();
let liveState = null;
let liveStorageError = '';
let page = 'home';
let session = null;
let pending = null;
let playUrl = null;
let savedPlayUrl = null;
let busy = false;
let demo = false;
let error = '';
let storageError = '';
let initialized = false;
let operation = 0;
let songQuery = '';
let songDraft = null;
let songError = '';
let selectedSongId = null;
let selectedPlaylistId = null;
let playlistDraft = null;
let playlistError = '';
let recLoading = null;
let recError = null;
let toastTimer;

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 4500);
}

function render(focus = false) {
  root.innerHTML = renderView({ page, state, session, pending, playUrl, busy, demo, error, storageError, songQuery, songDraft, songError, selectedSongId, selectedPlaylistId, playlistDraft, playlistError, recLoading, recError, loading: !initialized && !demo });
  if (focus) { document.querySelector('#main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}

function releasePlayback() {
  document.querySelectorAll('audio').forEach(player => player.pause());
  if (playUrl) URL.revokeObjectURL(playUrl);
  if (savedPlayUrl) URL.revokeObjectURL(savedPlayUrl);
  playUrl = savedPlayUrl = null;
}

function cancelCapture() {
  operation++;
  audio.cancel();
  releasePlayback();
  pending = null;
  busy = false;
}

function navigate(target) {
  cancelCapture();
  error = '';
  page = target;
  render(true);
}

async function persist(next = state) {
  state = next;
  if (demo) return true;
  if (!initialized || !store) {
    storageError = '기록 저장소를 열지 못했어요. 브라우저의 사이트 저장 공간을 허용하고 새로고침해 주세요. 체험 모드는 사용할 수 있어요.';
    render();
    return false;
  }
  try {
    await store.saveState(next);
    storageError = '';
    return true;
  } catch {
    storageError = '기기에 저장하지 못했어요. 화면의 기록은 유지하고 있어요. 저장 공간을 확인한 뒤 다시 저장해 주세요.';
    render();
    return false;
  }
}

async function saveDraft() {
  return persist({ ...state, draft: session });
}

async function initialize() {
  try {
    store = await openStore();
    const loadedState = await store.getState();
    // A user can enter the in-memory demo before IndexedDB finishes opening.
    // Restore loaded records after the demo instead of replacing its sandbox.
    if (demo) { liveState = loadedState; liveStorageError = ''; }
    else { state = loadedState; storageError = ''; }
    initialized = true;
  } catch {
    const message = '기록 저장소를 열지 못했어요. 브라우저의 사이트 저장 공간을 허용하고 새로고침해 주세요. 체험 모드는 사용할 수 있어요.';
    if (demo) liveStorageError = message;
    else storageError = message;
  }
  render();
}

async function resumeOrCreate() {
  if (busy) return;
  busy = 'saving'; render();
  if (state.draft?.day === localDay()) {
    session = state.draft;
    navigate(session.status === 'finished' ? 'result' : 'explore');
    return;
  }
  if (state.draft) {
    const interrupted = finishLesson(state.draft, 'interrupted');
    state = { ...state, sessions: [...state.sessions.filter(s => s.id !== interrupted.id), interrupted], draft: null };
  }
  const previous = state.sessions.filter(s => s.completedAt).at(-1);
  session = createLesson(new Date(), previous ? recommendedNote(previous) : null);
  await saveDraft();
  navigate('intro');
}

async function finish(reason = 'user') {
  cancelCapture();
  busy = 'saving';
  session = finishLesson(session, reason);
  // A pain response in follow-up practice must also disable any further vocal exercise.
  if (reason === 'pain') session = { ...session, stopReason: 'pain' };
  await saveDraft();
  navigate('result');
}

function updateProgress(amount, frame) {
  const progress = document.querySelector('#record-progress');
  const status = document.querySelector('#capture-status');
  if (progress) { progress.hidden = false; progress.value = amount; }
  if (status) {
    const text = frame ? noteName(Math.round(frequencyToMidi(frame.frequency)))?.label : null;
    status.textContent = `${Math.max(1, Math.ceil(3 * (1 - amount)))}초 · 편한 소리로 ‘음—’${text ? ` · ${text}` : ''}`;
  }
}

async function capture(practice = false) {
  if (busy || pending || !session) return;
  if (needsDailyCheck(session)) {
    navigate('check');
    toast('날짜가 바뀌었어요. 오늘의 목소리 상태부터 다시 확인해 주세요.');
    return;
  }
  releasePlayback();
  error = '';
  const token = ++operation;
  const target = practice ? recommendedNote(session) : session.targetMidi;
  if (practice && target === null) { toast('반복해서 확인한 음이 아직 없어요.'); return; }
  try {
    if (target !== null && !demo) {
      busy = 'tone'; render();
      const played = await audio.tone(target);
      if (!played || token !== operation) return;
      await new Promise(resolve => setTimeout(resolve, 400));
      if (token !== operation) return;
    }
    busy = 'recording'; render();
    let captured;
    if (demo) {
      await new Promise(resolve => setTimeout(resolve, 650));
      captured = { measurement: { reliable: true, midi: target ?? 57, cents: 3, frequency: 220, reason: 'stable' }, blob: null };
    } else {
      let lastFrame = null;
      captured = await audio.record({ onPitch: frame => { lastFrame = frame; }, onProgress: value => { if (token === operation) updateProgress(value, lastFrame); } });
    }
    if (token !== operation) return;
    if (!captured) { busy = false; render(); return; }
    pending = captured;
    if (captured.blob) playUrl = URL.createObjectURL(captured.blob);
    busy = false;
    render();
    document.querySelector('.feedback-question')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (err) {
    if (token !== operation) return;
    busy = false;
    error = microphoneError(err);
    render();
  }
}

async function keepRecording(captured) {
  if (!state.settings.keepAudio || !captured.blob || demo) return null;
  const id = crypto.randomUUID();
  try { await store.putRecording(id, captured.blob); return id; }
  catch { toast('원음은 저장하지 못했어요. 음높이와 느낌은 계속 기록할게요.'); return null; }
}

async function respond(comfort, practice = false) {
  if (!pending || busy) return;
  busy = 'saving'; render();
  const captured = pending;
  const recordingId = await keepRecording(captured);
  const measurement = { ...captured.measurement, recordingId };
  if (practice) {
    session = { ...session, practice: { midi: recommendedNote(session), measurement: captured.measurement, comfort, recordingId, completedAt: new Date().toISOString() } };
    pending = null;
    releasePlayback();
    busy = false;
    await saveDraft();
    await saveSession();
  } else {
    session = recordAttempt(session, measurement, comfort);
    pending = null;
    releasePlayback();
    busy = false;
    await saveDraft();
    navigate(session.status === 'finished' ? 'result' : 'explore');
  }
}

async function saveSession(destination = 'done') {
  if (!session || busy) return;
  busy = 'saving'; render();
  const completed = { ...finishLesson(session), completedAt: new Date().toISOString() };
  let next = { ...state, sessions: [...state.sessions.filter(s => s.id !== completed.id), completed], draft: null };
  if (summarizeLesson(completed).notes.length) next = addActivity(next, 'practice', completed.id);
  const saved = await persist(next);
  busy = false;
  session = completed;
  if (saved) navigate(destination);
  else { state = { ...state, draft: completed }; page = 'result'; render(); }
}

async function recordActivity(type) {
  if (busy) return;
  busy = 'saving'; render();
  const saved = await persist(addActivity(state, type));
  busy = false;
  if (saved) { navigate('home'); toast(type === 'learn' ? '오늘의 배움을 기록했어요.' : '오늘의 휴식을 기록했어요.'); }
  else render();
}

function enterDemo() {
  if (demo) return navigate('check');
  cancelCapture();
  liveState = state;
  liveStorageError = storageError;
  state = defaultState();
  demo = true;
  session = null;
  storageError = '';
  navigate('check');
}

function exitDemo() {
  cancelCapture();
  demo = false;
  state = liveState || defaultState();
  storageError = liveStorageError;
  liveState = null;
  session = null;
  songDraft = null;
  selectedSongId = null;
  selectedPlaylistId = null;
  playlistDraft = null;
  songQuery = '';
  navigate('home');
}

function readSongForm(form) {
  const data = new FormData(form);
  songDraft = { ...songDraft, ...Object.fromEntries(data), playlistIds: data.getAll('playlistIds') };
}

async function saveSong(form) {
  if (busy) return;
  readSongForm(form);
  songError = '';
  let song;
  try {
    const fields = { ...songDraft, keyOffset: Number(songDraft.keyOffset), lowestMidi: songDraft.lowestMidi === '' ? null : Number(songDraft.lowestMidi), highestMidi: songDraft.highestMidi === '' ? null : Number(songDraft.highestMidi) };
    const existing = state.songs.find(s => s.id === songDraft.id);
    // Saving the form makes every value the user's own; a hand-edited range no longer matches its source.
    fields.origin = 'user';
    if (fields.lowestMidi === null || (existing && (existing.lowestMidi !== fields.lowestMidi || existing.highestMidi !== fields.highestMidi))) fields.rangeSourceUrl = '';
    song = existing ? updateSong(existing, fields) : createSong(fields);
    if (!existing && state.songs.length >= 500) throw new Error('곡은 500곡까지 담을 수 있어요.');
  } catch (err) {
    songError = err.message;
    render();
    document.querySelector('#song-form [role="alert"]')?.scrollIntoView({ block: 'nearest' });
    return;
  }
  songDraft = { ...song, playlistIds: songDraft.playlistIds };
  busy = 'saving'; render();
  const exists = state.songs.some(s => s.id === song.id);
  const playlists = applyMembership(state.playlists, song.id, songDraft.playlistIds || [], new Date());
  const saved = await persist({ ...state, songs: exists ? state.songs.map(s => s.id === song.id ? song : s) : [...state.songs, song], playlists });
  busy = false;
  if (saved) { selectedSongId = song.id; navigate('song-detail'); toast('곡을 저장했어요.'); }
  else render();
}

async function deleteSong(id) {
  const song = state.songs.find(s => s.id === id);
  if (!song || !confirm(`‘${song.title}’을(를) 삭제할까요? 담긴 플레이리스트에서도 빠져요.`)) return;
  busy = 'saving'; render();
  const next = { ...state, songs: state.songs.filter(s => s.id !== id), playlists: removeSongEverywhere(state.playlists, id) };
  try {
    if (!demo) await store.saveState(next);
    state = next;
    storageError = '';
    busy = false;
    navigate(state.playlists.some(p => p.id === selectedPlaylistId) ? 'playlist' : 'songs');
    toast('곡을 삭제했어요.');
  } catch {
    busy = false;
    render();
    toast('삭제를 저장하지 못해 곡을 그대로 두었어요. 잠시 후 다시 시도해 주세요.');
  }
}

async function savePlaylist(form) {
  if (busy) return;
  const name = String(new FormData(form).get('name') ?? '');
  playlistDraft = { ...playlistDraft, name };
  let playlists;
  let id = playlistDraft.id;
  try {
    if (id) playlists = renamePlaylist(state.playlists, id, name);
    else {
      const created = createPlaylist(state.playlists, name);
      id = created.id;
      playlists = [...state.playlists, created];
    }
  } catch (err) {
    playlistError = err.message;
    render();
    return;
  }
  const renamed = Boolean(playlistDraft.id);
  playlistError = '';
  busy = 'saving'; render();
  const saved = await persist({ ...state, playlists });
  busy = false;
  if (!saved) return render();
  selectedPlaylistId = id;
  playlistDraft = null;
  navigate('playlist');
  toast(renamed ? '이름을 바꿨어요.' : '플레이리스트를 만들었어요.');
}

async function deletePlaylist(id) {
  const playlist = state.playlists.find(p => p.id === id);
  if (!playlist || !confirm(`‘${playlist.name}’ 플레이리스트를 삭제할까요? 담긴 곡은 ‘모든 곡’에 남아요.`)) return;
  busy = 'saving'; render();
  const saved = await persist({ ...state, playlists: state.playlists.filter(p => p.id !== id) });
  busy = false;
  if (!saved) return render();
  selectedPlaylistId = null;
  navigate('songs');
  toast('플레이리스트를 삭제했어요.');
}

async function removeFromPlaylist(songId) {
  busy = 'saving'; render();
  await persist({ ...state, playlists: state.playlists.map(p => p.id === selectedPlaylistId ? removeSong(p, songId) : p) });
  busy = false;
  render();
}

const RECOMMEND_FAILED = '지금은 추천을 불러오지 못했어요.';

async function requestRecommendations(id) {
  if (recLoading) return;
  if (!state.settings.aiConsentAt) { selectedPlaylistId = id; return navigate('ai-consent'); }
  let request;
  try { request = buildRecommendationRequest(state, id); }
  catch (err) { recError = { id, message: err.message }; return render(); }
  recLoading = id;
  recError = null;
  render();
  let items = null;
  let message = RECOMMEND_FAILED;
  try {
    const response = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    if (response.ok) items = (await response.json()).items;
    else if (response.status === 503) message = '아직 AI 추천이 설정되지 않았어요.';
  } catch { /* network failure keeps the generic message */ }
  recLoading = null;
  // The list may have been deleted or changed while waiting; apply the answer to the current state only.
  if (!state.playlists.some(p => p.id === id)) return render();
  const valid = Array.isArray(items) ? items.filter(isValidRecItem).slice(0, PLAYLIST_LIMITS.recCount) : [];
  if (!valid.length) { recError = { id, message }; return render(); }
  await persist({ ...state, playlists: state.playlists.map(p => p.id === id ? setRecommendations(p, valid) : p) });
  render();
}

async function addRecommendation(index) {
  const playlist = state.playlists.find(p => p.id === selectedPlaylistId);
  if (!playlist || busy) return;
  if (state.songs.length >= 500) return toast('곡은 500곡까지 담을 수 있어요.');
  const { item, playlist: remaining } = takeRecommendation(playlist, Number(index));
  const byId = new Map(state.songs.map(song => [song.id, song]));
  const listSongs = playlist.songIds.map(songId => byId.get(songId)).filter(Boolean);
  const song = createSong({
    title: item.title, artist: item.artist, keyOffset: suggestKey(listSongs, item.range?.highestMidi ?? null) ?? 0,
    lowestMidi: item.range?.lowestMidi ?? null, highestMidi: item.range?.highestMidi ?? null,
    rangeSourceUrl: item.range?.sourceUrl ?? '', origin: 'ai',
  });
  busy = 'saving'; render();
  const saved = await persist({ ...state, songs: [...state.songs, song], playlists: state.playlists.map(p => p.id === playlist.id ? addSong(remaining, song.id) : p) });
  busy = false;
  render();
  if (saved) toast(`‘${item.title}’을(를) 담았어요.`);
}

async function rejectRecommendationAt(index) {
  const playlist = state.playlists.find(p => p.id === selectedPlaylistId);
  if (!playlist || busy) return;
  busy = 'saving'; render();
  const saved = await persist({ ...state, playlists: state.playlists.map(p => p.id === playlist.id ? rejectRecommendation(p, Number(index)) : p) });
  busy = false;
  render();
  if (saved) toast('알겠어요. 다음 추천에 반영할게요.');
}

async function deleteSession(id) {
  if (!confirm('이 레슨 기록과 연결된 녹음을 삭제할까요? 되돌릴 수 없어요.')) return;
  busy = 'saving';
  const removed = state.sessions.find(s => s.id === id);
  const next = { ...state, sessions: state.sessions.filter(s => s.id !== id), activities: state.activities.filter(a => a.sessionId !== id) };
  if (!demo && removed) {
    const ids = [...removed.attempts.map(a => a.recordingId), removed.practice?.recordingId].filter(Boolean);
    await store.saveState(next, { deleteRecordings: ids });
  }
  state = next;
  busy = false;
  render(); toast('레슨 기록을 삭제했어요.');
}

async function exportBackup() {
  const json = await store.exportData();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sing-backup-${localDay()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('백업 파일에 녹음이 포함될 수 있어요. 개인 보관해 주세요.');
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) throw new Error('백업은 25 MB까지 가져올 수 있어요.');
  if (!confirm('현재 기록과 녹음을 이 백업의 내용으로 바꿀까요? 현재 자료는 먼저 백업해 주세요.')) return;
  state = await store.importData(await file.text());
  session = null;
  storageError = '';
  navigate('history');
  toast('백업 기록을 가져왔어요.');
}

async function playSaved(id) {
  const blob = await store.getRecording(id);
  if (!blob) { toast('이 녹음 파일을 찾을 수 없어요.'); return; }
  releasePlayback();
  savedPlayUrl = URL.createObjectURL(blob);
  const container = document.querySelector('#saved-playback');
  if (!container) return;
  const player = document.createElement('audio');
  player.controls = true;
  player.className = 'audio-player';
  player.src = savedPlayUrl;
  container.replaceChildren(player);
  await player.play();
}

async function handle(action, id) {
  // Persistence writes must finish before navigating or changing their source state.
  if (busy === 'saving') return;
  if (action === 'songs') selectedPlaylistId = null;
  if (['home', 'learn', 'history', 'songs', 'all-songs'].includes(action)) return navigate(action);
  if (action === 'playlist-new' || action === 'playlist-rename') {
    if (!initialized && !demo) return toast('저장소가 준비되지 않았어요. 체험 모드에서 먼저 둘러볼 수 있어요.');
    playlistDraft = action === 'playlist-rename' ? { id, name: state.playlists.find(p => p.id === id)?.name ?? '' } : { name: '' };
    playlistError = '';
    return navigate('playlist-form');
  }
  if (action === 'playlist-open') { selectedPlaylistId = id; return navigate('playlist'); }
  if (action === 'playlist-delete') return deletePlaylist(id);
  if (action === 'playlist-remove-song') return removeFromPlaylist(id);
  if (action === 'rec-fetch') return requestRecommendations(id);
  if (action === 'rec-add') return addRecommendation(id);
  if (action === 'rec-nope') return rejectRecommendationAt(id);
  if (action === 'ai-consent-accept') {
    if (!(await persist({ ...state, settings: { ...state.settings, aiConsentAt: new Date().toISOString() } }))) return;
    navigate('playlist');
    return requestRecommendations(selectedPlaylistId);
  }
  if (action === 'ai-consent-revoke') {
    await persist({ ...state, settings: { ...state.settings, aiConsentAt: null } });
    render();
    return toast('AI 추천 동의를 철회했어요.');
  }
  if (action === 'song-add' || action === 'song-edit') {
    if (!initialized && !demo) return toast('저장소가 준비되지 않았어요. 체험 모드에서 먼저 둘러볼 수 있어요.');
    songDraft = action === 'song-edit'
      ? { ...state.songs.find(s => s.id === id), playlistIds: state.playlists.filter(p => p.songIds.includes(id)).map(p => p.id) }
      : { status: 'want', keyOffset: 0, lowestMidi: null, highestMidi: null, playlistIds: state.playlists.some(p => p.id === id) ? [id] : [] };
    songError = '';
    return navigate('song-form');
  }
  if (action === 'song-detail') { selectedSongId = id; return navigate('song-detail'); }
  if (action === 'song-back') return navigate(state.playlists.some(p => p.id === selectedPlaylistId) ? 'playlist' : 'songs');
  if (action === 'song-delete') return deleteSong(id);
  if (action === 'demo') return enterDemo();
  if (action === 'exit-demo') return exitDemo();
  if (action === 'begin') { if (!initialized && !demo) return toast('저장소가 준비되지 않았어요. 체험 모드를 먼저 둘러볼 수 있어요.'); return navigate('check'); }
  if (action === 'well') return resumeOrCreate();
  if (action === 'rest') return navigate('rest');
  if (action === 'explore') return navigate('explore');
  if (action === 'free-start') { session = { ...session, targetMidi: null, phase: 'start' }; await saveDraft(); return navigate('explore'); }
  if (action === 'pause') { navigate('home'); return toast('완료한 시도까지 남겨뒀어요. 이어서 시작할 수 있어요.'); }
  if (action === 'record') return capture(false);
  if (action === 'record-practice') return capture(true);
  if (['tone', 'preview-piano', 'tone-hum', 'preview-hum'].includes(action) && !busy) {
    const token = ++operation;
    const target = action.startsWith('preview') ? session?.targetMidi ?? 60 : page === 'practice' ? recommendedNote(session) : session.targetMidi;
    const hum = action.endsWith('hum');
    busy = hum ? 'hum' : 'tone'; render();
    try { await (hum ? audio.tone(target, 2400, { voice: 'hum' }) : audio.tone(target)); }
    finally { if (token === operation) { busy = false; render(); } }
    return;
  }
  if (action === 'higher' && !busy) { busy = 'saving'; session = nextTarget(session); render(); await saveDraft(); return navigate(session.status === 'finished' ? 'result' : 'explore'); }
  if (action === 'finish' && !busy) return finish();
  if (action === 'pain') return finish('pain');
  if (['comfortable', 'effort', 'unsure'].includes(action)) return respond(action);
  if (action.startsWith('practice-')) return respond(action.slice(9), true);
  if (action === 'practice') {
    if (recommendedNote(session) === null || session.stopReason === 'pain') return;
    return navigate('practice');
  }
  if (action === 'save-session') return saveSession();
  if (action === 'save-and-learn') return saveSession('learn');
  if (action === 'learn-complete') return recordActivity('learn');
  if (action === 'rest-complete') return recordActivity('rest');
  if (action === 'detail') { session = state.sessions.find(s => s.id === id); if (session) navigate('detail'); return; }
  if (action === 'delete-session') return deleteSession(id);
  if (action === 'play-saved') return playSaved(id);
  if (action === 'export') return exportBackup();
  if (action === 'import') return document.querySelector('#backup-file').click();
  if (action === 'clear') {
    if (!confirm('이 기기의 모든 연습 기록, 녹음, 곡과 플레이리스트를 지울까요? 이 작업은 되돌릴 수 없어요.')) return;
    await store.clear(); state = defaultState(); session = null; navigate('history'); return toast('모든 기록을 삭제했어요.');
  }
  if (action === 'retry-storage') {
    if (!initialized) return initialize();
    if (await persist()) { render(); toast('기기에 저장했어요.'); }
  }
}

root.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  try { await handle(target.dataset.action, target.dataset.id); }
  catch (err) {
    busy = false;
    render();
    toast(err?.message?.startsWith('Invalid') ? '백업 형식이 맞지 않아요. 기존 기록은 유지했어요.' : err.message || '작업을 마치지 못했어요. 다시 시도해 주세요.');
  }
});

root.addEventListener('change', async event => {
  try {
    if (event.target.closest('#song-form')) readSongForm(event.target.form);
    if (event.target.id === 'keep-audio') await persist({ ...state, settings: { ...state.settings, keepAudio: event.target.checked } });
    if (event.target.id === 'backup-file') await importBackup(event.target.files[0]);
  } catch {
    toast('백업을 가져오지 못했어요. 파일 형식을 확인해 주세요. 기존 기록은 유지했어요.');
  }
});

root.addEventListener('input', event => {
  if (event.target.id === 'song-search') {
    songQuery = event.target.value;
    document.querySelector('#song-results').innerHTML = playlistHomeResults(state, songQuery);
  }
  if (event.target.closest('#song-form')) readSongForm(event.target.form);
});

root.addEventListener('submit', async event => {
  if (event.target.id === 'playlist-form') {
    event.preventDefault();
    await savePlaylist(event.target);
    return;
  }
  if (event.target.id !== 'song-form') return;
  event.preventDefault();
  await saveSong(event.target);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['recording', 'tone', 'hum'].includes(busy)) {
    cancelCapture();
    error = '화면을 벗어나 녹음을 멈췄어요. 이 시도는 저장하지 않았어요. 준비되면 다시 시작해 주세요.';
    render();
  }
});
window.addEventListener('pagehide', () => audio.cancel());

render();
initialize();
