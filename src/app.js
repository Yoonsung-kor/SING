import { hummingPayload, lineMetrics, sungLines, chorusDiffs, songPayload } from './practice-feedback.js';
import { createSingAlong } from './sing-along.js';
import { createLesson, recordAttempt, nextTarget, finishLesson, summarizeLesson, recommendedNote, localDay, addActivity, needsDailyCheck } from './lesson.js';
import { defaultState, openStore } from './storage.js';
import { AudioEngine, microphoneError } from './audio.js';
import { noteName, frequencyToMidi } from './pitch.js';
import { renderView, pageNotice } from './views.js';
import { songDetailParts } from './song-views.js';
import { defaultSongUi, currentVideoId } from './song-media-views.js';
import { createSongPlayer } from './song-player.js';
import { readMedia, validateMedia, expireMedia, mediaNeeds, withSections, withNoTiming, withPasted, withCandidates, withProvisionalOriginal, upgradeOriginal, canSearchOriginal, dropCandidate, nextCandidate, setStart, canSetStart, startOf, toVideoTime, pinVideoTime, addPin, removePin, currentSectionIndex, lyricIndex, parseYoutubeLink, sameSongQuery } from './song-media.js';
import { createSong, updateSong } from './songs.js';
import { createPlaylist, renamePlaylist, removeSong, applyMembership, removeSongEverywhere, addSong, setRecommendations, takeRecommendation, rejectRecommendation, isValidRecItem, PLAYLIST_LIMITS } from './playlists.js';
import { buildRecommendationRequest, suggestKey, sameSong } from './recommend.js';
import { playlistHomeResults } from './playlist-views.js';
import { hasCurrentConsent, withConsent, withoutConsent } from './consent.js';
import { shouldShowOnboarding, startOnboarding, addPick, applyLookup, setVoiceType, setPickKey, toggleOctave, removePick, onboardingResult, commitOnboarding, commitManual, dismissOnboarding, emptySearch, markSlow, startPicker, commitPicks } from './onboarding.js';
import { searchResultsHtml, voicePicksHtml, pickActionsHtml } from './onboarding-views.js';
import { RANGE_BOUNDS, candidateShift } from './vocal-range.js';

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
let consentReturn = 'playlist';
let feedbackBusy = false;
let feedbackError = false;
let pendingPickList = null;
// Pages that own the shared pick state: onboarding and '곡 찾아 담기'.
const isPickerPage = target => target.startsWith('voice-') || target === 'song-pick';
let rangeToken = 0;
let toastTimer;
// '내 음역' onboarding: the epoch changes whenever onboarding restarts or the user leaves it,
// so late search or lookup answers never land in a new onboarding or on another page.
let onboarding = null;
let onboardingEpoch = 0;
let searchTimer = null;
let searchToken = 0;
let lookupQueue = [];
let lookupActive = 0;
let aiOffToastShown = false;
// Song screen: the player stays mounted while the song is open (playerFor), so render() redraws around it.
let songUi = defaultSongUi();
let playerFor = null;
let pendingPaste = null;
let pinDraft = null;
let mediaTicker = null;
// Lyrics live in memory only (per song, gone when the app reloads); they are never saved or backed up.
const songLyrics = new Map();
// The sing-along measurement in progress (microphone open), or null.
let singAlong = null;
let lyricsStyle = 'karaoke';
let lyricsScrollAt = 0;
const lookupsInFlight = new Set();
const songPlayer = createSongPlayer({ onState: handlePlayerState, onError: handlePlayerError, onLoadFail: () => toast('영상 플레이어를 불러오지 못했어요. 잠시 후 다시 열어 주세요.') });
const LOOKUP_CONCURRENCY = 3;
const SEARCH_SLOW_MS = 3000;
const LOOKUP_SLOW_MS = 15000;

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 4500);
}

