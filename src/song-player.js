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
  let generation = 0;

  function cue(videoId) {
    if (!ready || cued === videoId) return;
    cued = videoId;
    player.cueVideoById(videoId);
  }

  function create(slot, videoId) {
    const mine = ++generation;
    const host = document.createElement('div');
    slot.replaceChildren(host);
    player = { pending: true };
    loadApi().then(YT => {
      if (mine !== generation) return;
      player = new YT.Player(host, {
        host: PLAYER_HOST, videoId,
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: {
          // Cueing again on ready makes the first video report "cued" (5) or its error like every later one.
          onReady: () => { if (mine !== generation) return; ready = true; cued = null; if (shown) cue(shown); },
          onStateChange: event => { if (mine === generation) onState(event.data, shown); },
          onError: event => { if (mine !== generation) return; cued = null; onError(event.data, shown); },
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
      if (!player) create(slot, shown);
      else cue(shown);
    },
    seekTo(seconds) {
      if (!ready) return;
      player.seekTo(Math.max(0, seconds), true);
      player.playVideo();
    },
    currentTime() { return ready && shown ? player.getCurrentTime() : null; },
    currentVideoId() { return shown; },
    destroy() {
      generation++;
      if (ready) player.destroy();
      player = null;
      ready = false;
      shown = cued = null;
    },
  };
}
