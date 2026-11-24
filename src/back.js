// The phone's back button. The app keeps one history entry ("trap") above the page; going back pops it and the
// app does what the screen's own back button does, then sets the trap again. Where a screen has nowhere to go
// back to (home, the invite screen), going back leaves the app as it normally would. The address never changes.

const HOME = 'home';
// Each screen's own back button (views): keep these in step with the screens.
const ACTIONS = {
  home: null, invite: null, 'open-outside': null,
  explore: 'pause', practice: 'pause',
  detail: 'history',
  playlist: 'songs', 'all-songs': 'songs',
  'song-pick': 'song-back', 'song-form': 'song-back',
  'voice-intro': 'voice-later', 'voice-pick': 'voice-intro', 'voice-result': 'voice-begin',
  'ai-consent': 'consent-back',
};

/** The action handle() should run for the back button on this screen, or null to leave the app. */
export function backAction(page, { panelOpen = false, hasPicks = false, editingPlaylist = false } = {}) {
  if (page === 'song-detail') return panelOpen ? 'media-panel-close' : 'song-back';
  if (page === 'voice-manual') return hasPicks ? 'voice-begin' : 'voice-intro';
  if (page === 'playlist-form') return editingPlaylist ? 'playlist-open' : 'songs';
  return page in ACTIONS ? ACTIONS[page] : HOME;
}

export function createBackTrap({ history, listen, getPage, getContext = () => ({}), run }) {
  let armed = false;

  function sync() {
    if (armed || backAction(getPage(), getContext()) === null) return;
    history.pushState({ sing: 'back' }, '');
    armed = true;
  }

  listen('popstate', async () => {
    if (!armed) return;
    armed = false;
    const action = backAction(getPage(), getContext());
    if (action === null) { history.back(); return; }
    try { await run(action); }
    finally { sync(); }
  });

  return { sync };
}