function render(focus = false) {
  const v = { page, state, session, pending, playUrl, busy, demo, error, storageError, songQuery, songDraft, songError, selectedSongId, selectedPlaylistId, playlistDraft, playlistError, recLoading, recError, onboarding, loading: !initialized && !demo, songUi: { ...songUi, consent: hasCurrentConsent(state.settings) }, lyricsLines: songLyrics.get(selectedSongId) ?? null, feedbackBusy, feedbackError };
  // While a song's player is mounted, only the parts around it are redrawn: moving an iframe would reload the video.
  if (!focus && page === 'song-detail' && playerFor === selectedSongId && document.querySelector('#song-player-slot')) {
    const parts = songDetailParts(v);
    if (parts) {
      const lyricsScroll = document.querySelector('#lyrics-full')?.scrollTop ?? 0;
      const typing = document.activeElement?.matches?.('#media-link, #media-pin-form input') ? { id: document.activeElement.id ? '#media-link' : '#media-pin-form input', value: document.activeElement.value, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
      document.querySelector('#song-detail-top').innerHTML = parts.top;
      document.querySelector('#song-detail-rest').innerHTML = parts.rest;
      document.querySelector('#page-notice').innerHTML = pageNotice(v);
      document.querySelector('#lyrics-full')?.scrollTo({ top: lyricsScroll, behavior: 'instant' });
      const input = typing && document.querySelector(typing.id);
      if (input) { input.value = typing.value; input.focus(); input.setSelectionRange?.(typing.start, typing.end); }
      tickMedia();
      return;
    }
    stopSongPlayer();
  }
  root.innerHTML = renderView(v);
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
  rangeToken++;
  if (!isPickerPage(target)) leaveOnboarding();
  cancelCapture();
  stopSongPlayer();
  feedbackError = false;
  error = '';
  page = target;
  if (target === 'song-detail') songUi = { ...defaultSongUi(), lyricsStyle };
  render(true);
  if (target === 'song-detail') openSongDetail();
}

function stopSongPlayer() {
  dropSinging();
  clearInterval(mediaTicker);
  mediaTicker = null;
  if (playerFor !== null) songPlayer.destroy();
  playerFor = pendingPaste = pinDraft = null;
}

/** Lets go of the microphone without asking for feedback (leaving the screen, switching the video). */
function dropSinging() {
  if (!singAlong) return;
  singAlong.stop();
  singAlong = null;
  songUi = { ...songUi, singing: false };
}

/** Sing-along stopped: per-line numbers (no lyric text, no recording) go to the AI; the card stays on this screen only. */
async function finishSinging() {
  const song = selectedSong();
  if (!singAlong || !song) return;
  const frames = singAlong.stop();
  singAlong = null;
  const media = readMedia(song);
  const items = media.sections?.items ?? [];
  const comfortableHighMidi = state.settings.voice?.comfortableHighMidi ?? null;
  const stats = lineMetrics(frames, songLyrics.get(song.id) ?? [], { comfortableHighMidi });
  if (sungLines(stats) < 4) { songUi = { ...songUi, singing: false, singReport: { status: 'short' } }; return render(); }
  const payload = songPayload(song, items, stats, chorusDiffs(stats, items), comfortableHighMidi);
  songUi = { ...songUi, singing: false, panel: null, singReport: { status: 'busy' } };
  render();
  let feedback = null;
  try {
    const response = await fetch('/api/practice-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) feedback = (await response.json()).feedback ?? null;
  } catch { feedback = null; }
  if (!onSongScreen(song.id) || songUi.singReport?.status !== 'busy') return;
  const starts = Object.fromEntries(stats.map(line => [line.id, line.start]));
  songUi = { ...songUi, singReport: feedback ? { status: 'done', feedback, starts } : { status: 'failed' } };
  render();
}

const selectedSong = () => state.songs.find(s => s.id === selectedSongId);
const onSongScreen = songId => page === 'song-detail' && selectedSongId === songId;

/** Saves a change to one song's media; the song may have been deleted meanwhile, then nothing happens. */
async function saveMedia(songId, change) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return false;
  const media = change(readMedia(song));
  try { validateMedia(media); } catch { toast('영상 정보를 저장하지 못했어요. 다시 시도해 주세요.'); render(); return false; }
  const saved = await persist({ ...state, songs: state.songs.map(s => s.id === songId ? { ...s, media } : s) });
  render();
  return saved;
}

function showCurrentVideo() {
  const song = selectedSong();
  if (song && playerFor === song.id) songPlayer.show(document.querySelector('#song-player-slot'), currentVideoId(song, songUi.side));
}

async function openSongDetail() {
  const song = selectedSong();
  if (!song) return;
  const media = readMedia(song);
  const fresh = expireMedia(media, new Date());
  if (fresh !== media) await saveMedia(song.id, () => fresh);
  if (!onSongScreen(song.id)) return;
  playerFor = song.id;
  showCurrentVideo();
  mediaTicker = setInterval(tickMedia, 300);
  if (!hasCurrentConsent(state.settings)) return;
  // The karaoke video needs no length, so it is searched at once; the original waits for the sections and lyrics,
  // because its audio track is matched by the song's length.
  if (mediaNeeds(readMedia(song)).karaoke) loadVideos(song.id, 'karaoke');
  const waitingOriginal = mediaNeeds(readMedia(song)).mv && !currentVideoId(song, 'mv');
  if (waitingOriginal) songUi = { ...songUi, videos: { ...songUi.videos, mv: 'loading' } };
  const stored = readMedia(selectedSong()).sections;
  if (stored === null || (!stored.none && !songLyrics.has(song.id))) await loadSections();
  else if (waitingOriginal) render();
  if (onSongScreen(song.id)) loadOriginal(song.id);
}

/** Searches the original side once the sections lookup has answered; after a temporary failure it waits for a retry. */
function loadOriginal(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song || !hasCurrentConsent(state.settings)) return;
  const media = readMedia(song);
  if (!mediaNeeds(media).mv) return;
  if (canSearchOriginal(media)) return loadVideos(songId, 'mv');
  // While lyric timing is busy the original is found by title alone and kept as provisional (searched again with the length later).
  if (!currentVideoId(song, 'mv')) return loadVideos(songId, 'mv', { provisional: true });
}

async function loadVideos(songId, side, { provisional = false } = {}) {
  const song = state.songs.find(s => s.id === songId);
  const key = `${songId}:${side}`;
  if (!song || !hasCurrentConsent(state.settings) || lookupsInFlight.has(key)) return;
  lookupsInFlight.add(key);
  try { await searchVideos(song, side, provisional); } finally { lookupsInFlight.delete(key); }
}

async function searchVideos(song, side, provisional) {
  const songId = song.id;
  const query = { title: song.title, artist: song.artist };
  const mark = status => { if (onSongScreen(songId)) songUi = { ...songUi, videos: { ...songUi.videos, [side]: status } }; };
  mark('loading');
  render();
  let status = 0;
  let body = null;
  try {
    // The song's length lets the server tell this song's audio track from other versions.
    const duration = side === 'mv' ? readMedia(song).sections?.duration : undefined;
    const response = await fetch(`/api/song-videos?${new URLSearchParams({ side, ...query, ...(Number.isFinite(duration) ? { duration: String(duration) } : {}) })}`);
    status = response.status;
    body = await response.json().catch(() => null);
  } catch { status = 0; }
  // A late answer for a renamed, deleted or other song is dropped; a failed search is not stored, so the next visit tries again.
  if (!sameSongQuery(state.songs.find(s => s.id === songId), query)) return;
  const candidates = status === 200 && Array.isArray(body?.candidates) ? body.candidates : null;
  let found = false;
  // The original side upgrades an old MV only with something found; it never turns a playing video into "none".
  // A pick made without the song's length is provisional (searched again once the length is known).
  const apply = (media, now) => provisional ? withProvisionalOriginal(media, candidates, now) : side === 'mv' ? upgradeOriginal(media, candidates, now) : withCandidates(media, side, candidates, now);
  if (candidates) {
    try { validateMedia(apply(readMedia(song), new Date())); found = true; } catch { found = false; }
  }
  mark(found ? 'idle' : status === 429 ? 'quota' : status === 503 && body?.error === 'not-configured' ? 'not-configured' : 'failed');
  if (!found) return render();
  // Something the user chose meanwhile (a pasted link) is never overwritten by a late answer.
  if (!mediaNeeds(readMedia(state.songs.find(s => s.id === songId)))[side]) return render();
  await saveMedia(songId, media => apply(media, new Date()));
  if (onSongScreen(songId) && songUi.side === side) showCurrentVideo();
}

/** Sections (stored on the song when missing) and lyric lines (kept in memory only) from one lookup. */
async function loadSections() {
  const song = selectedSong();
  if (!song || lookupsInFlight.has(`${song.id}:sections`)) return;
  lookupsInFlight.add(`${song.id}:sections`);
  try { await lookupSections(song); } finally { lookupsInFlight.delete(`${song.id}:sections`); }
}

