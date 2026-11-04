// The song screen's YouTube player behind a small interface; the app never touches the YT object directly.
// One iframe lives in the player slot for the whole visit to a song: switching videos cues them in place,
// so the page around it can be redrawn without the video reloading.
const API_URL = 'https://www.youtube.com/iframe_api';
const PLAYER_HOST = 'https://www.youtube-nocookie.com';
let apiReady = null;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => { apiReady = null; reject(new Error('player script did not load')); };
    document.head.append(script);
  });
  return apiReady;
}

/** onState(state, videoId) and onError(code, videoId) follow the IFrame API codes; onLoadFail() when the script fails. */
export function createSongPlayer({ onState = () => {}, onError = () => {}, onLoadFail = () => {} } = {}) {
  let player = null;
  let ready = false;
  let shown = null;
  let cued = null;
  let playerState = null;
  let generation = 0;

  function cue(videoId) {
    if (!ready || cued === videoId) return;
    cued = videoId;
    playerState = null;
    player.cueVideoById(videoId);
  }

  // The video an event is about: what the player reports, else the one it was last asked to load. Never simply the
  // one on screen now: an error for a video already left behind must not be charged to its replacement.
  function eventVideo() {
    try { return player.getVideoData?.().video_id || cued; } catch { return cued; }
  }

  function create(slot) {
    const mine = ++generation;
    const host = document.createElement('div');
    slot.replaceChildren(host);
    player = { pending: true };
    loadApi().then(YT => {
      if (mine !== generation) return;
      // Created empty and cued once on ready, so every video loads exactly once and reports "cued" (5) or its error.
      player = new YT.Player(host, {
        host: PLAYER_HOST,
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: () => { if (mine !== generation) return; ready = true; if (shown) cue(shown); },
          onStateChange: event => { if (mine !== generation) return; playerState = event.data; onState(event.data, eventVideo()); },
          onError: event => { if (mine !== generation) return; const videoId = eventVideo(); cued = null; onError(event.data, videoId); },
        },
      });
    }).catch(() => { if (mine === generation) { player = null; onLoadFail(); } });
  }

  return {
    show(slot, videoId) {
      shown = videoId ?? null;
      if (!slot) return;
      slot.hidden = !shown;
      if (!shown) { if (ready) player.pauseVideo(); return; }
      if (!player) create(slot);
      else cue(shown);
    },
    seekTo(seconds) {
      if (!ready) return;
      player.seekTo(Math.max(0, seconds), true);
      player.playVideo();
    },
    currentTime() { return ready && shown ? player.getCurrentTime() : null; },
    currentVideoId() { return shown; },
    /** The last IFrame API state of the shown video (1 playing, 2 paused, 5 cued…), null before any. */
    playbackState() { return playerState; },
    destroy() {
      generation++;
      if (ready) player.destroy();
      player = null;
      ready = false;
      shown = cued = playerState = null;
    },
  };
}
