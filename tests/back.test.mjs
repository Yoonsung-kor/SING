import assert from 'node:assert/strict';
import test from 'node:test';
import { backAction, createBackTrap } from '../src/back.js';

test('the back button does what each screen\'s own back button does', () => {
  const table = {
    home: null, invite: null, 'open-outside': null,
    songs: 'home', learn: 'home', history: 'home', check: 'home', intro: 'home', result: 'home', done: 'home', rest: 'home',
    explore: 'pause', practice: 'pause',
    detail: 'history',
    playlist: 'songs', 'all-songs': 'songs', 'playlist-form': 'songs',
    'song-pick': 'song-back', 'song-form': 'song-back', 'song-detail': 'song-back',
    'voice-intro': 'voice-later', 'voice-pick': 'voice-intro', 'voice-result': 'voice-begin', 'voice-manual': 'voice-intro',
    'ai-consent': 'consent-back',
    'something-new': 'home',
  };
  for (const [page, action] of Object.entries(table)) assert.equal(backAction(page), action, page);
  assert.equal(backAction('song-detail', { panelOpen: true }), 'media-panel-close');
  assert.equal(backAction('voice-manual', { hasPicks: true }), 'voice-begin');
  assert.equal(backAction('playlist-form', { editingPlaylist: true }), 'playlist-open');
});

const fakeHistory = () => ({ pushes: 0, backs: 0, pushState() { this.pushes++; }, back() { this.backs++; } });
const trap = (startPage, run = async () => {}) => {
  const history = fakeHistory();
  let listener = null;
  const state = { page: startPage, context: {} };
  const ran = [];
  const back = createBackTrap({ history, listen: (type, fn) => { assert.equal(type, 'popstate'); listener = fn; }, getPage: () => state.page, getContext: () => state.context, run: async action => { ran.push(action); await run(action, state); } });
  return { history, state, ran, back, pop: () => listener() };
};

test('home sets no trap, other screens set one at most', () => {
  const home = trap('home');
  home.back.sync();
  assert.equal(home.history.pushes, 0);
  const songs = trap('songs');
  songs.back.sync();
  songs.back.sync();
  assert.equal(songs.history.pushes, 1);
});

test('going back runs the screen\'s back action and sets the trap again', async () => {
  const t = trap('song-detail', async (action, state) => { state.page = 'playlist'; });
  t.back.sync();
  await t.pop();
  assert.deepEqual(t.ran, ['song-back']);
  assert.equal(t.history.pushes, 2);
  assert.equal(t.history.backs, 0);
});

test('going back from home with a trap still set leaves the app', async () => {
  const t = trap('songs');
  t.back.sync();
  t.state.page = 'home';
  await t.pop();
  assert.equal(t.history.backs, 1);
  assert.deepEqual(t.ran, []);
});

test('a back move with no trap set is ignored', async () => {
  const t = trap('songs');
  await t.pop();
  assert.deepEqual(t.ran, []);
  assert.equal(t.history.backs, 0);
});

test('the trap comes back even when the action fails', async () => {
  const t = trap('playlist', async () => { throw new Error('busy'); });
  t.back.sync();
  await assert.rejects(t.pop());
  assert.equal(t.history.pushes, 2);
});