async function lookupSections(song) {
  const query = { title: song.title, artist: song.artist };
  const needsSections = readMedia(song).sections === null;
  songUi = { ...songUi, sections: needsSections ? 'loading' : songUi.sections, lyrics: 'loading' };
  render();
  let status = 0;
  let body = null;
  try {
    const response = await fetch(`/api/song-sections?${new URLSearchParams(query)}`);
    status = response.status;
    if (status === 200) body = await response.json();
  } catch { status = 0; }
  // A late answer for a renamed, deleted or other song is dropped.
  if (!sameSongQuery(state.songs.find(s => s.id === song.id), query)) return;
  let found = false;
  if (status === 200) {
    try { validateMedia(withSections(readMedia(song), body, new Date())); found = true; } catch { found = false; }
  }
  if (found) {
    const lines = (Array.isArray(body.lines) ? body.lines : []).filter(line => Number.isFinite(line?.t) && typeof line.text === 'string');
    if (lines.length) songLyrics.set(song.id, lines);
  }
  if (onSongScreen(song.id)) {
    const failed = !found && status !== 404;
    songUi = { ...songUi, sections: needsSections && failed ? 'busy' : 'idle', lyrics: found && songLyrics.has(song.id) ? 'idle' : failed ? 'busy' : 'none' };
  }
  if (found && needsSections) return saveMedia(song.id, media => withSections(media, body, new Date()));
  if (status === 404 && needsSections) return saveMedia(song.id, media => withNoTiming(media, new Date()));
  render();
}

function tickMedia() {
  const song = selectedSong();
  if (!song || page !== 'song-detail') return;
  const media = readMedia(song);
  const videoId = currentVideoId(song, songUi.side);
  const t = songPlayer.currentTime();
  if (t === null || !videoId || songPlayer.currentVideoId() !== videoId) return;
  const songTime = t - startOf(media, videoId);
  const sections = media.sections;
  if (sections?.items?.length) {
    const x = String(Math.min(1000, Math.max(0, songTime / sections.duration * 1000)));
    const head = document.querySelector('#media-head');
    head?.setAttribute('x1', x);
    head?.setAttribute('x2', x);
    const index = currentSectionIndex(sections.items, songTime);
    document.querySelectorAll('.media-chip').forEach(chip => chip.classList.toggle('now', Number(chip.dataset.id) === index));
  }
  document.querySelectorAll('.media-pin-list li[data-t]').forEach(li => li.classList.toggle('now', Math.abs(Number(li.dataset.t) - t) < 4));
  showLyric(song.id, media, songTime);
}

/** Puts the current lyric line in the subtitle and the full list; text and classes only, never a redraw. */
function showLyric(songId, media, songTime) {
  const lines = songLyrics.get(songId);
  if (!lines?.length) return;
  const index = lyricIndex(lines, songTime);
  const cur = document.querySelector('#lyric-cur');
  // Before the first line the hint stays; a fresh redraw (no marker) is filled again on the next tick.
  if (cur && cur.dataset.line !== String(index) && !(index === -1 && cur.dataset.line === undefined)) {
    const next = lines.findIndex((line, i) => i > index && line.text);
    const items = media.sections?.items ?? [];
    document.querySelector('#lyric-section').textContent = items[currentSectionIndex(items, songTime)]?.label ?? '';
    cur.textContent = index >= 0 && lines[index].text ? lines[index].text : '♪';
    document.querySelector('#lyric-next').textContent = next >= 0 ? lines[next].text : '';
    cur.dataset.line = String(index);
  }
  const full = document.querySelector('#lyrics-full');
  if (full && full.dataset.line !== String(index)) {
    full.querySelectorAll('.lyric-line').forEach(button => { const n = Number(button.dataset.id); button.classList.toggle('now', n === index); button.classList.toggle('past', n < index); });
    full.dataset.line = String(index);
    const now = full.querySelector('.lyric-line.now');
    // The list follows the song unless the user scrolled it in the last 3 seconds.
    if (now && !full.hidden && Date.now() - lyricsScrollAt > 3000) full.scrollTop = now.offsetTop - full.clientHeight / 2 + now.clientHeight / 2;
  }
}

function handlePlayerState(code, videoId) {
  // A pasted link is kept only once the player has it ready (cued) or playing.
  if (pendingPaste && pendingPaste.videoId === videoId && (code === 5 || code === 1)) {
    const { songId, side } = pendingPaste;
    pendingPaste = null;
    if (onSongScreen(songId)) songUi = { ...songUi, panel: null, pasteError: '', playerError: null };
    saveMedia(songId, media => withPasted(media, side, videoId, new Date()));
  }
}

const GONE_OR_BLOCKED = [100, 101, 150];

async function handlePlayerError(code, videoId) {
  if (pendingPaste && pendingPaste.videoId === videoId) {
    const { previous } = pendingPaste;
    pendingPaste = null;
    songUi = { ...songUi, playerError: { code, videoId } };
    render();
    songPlayer.show(document.querySelector('#song-player-slot'), previous);
    return;
  }
  // An error about a video no longer on screen (left behind while switching) changes nothing.
  if (videoId !== songPlayer.currentVideoId()) return;
  const song = selectedSong();
  const side = songUi.side;
  const entry = song && readMedia(song)[side];
  if (GONE_OR_BLOCKED.includes(code) && entry && !entry.none && entry.videoId === videoId) {
    // A found candidate that will not play gives way to the next one; a saved pasted link is cleared and explained.
    if (entry.source === 'pasted') songUi = { ...songUi, playerError: { code, videoId } };
    await saveMedia(song.id, media => dropCandidate(media, side, videoId, new Date()));
    return showCurrentVideo();
  }
  songUi = { ...songUi, playerError: { code, videoId } };
  render();
}

function pasteLink(form) {
  const song = selectedSong();
  if (!song || playerFor !== song.id) return;
  const raw = String(new FormData(form).get('link') ?? '');
  const videoId = parseYoutubeLink(raw);
  if (!videoId) {
    songUi = { ...songUi, pasteError: '유튜브 영상 링크를 붙여 넣어 주세요' };
    render();
    const input = document.querySelector('#media-link');
    if (input) { input.value = raw; input.focus(); }
    return;
  }
  if (videoId === currentVideoId(song, songUi.side)) {
    songUi = { ...songUi, panel: null, pasteError: '' };
    render();
    return toast('지금 보고 있는 영상이에요.');
  }
  pendingPaste = { songId: song.id, side: songUi.side, videoId, previous: currentVideoId(song, songUi.side) };
  songUi = { ...songUi, pasteError: '', playerError: null };
  render();
  songPlayer.show(document.querySelector('#song-player-slot'), videoId);
}

async function savePin(form) {
  const song = selectedSong();
  if (!song || !pinDraft) return;
  const text = String(new FormData(form).get('text') ?? '');
  let next;
  try { next = addPin(readMedia(song), { ...pinDraft, text }, crypto.randomUUID()); }
  catch (err) {
    songUi = { ...songUi, pinError: err.message };
    render();
    const input = document.querySelector('#media-pin-form input');
    if (input) { input.value = text; input.focus(); }
    return;
  }
  pinDraft = null;
  songUi = { ...songUi, panel: null, pinError: '' };
  await saveMedia(song.id, () => next);
}

async function handleMedia(action, id) {
  const song = selectedSong();
  if (!song || page !== 'song-detail') return;
  const media = readMedia(song);
  const videoId = currentVideoId(song, songUi.side);
  if (action === 'media-side') {
    if (!['mv', 'karaoke'].includes(id) || id === songUi.side) return;
    pendingPaste = null;
    dropSinging();
    songUi = { ...songUi, side: id, panel: null, pasteError: '', pinError: '', playerError: null };
    render();
    return showCurrentVideo();
  }
  if (action === 'media-consent') { consentReturn = 'song-detail'; return navigate('ai-consent'); }
  if (action === 'media-sing-open') {
    if (!hasCurrentConsent(state.settings)) { consentReturn = 'song-detail'; return navigate('ai-consent'); }
    songUi = { ...songUi, panel: 'sing', pasteError: '', pinError: '', singReport: songUi.singReport?.status === 'done' ? songUi.singReport : null };
    return render();
  }
  if (action === 'media-sing-stop') return finishSinging();
  if (action === 'media-sing-start') {
    if (!videoId || singAlong) return;
    if (songPlayer.currentTime() === null) return toast('영상이 준비되면 다시 눌러 주세요.');
    const offset = startOf(media, videoId);
    const singer = createSingAlong();
    singAlong = singer;
    songUi = { ...songUi, singing: true, singReport: null };
    render();
    // Only while this video is playing; a paused or switched video measures nothing.
    const songTime = () => {
      const t = songPlayer.currentTime();
      return t !== null && songPlayer.playbackState() === 1 && songPlayer.currentVideoId() === videoId ? t - offset : null;
    };
    let failure = null;
    const started = await singer.start(songTime).catch(err => { failure = err; return false; });
    if (singAlong !== singer) return;
    if (!started) { dropSinging(); render(); return toast(microphoneError(failure)); }
    if (songPlayer.playbackState() !== 1) songPlayer.seekTo(songPlayer.currentTime() ?? 0);
    return;
  }
  if (action === 'media-change') {
    songUi = { ...songUi, panel: 'change', pasteError: '' };
    render();
    return document.querySelector('#media-link')?.focus();
  }
  if (action === 'media-panel-close' || action === 'media-pin-cancel') {
    pinDraft = null;
    songUi = { ...songUi, panel: null, pasteError: '', pinError: '' };
    return render();
  }
  if (action === 'media-sections-retry') { await loadSections(); return onSongScreen(song.id) ? loadOriginal(song.id) : undefined; }
  if (action === 'media-align') {
    const t = songPlayer.currentTime();
    if (!canSetStart({ videoId, shownId: songPlayer.currentVideoId(), time: t, playerState: songPlayer.playbackState() })) return toast('영상을 먼저 틀어 주세요.');
    return saveMedia(song.id, current => setStart(current, videoId, t));
  }
  if (['media-section', 'media-seek', 'media-pin-go', 'media-lyric'].includes(action) && videoId && songPlayer.currentTime() === null) return toast('영상이 준비되면 다시 눌러 주세요.');
  if (action === 'media-section') {
    const item = media.sections?.items?.[Number(id)];
    if (item && videoId) songPlayer.seekTo(toVideoTime(media, videoId, item.t));
    return;
  }
  if (action === 'media-seek') {
    const fraction = Number(id);
    if (!videoId || !media.sections?.duration || !Number.isFinite(fraction)) return;
    return songPlayer.seekTo(toVideoTime(media, videoId, Math.min(1, Math.max(0, fraction)) * media.sections.duration));
  }
  if (action === 'media-pin-open') {
    if (!videoId) return;
    pinDraft = { videoId, t: songPlayer.currentTime() ?? 0 };
    songUi = { ...songUi, panel: 'pin', pinError: '' };
    render();
    return document.querySelector('#media-pin-form input')?.focus();
  }
  if (action === 'media-pin-go') {
    const pin = media.pins.find(p => p.id === id);
    if (pin && videoId) songPlayer.seekTo(pinVideoTime(media, pin, videoId));
    return;
  }
  if (action === 'media-pin-delete') return saveMedia(song.id, current => removePin(current, id));
  if (action === 'media-lyrics-style') {
    if (!['karaoke', 'full'].includes(id)) return;
    lyricsStyle = id;
    songUi = { ...songUi, lyricsStyle: id };
    render();
    return tickMedia();
  }
  if (action === 'media-lyric') {
    // A feedback card can point at a line by its start even if the lyrics are gone meanwhile.
    const t = songLyrics.get(song.id)?.[Number(id)]?.t ?? songUi.singReport?.starts?.[id];
    if (Number.isFinite(t) && videoId) songPlayer.seekTo(toVideoTime(media, videoId, Math.max(0, t - 0.3)));
    return;
  }
  if (action === 'media-next') {
    songUi = { ...songUi, panel: null, playerError: null };
    await saveMedia(song.id, current => nextCandidate(current, songUi.side));
    return showCurrentVideo();
  }
}

function leaveOnboarding() {
  onboardingEpoch++;
  clearTimeout(searchTimer);
  lookupQueue = [];
}

function beginOnboarding(target) {
  onboarding = startOnboarding(state);
  leaveOnboarding();
  navigate(target);
}

// Partial updates keep focus in the search box while answers arrive.
function refreshPicks() {
  if (!['voice-pick', 'song-pick'].includes(page) || !onboarding) return;
  const picks = document.querySelector('#voice-picks');
  const actions = document.querySelector('#voice-actions');
  if (picks) picks.innerHTML = voicePicksHtml(onboarding);
  if (actions) actions.innerHTML = pickActionsHtml(onboarding);
  const title = document.querySelector('.voice-picked-title');
  if (title) title.textContent = '고른 곡 ' + onboarding.picks.length;
}

function refreshResults() {
  const box = document.querySelector('#voice-results');
  if (box && onboarding) box.innerHTML = searchResultsHtml(onboarding);
}

const setSearch = change => { onboarding = { ...onboarding, search: { ...onboarding.search, ...change } }; };

function scheduleSearch(query) {
  if (!onboarding) return;
  onboarding = { ...onboarding, query };
  clearTimeout(searchTimer);
  if (!query.trim()) { searchToken++; onboarding = { ...onboarding, search: emptySearch() }; refreshResults(); return; }
  searchTimer = setTimeout(() => runSearch({ term: query.trim() }), 400);
}

const SEARCH_FAILED = '곡 검색이 안 돼요. 잠시 후 다시 찾거나 아래에서 직접 적어 주세요.';

/** One search request. append adds the next page to the rows already shown. */
async function runSearch({ term, mode = 'search', page = 1, append = false, artistTitle = null, retried = false }) {
  if (!onboarding || !hasCurrentConsent(state.settings)) return;
  const token = ++searchToken;
  const epoch = onboardingEpoch;
  if (append) setSearch({ loadingMore: true });
  else onboarding = { ...onboarding, search: { ...emptySearch(), status: 'loading', term, mode, artistTitle } };
  refreshResults();
  // Past a few seconds the panel says it is taking long, so a slow answer never looks like no answer.
  const slow = setTimeout(() => {
    if (token === searchToken && epoch === onboardingEpoch && onboarding?.search.status === 'loading') { setSearch({ status: 'slow' }); refreshResults(); }
  }, SEARCH_SLOW_MS);
  let body = null;
  try {
    const response = await fetch(`/api/song-search?q=${encodeURIComponent(term)}&scope=${onboarding.scope}&mode=${mode}&page=${page}`);
    if (response.ok) body = await response.json();
  } catch { /* network failure: body stays null */ }
  clearTimeout(slow);
  if (token !== searchToken || epoch !== onboardingEpoch || !onboarding) return;
  // The server dropped this request for a newer one. If this is still the latest search (another tab or device
  // was the newer one), ask once more; a second drop shows the error so the panel never waits forever.
  if (body?.stale) {
    if (!retried) return runSearch({ term, mode, page, append, artistTitle, retried: true });
    body = null;
  }
  if (!body || !Array.isArray(body.results)) {
    if (append) { setSearch({ loadingMore: false }); toast(SEARCH_FAILED); }
    else setSearch({ status: 'error' });
    refreshResults();
    return;
  }
  const previous = onboarding.search;
  onboarding = { ...onboarding, search: {
    ...previous, status: 'done', loadingMore: false, page, mode, hasMore: Boolean(body.hasMore), source: body.source,
    results: append ? [...previous.results, ...body.results] : body.results,
    retriedWith: append ? previous.retriedWith : body.retriedWith ?? null,
    artist: append ? previous.artist : body.artist ?? null,
    shown: append ? previous.shown + 20 : 20,
  } };
  refreshResults();
}

// The term a follow-up request should use: an artist list keeps its own term, a search uses the term that found rows.
const followUpTerm = search => search.mode === 'artist' ? search.term : search.retriedWith ?? search.term;

function addOnboardingPick(song) {
  if (!onboarding || !song) return;
  const { onboarding: next, key } = addPick(onboarding, song);
  if (!key) return toast('이미 고른 곡이거나 20곡을 다 채웠어요.');
  onboarding = next;
  lookupQueue.push({ key, epoch: onboardingEpoch });
  pumpLookups();
  refreshPicks();
}

function pumpLookups() {
  while (lookupActive < LOOKUP_CONCURRENCY && lookupQueue.length) {
    const job = lookupQueue.shift();
    if (job.epoch !== onboardingEpoch) continue;
    lookupActive++;
    runLookup(job).finally(() => { lookupActive--; pumpLookups(); advanceWhenReady(); });
  }
}

async function runLookup(job) {
  const pick = onboarding?.picks.find(p => p.key === job.key);
  if (!pick) return;
  const slow = setTimeout(() => { if (job.epoch === onboardingEpoch && onboarding) { onboarding = markSlow(onboarding, job.key); refreshPicks(); } }, LOOKUP_SLOW_MS);
  try { await lookup(job, pick); } finally { clearTimeout(slow); }
}

async function lookup(job, pick) {
  // A song already saved with a checked top note needs no new AI call.
  const known = state.songs.find(song => sameSong(song, pick) && song.rangeQuote);
  let result = 'error';
  if (known) result = { highestMidi: known.highestMidi, falsettoHighestMidi: known.falsettoHighestMidi, lowestMidi: known.lowestMidi, sourceUrl: known.rangeSourceUrl, sourceQuote: known.rangeQuote, vocal: known.vocal };
  else {
    try {
      const response = await fetch('/api/song-range', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: pick.title, artist: pick.artist }) });
      if (response.status === 503) {
        if (!aiOffToastShown) { aiOffToastShown = true; toast('아직 AI가 설정되지 않았어요. 직접 입력을 써 주세요.'); }
      } else if (response.ok) result = (await response.json()).range ?? null;
    } catch { /* network failure leaves 'error' */ }
  }
  if (job.epoch !== onboardingEpoch || !onboarding) return;
  onboarding = applyLookup(onboarding, job.key, result);
  refreshPicks();
}

function advanceWhenReady() {
  if (!onboarding?.waiting || onboarding.picks.some(p => p.status === 'looking')) return;
  if (onboarding.kind === 'songs' && page === 'song-pick') return savePicked();
  if (onboarding.kind !== 'songs' && page === 'voice-pick') {
    onboarding = { ...onboarding, waiting: false };
    navigate('voice-result');
  }
}

function beginPicker(playlistId) {
  onboarding = startPicker(state, playlistId);
  leaveOnboarding();
  navigate('song-pick');
}

function openManualSongForm(playlistId) {
  songDraft = { status: 'want', keyOffset: 0, lowestMidi: null, highestMidi: null, playlistIds: state.playlists.some(p => p.id === playlistId) ? [playlistId] : [] };
  songError = '';
  onboarding = null;
  navigate('song-form');
}

async function savePicked() {
  let next;
  try { next = commitPicks(state, onboarding, new Date()); }
  catch (err) { onboarding = { ...onboarding, waiting: false }; refreshPicks(); return toast(err.message); }
  const { playlistId } = onboarding;
  const count = onboarding.picks.length;
  busy = 'saving'; render();
  const saved = await persist(next);
  busy = false;
  if (!saved) return render();
  onboarding = null;
  selectedPlaylistId = playlistId && state.playlists.some(p => p.id === playlistId) ? playlistId : null;
  navigate(selectedPlaylistId ? 'playlist' : 'all-songs');
  toast(`${count}곡을 담았어요.`);
}

async function saveVoice(next, message) {
  busy = 'saving'; render();
  const saved = await persist(next);
  busy = false;
  if (!saved) return render();
  onboarding = null;
  navigate('songs');
  toast(message);
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

/** AI feedback on the lesson on screen: numbers only (no recordings); kept with the lesson. */
async function requestHummingFeedback() {
  if (!session || feedbackBusy) return;
  if (!hasCurrentConsent(state.settings)) { consentReturn = page === 'detail' ? 'detail' : 'result'; return navigate('ai-consent'); }
  const lesson = session;
  const earlier = state.sessions.filter(s => s.id !== lesson.id && s.status === 'finished' && s.startedAt < lesson.startedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
  const payload = hummingPayload(lesson, { previousHighMidi: earlier ? summarizeLesson(earlier).highest ?? null : null, comfortableHighMidi: state.settings.voice?.comfortableHighMidi ?? null });
  feedbackBusy = true;
  feedbackError = false;
  render();
  let feedback = null;
  try {
    const response = await fetch('/api/practice-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) feedback = (await response.json()).feedback ?? null;
  } catch { feedback = null; }
  feedbackBusy = false;
  if (!feedback || session?.id !== lesson.id) { feedbackError = !feedback; return render(); }
  session = { ...session, feedback: { ...feedback, createdAt: new Date().toISOString() } };
  // A saved lesson is updated in place; a lesson still on the result screen keeps it in its draft until saved.
  if (state.sessions.some(s => s.id === session.id)) await persist({ ...state, sessions: state.sessions.map(s => s.id === session.id ? session : s) });
  else await saveDraft();
  render();
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
    const midiOrNull = value => value === '' || value === null || value === undefined ? null : Number(value);
    const fields = { ...songDraft, keyOffset: Number(songDraft.keyOffset), lowestMidi: midiOrNull(songDraft.lowestMidi), highestMidi: midiOrNull(songDraft.highestMidi), falsettoHighestMidi: midiOrNull(songDraft.falsettoHighestMidi), octaveShift: Number(songDraft.octaveShift ?? 0) };
    const existing = state.songs.find(s => s.id === songDraft.id);
    // Saving the form makes every value the user's own; a hand-edited range no longer matches its source.
    fields.origin = 'user';
    const sourced = songDraft.sourcedRange ?? (existing?.rangeQuote ? { highestMidi: existing.highestMidi, falsettoHighestMidi: existing.falsettoHighestMidi, lowestMidi: existing.lowestMidi } : null);
    if (!sourced || fields.highestMidi !== sourced.highestMidi || fields.falsettoHighestMidi !== sourced.falsettoHighestMidi || fields.lowestMidi !== sourced.lowestMidi) {
      fields.rangeSourceUrl = '';
      fields.rangeQuote = '';
    }
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
  // Lyrics fetched for the old title may belong to another song; they are fetched again on the next visit.
  if (saved) { songLyrics.delete(song.id); selectedSongId = song.id; navigate('song-detail'); toast('곡을 저장했어요.'); }
  else render();
}

async function deleteSong(id) {
  const song = state.songs.find(s => s.id === id);
  if (!song || !confirm(`‘${song.title}’을(를) 삭제할까요? 담긴 플레이리스트에서도 빠져요.`)) return;
  busy = 'saving'; render();
  const previous = state;
  const next = { ...state, songs: state.songs.filter(s => s.id !== id), playlists: removeSongEverywhere(state.playlists, id) };
  state = next;
  try {
    if (!demo) await store.saveState(next);
    storageError = '';
    busy = false;
    navigate(state.playlists.some(p => p.id === selectedPlaylistId) ? 'playlist' : 'songs');
    toast('곡을 삭제했어요.');
  } catch {
    state = previous;
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
const RECOMMEND_NO_MATCH = '조건에 맞는 곡을 못 찾았어요.';
const INTENTS = ['comfortable', 'challenge', 'any'];

async function requestRecommendations(id) {
  if (recLoading) return;
  if (!hasCurrentConsent(state.settings)) { selectedPlaylistId = id; consentReturn = 'playlist'; return navigate('ai-consent'); }
  let request;
  try { request = buildRecommendationRequest(state, id); }
  catch (err) { recError = { id, message: err.message }; return render(); }
  recLoading = id;
  recError = null;
  render();
  let payload = null;
  let message = RECOMMEND_FAILED;
  try {
    const response = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    if (response.ok) payload = await response.json();
    else if (response.status === 503) message = '아직 AI 추천이 설정되지 않았어요.';
  } catch { /* network failure keeps the generic message */ }
  const items = payload?.items;
  if (Array.isArray(items) && items.length === 0) message = RECOMMEND_NO_MATCH;
  recLoading = null;
  // The list may have been deleted or changed while waiting; apply the answer to the current state only.
  // Re-render only the playlist page; other pages (e.g. a half-typed form) keep their input.
  const refresh = () => { if (page === 'playlist') render(); };
  if (!state.playlists.some(p => p.id === id)) return refresh();
  const valid = Array.isArray(items) ? items.filter(isValidRecItem).slice(0, PLAYLIST_LIMITS.recCount) : [];
  if (!valid.length) { recError = { id, message }; return refresh(); }
  const meta = { intent: INTENTS.includes(payload.intent) ? payload.intent : 'any', fallback: payload.fallback === true };
  await persist({ ...state, playlists: state.playlists.map(p => p.id === id ? setRecommendations(p, valid, new Date(), meta) : p) });
  refresh();
}

async function lookupSongRange() {
  if (busy) return;
  const form = document.querySelector('#song-form');
  if (form) readSongForm(form);
  const title = String(songDraft?.title ?? '').trim();
  if (!title) return toast('노래 제목을 먼저 적어 주세요.');
  if (!hasCurrentConsent(state.settings)) { consentReturn = 'song-form'; return navigate('ai-consent'); }
  const token = ++rangeToken;
  const askedFor = { id: songDraft.id ?? null, title };
  busy = 'range'; render();
  let message = '지금은 최고음을 찾지 못했어요.';
  try {
    const response = await fetch('/api/song-range', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, artist: String(songDraft.artist ?? '').trim() }) });
    if (response.status === 503) message = '아직 AI 추천이 설정되지 않았어요.';
    else if (response.ok) {
      const { range } = await response.json();
      if (!stillAsking()) return;
      if (range && Number.isInteger(range.highestMidi)) {
        // Fill the form only; the user decides whether to save. A lowest note above the new top note is dropped.
        const current = songDraft.lowestMidi === '' || songDraft.lowestMidi == null ? null : Number(songDraft.lowestMidi);
        const lowestMidi = range.lowestMidi ?? (current !== null && current <= range.highestMidi ? current : null);
        const sourcedRange = { highestMidi: range.highestMidi, falsettoHighestMidi: range.falsettoHighestMidi ?? null, lowestMidi };
        songDraft = { ...songDraft, ...sourcedRange, rangeSourceUrl: range.sourceUrl, rangeQuote: range.sourceQuote, vocal: range.vocal ?? songDraft.vocal ?? null, sourcedRange };
        message = '출처에서 확인한 최고음을 채웠어요. 확인하고 저장해 주세요.';
      } else message = '출처에서 확인된 최고음을 찾지 못했어요.';
    }
  } catch { /* network failure keeps the generic message */ }
  finally { if (busy === 'range') busy = false; }
  if (!stillAsking()) return;
  render();
  toast(message);

  // The user may have left the form, opened another song, or changed the title while waiting.
  function stillAsking() {
    return token === rangeToken && page === 'song-form' && (songDraft?.id ?? null) === askedFor.id && String(songDraft?.title ?? '').trim() === askedFor.title;
  }
}

async function addRecommendation(index) {
  const playlist = state.playlists.find(p => p.id === selectedPlaylistId);
  if (!playlist || busy) return;
  if (state.songs.length >= 500) return toast('곡은 500곡까지 담을 수 있어요.');
  const { item, playlist: remaining } = takeRecommendation(playlist, Number(index));
  const existing = state.songs.find(song => sameSong(song, item));
  if (existing) {
    busy = 'saving'; render();
    const linked = await persist({ ...state, playlists: state.playlists.map(p => p.id === playlist.id ? addSong(remaining, existing.id) : p) });
    busy = false;
    render();
    if (linked) toast(`이미 담아둔 ‘${existing.title}’을(를) 이 리스트에 넣었어요.`);
    return;
  }
  const byId = new Map(state.songs.map(song => [song.id, song]));
  const listSongs = playlist.songIds.map(songId => byId.get(songId)).filter(Boolean);
  // With my range the song goes in at the original key: a challenge list keeps its challenge.
  const voice = state.settings.voice;
  const range = item.range;
  const checked = Boolean(range?.sourceQuote);
  const vocal = item.vocal ?? null;
  const song = createSong({
    title: item.title, artist: item.artist,
    keyOffset: voice ? 0 : suggestKey(listSongs, range?.highestMidi ?? null) ?? 0,
    lowestMidi: range?.lowestMidi ?? null, highestMidi: range?.highestMidi ?? null,
    falsettoHighestMidi: checked ? range.falsettoHighestMidi : null,
    rangeSourceUrl: range?.sourceUrl ?? '', rangeQuote: checked ? range.sourceQuote : '',
    vocal, octaveShift: voice ? candidateShift(voice.voiceType, vocal) : 0, origin: 'ai',
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
  songLyrics.clear();
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

async function handleVoice(action, id) {
  if (action === 'pick-manual') {
    const count = onboarding?.picks.length ?? 0;
    if (count && !confirm(`고른 곡 ${count}개는 담지 않고 곡 정보 입력 화면으로 갈까요?`)) return;
    return openManualSongForm(onboarding?.playlistId ?? null);
  }
  if (action === 'pick-save' || action === 'pick-save-now') {
    if (!onboarding || onboarding.kind !== 'songs' || busy) return;
    if (action === 'pick-save' && onboarding.picks.some(p => p.status === 'looking')) { onboarding = { ...onboarding, waiting: true }; return refreshPicks(); }
    return savePicked();
  }
  if (action === 'voice-start') return beginOnboarding(state.settings.voice && hasCurrentConsent(state.settings) ? 'voice-pick' : 'voice-intro');
  if (!onboarding) onboarding = startOnboarding(state);
  if (action === 'voice-intro') return navigate('voice-intro');
  if (action === 'voice-begin') return navigate(hasCurrentConsent(state.settings) ? 'voice-pick' : 'voice-intro');
  if (action === 'voice-consent-accept') {
    if (!(await persist({ ...state, settings: withConsent(state.settings, new Date()) }))) return;
    return navigate('voice-pick');
  }
  if (action === 'voice-later') {
    if (!state.settings.voice && !state.settings.voiceOnboardingDismissedAt && !demo) await persist(dismissOnboarding(state, new Date()));
    onboarding = null;
    return navigate('songs');
  }
  if (action === 'voice-type') { onboarding = setVoiceType(onboarding, id); return render(); }
  if (action === 'voice-add') return addOnboardingPick(onboarding.search.results[Number(id)]);
  if (action === 'search-artist') return runSearch({ term: followUpTerm(onboarding.search), mode: 'artist', artistTitle: onboarding.search.artist });
  if (action === 'search-more') {
    const search = onboarding.search;
    if (search.shown < search.results.length) { setSearch({ shown: search.shown + 20 }); return refreshResults(); }
    if (search.hasMore) return runSearch({ term: followUpTerm(search), mode: search.mode, page: search.page + 1, append: true });
    return;
  }
  if (action === 'voice-remove') { onboarding = removePick(onboarding, id); return refreshPicks(); }
  if (action === 'voice-octave') { onboarding = toggleOctave(onboarding, id); return refreshPicks(); }
  if (action === 'voice-result') {
    if (onboarding.picks.some(p => p.status === 'looking')) { onboarding = { ...onboarding, waiting: true }; return refreshPicks(); }
    return navigate('voice-result');
  }
  if (action === 'voice-manual') {
    const { midi } = onboardingResult(onboarding);
    if (midi !== null) onboarding = { ...onboarding, manualMidi: midi };
    return navigate('voice-manual');
  }
  if (action === 'voice-step') {
    onboarding = { ...onboarding, manualMidi: Math.max(RANGE_BOUNDS.min, Math.min(RANGE_BOUNDS.max, onboarding.manualMidi + Number(id))) };
    return render();
  }
  if (action === 'voice-listen' && !busy) {
    const token = ++operation;
    busy = 'tone'; render();
    try { await audio.tone(Number(id)); }
    finally { if (token === operation) { busy = false; if (page.startsWith('voice-')) render(); } }
    return;
  }
  if (action === 'voice-save' || action === 'voice-manual-save') {
    let next;
    try {
      next = action === 'voice-save'
        ? commitOnboarding(state, onboarding, new Date())
        : onboarding.picks.length
          ? commitOnboarding(state, onboarding, new Date(), { manualMidi: onboarding.manualMidi })
          : commitManual(state, { midi: onboarding.manualMidi, voiceType: onboarding.voiceType }, new Date());
    } catch (err) { return toast(err.message); }
    return saveVoice(next, '내 음역을 저장했어요.');
  }
}

async function handle(action, id) {
  // Persistence writes must finish before navigating or changing their source state.
  if (busy === 'saving') return;
  if (action === 'songs') selectedPlaylistId = null;
  // Tapping the tab you are already on keeps an onboarding in progress instead of starting it over.
  if (action === 'songs' && page.startsWith('voice-') && onboarding) return;
  if (action === 'songs' && shouldShowOnboarding(state, { demo, initialized })) return beginOnboarding('voice-intro');
  if (/^(voice|search|pick)-/.test(action)) return handleVoice(action, id);
  if (action.startsWith('media-')) return handleMedia(action, id);
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
  if (action === 'song-range') return lookupSongRange();
  if (action === 'consent-back') {
    if (consentReturn === 'result' || consentReturn === 'detail') return navigate(consentReturn);
    if (consentReturn === 'song-pick') return openManualSongForm(pendingPickList);
    if (consentReturn === 'song-detail') return navigate('song-detail');
    return navigate(consentReturn === 'song-form' ? 'song-form' : state.playlists.some(p => p.id === selectedPlaylistId) ? 'playlist' : 'songs');
  }
  if (action === 'ai-consent-accept') {
    if (!(await persist({ ...state, settings: withConsent(state.settings, new Date()) }))) return;
    if (consentReturn === 'result' || consentReturn === 'detail') { navigate(consentReturn); return requestHummingFeedback(); }
    if (consentReturn === 'song-form') { navigate('song-form'); return lookupSongRange(); }
    if (consentReturn === 'song-pick') return beginPicker(pendingPickList);
    if (consentReturn === 'song-detail') return navigate('song-detail');
    navigate('playlist');
    return requestRecommendations(selectedPlaylistId);
  }
  if (action === 'ai-consent-revoke') {
    await persist({ ...state, settings: withoutConsent(state.settings) });
    render();
    return toast('AI 추천·곡 검색·영상 찾기 동의를 철회했어요.');
  }
  if (action === 'song-add') {
    if (!initialized && !demo) return toast('저장소가 준비되지 않았어요. 체험 모드에서 먼저 둘러볼 수 있어요.');
    const listId = state.playlists.some(p => p.id === id) ? id : null;
    if (!hasCurrentConsent(state.settings)) { pendingPickList = listId; consentReturn = 'song-pick'; return navigate('ai-consent'); }
    return beginPicker(listId);
  }
  if (action === 'song-edit') {
    if (!initialized && !demo) return toast('저장소가 준비되지 않았어요. 체험 모드에서 먼저 둘러볼 수 있어요.');
    songDraft = { ...state.songs.find(s => s.id === id), playlistIds: state.playlists.filter(p => p.songIds.includes(id)).map(p => p.id) };
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
  if (action === 'feedback-humming') return requestHummingFeedback();
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
  let id = target.dataset.id;
  // The song timeline passes where it was tapped, as a fraction of its width.
  if (target.dataset.action === 'media-seek') { const box = target.getBoundingClientRect(); id = String((event.clientX - box.left) / box.width); }
  try { await handle(target.dataset.action, id); }
  catch (err) {
    busy = false;
    render();
    toast(err?.message?.startsWith('Invalid') ? '백업 형식이 맞지 않아요. 기존 기록은 유지했어요.' : err.message || '작업을 마치지 못했어요. 다시 시도해 주세요.');
  }
});

root.addEventListener('change', async event => {
  try {
    if (event.target.closest('#song-form')) readSongForm(event.target.form);
    if (event.target.name === 'pickKey' && onboarding) onboarding = setPickKey(onboarding, event.target.dataset.key, event.target.value);
    if (event.target.id === 'voice-create-list' && onboarding) onboarding = { ...onboarding, createList: event.target.checked };
    if (event.target.id === 'search-pop' && onboarding) {
      onboarding = { ...onboarding, scope: event.target.checked ? 'all' : 'kor' };
      const search = onboarding.search;
      if (search.term) runSearch({ term: search.term, mode: search.mode, artistTitle: search.artistTitle });
    }
    if (event.target.id === 'keep-audio') await persist({ ...state, settings: { ...state.settings, keepAudio: event.target.checked } });
    if (event.target.id === 'backup-file') await importBackup(event.target.files[0]);
  } catch {
    toast('백업을 가져오지 못했어요. 파일 형식을 확인해 주세요. 기존 기록은 유지했어요.');
  }
});

// Scrolling the full lyrics by hand pauses its follow-along for a moment.
for (const type of ['wheel', 'touchmove']) root.addEventListener(type, event => { if (event.target.closest?.('#lyrics-full')) lyricsScrollAt = Date.now(); }, { passive: true });

root.addEventListener('input', event => {
  if (event.target.id === 'voice-search') scheduleSearch(event.target.value);
  if (event.target.id === 'song-search') {
    songQuery = event.target.value;
    document.querySelector('#song-results').innerHTML = playlistHomeResults(state, songQuery);
  }
  if (event.target.closest('#song-form')) readSongForm(event.target.form);
});

root.addEventListener('submit', async event => {
  if (event.target.id === 'voice-direct-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    addOnboardingPick({ title: String(data.get('title') ?? ''), artist: String(data.get('artist') ?? '') });
    event.target.reset();
    return;
  }
  if (event.target.id === 'playlist-form') {
    event.preventDefault();
    await savePlaylist(event.target);
    return;
  }
  if (event.target.id === 'media-paste-form') { event.preventDefault(); return pasteLink(event.target); }
  if (event.target.id === 'media-pin-form') { event.preventDefault(); return savePin(event.target); }
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
