import { openStore, defaultState } from '/src/storage.js';
import { createLesson, recordAttempt, finishLesson, addActivity } from '/src/lesson.js';
import { createSong, updateSong } from '/src/songs.js';

const name = `sing-practice-test-${crypto.randomUUID()}`;
let store;
let passed = 0;
let failed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function check(label, action) {
  const row = document.createElement('li');
  try { await action(); passed++; row.textContent = `PASS · ${label}`; }
  catch (error) { failed++; row.textContent = `FAIL · ${label}: ${error.message}`; }
  document.querySelector('#results').append(row);
}

try {
  store = await openStore({ name });
  await check('처음 연 저장소는 빈 상태', async () => assert(JSON.stringify(await store.getState()) === JSON.stringify(defaultState()), 'nonempty'));
  const now = new Date('2026-09-27T01:00:00.000Z');
  let session = createLesson(now);
  const measurement = { reliable: true, midi: 57, cents: 2, recordingId: 'test-recording' };
  session = recordAttempt(recordAttempt(session, measurement, 'comfortable', now), measurement, 'comfortable', now);
  session = { ...finishLesson(session), completedAt: now.toISOString() };
  const state = addActivity({ ...defaultState(), sessions: [session] }, 'practice', session.id, now);
  const original = new Blob([new Uint8Array([0, 1, 2, 251, 255])], { type: 'audio/webm' });
  await check('실제 IndexedDB에 레슨과 원음 저장', async () => {
    await store.saveState(state);
    await store.putRecording('test-recording', original);
    assert((await store.getState()).sessions[0].attempts.length === 2, 'attempts missing');
    assert((await store.getRecording('test-recording')).size === 5, 'blob missing');
  });
  let backup;
  await check('백업 → 비우기 → 복원 후 상태와 원음 동일', async () => {
    backup = await store.exportData();
    await store.clear();
    assert((await store.getState()).sessions.length === 0, 'not cleared');
    await store.importData(backup);
    assert(JSON.stringify(await store.getState()) === JSON.stringify(state), 'state changed');
    const bytes = new Uint8Array(await (await store.getRecording('test-recording')).arrayBuffer());
    assert(bytes.join() === '0,1,2,251,255', 'audio bytes changed');
  });
  await check('잘못된 백업은 기존 기록을 덮어쓰지 않음', async () => {
    const invalid = JSON.parse(backup);
    invalid.state.sessions[0].attempts[0].comfort = 'unsafe-input';
    let rejected = false;
    try { await store.importData(JSON.stringify(invalid)); } catch { rejected = true; }
    assert(rejected, 'invalid backup accepted');
    assert(JSON.stringify(await store.getState()) === JSON.stringify(state), 'state lost');
    assert((await store.getRecording('test-recording')).size === 5, 'audio lost');
  });
  await check('저장소를 닫고 다시 열어도 기록과 날짜 유지', async () => {
    store.close();
    store = await openStore({ name });
    assert((await store.getState()).activities[0].day === state.activities[0].day, 'date moved');
    assert((await store.getState()).sessions[0].id === session.id, 'record lost');
  });
  await check('녹음 삭제 후 수치 기록은 유지', async () => {
    await store.deleteRecording('test-recording');
    assert(await store.getRecording('test-recording') === null, 'audio retained');
    assert((await store.getState()).sessions.length === 1, 'session lost');
  });
  await check('레슨과 연결된 녹음을 한 번에 삭제', async () => {
    await store.putRecording('test-recording', original);
    await store.saveState(defaultState(), { deleteRecordings: ['test-recording'] });
    assert((await store.getState()).sessions.length === 0, 'session retained');
    assert(await store.getRecording('test-recording') === null, 'orphan audio retained');
  });
  const song = createSong({
    title: '봄날', artist: '테스트 가수', originalKey: 'C',
    lowestMidi: 55, highestMidi: 72, keyOffset: -2,
    lyricsUrl: 'https://example.org/lyrics', note: '낮은 음부터',
  }, now);
  const withSong = { ...state, songs: [song] };
  let songBackup;
  await check('곡·레슨·원음 백업을 비우고 복원해도 모두 동일', async () => {
    await store.saveState(withSong);
    await store.putRecording('test-recording', original);
    songBackup = await store.exportData();
    await store.clear();
    await store.importData(songBackup);
    assert(JSON.stringify(await store.getState()) === JSON.stringify(withSong), 'song or lesson changed');
    const bytes = new Uint8Array(await (await store.getRecording('test-recording')).arrayBuffer());
    assert(bytes.join() === '0,1,2,251,255', 'audio bytes changed');
  });
  await check('곡 수정·삭제 후 레슨과 원음 유지', async () => {
    const changed = updateSong(song, { title: '봄날 연습', status: 'practicing', keyOffset: 1 }, new Date('2026-09-28T01:00:00.000Z'));
    await store.saveState({ ...withSong, songs: [changed] });
    assert((await store.getState()).songs[0].title === '봄날 연습', 'edit missing');
    assert((await store.getState()).songs[0].status === 'practicing', 'status missing');
    await store.saveState({ ...withSong, songs: [] });
    assert((await store.getState()).songs.length === 0, 'song retained');
    assert((await store.getState()).sessions[0].id === session.id, 'lesson lost');
    assert((await store.getRecording('test-recording')).size === 5, 'audio lost');
  });
  await check('곡 없는 구형 v1 백업도 레슨·원음을 보존해 가져옴', async () => {
    const legacy = JSON.parse(songBackup);
    delete legacy.state.songs;
    await store.importData(JSON.stringify(legacy));
    const restored = await store.getState();
    assert(restored.songs.length === 0, 'legacy songs not normalized');
    assert(restored.sessions[0].id === session.id, 'legacy lesson lost');
    assert(restored.activities[0].day === state.activities[0].day, 'legacy date moved');
    const bytes = new Uint8Array(await (await store.getRecording('test-recording')).arrayBuffer());
    assert(bytes.join() === '0,1,2,251,255', 'legacy audio lost');
  });
  await check('잘못된 곡이 포함된 백업 거절 후 현재 데이터 유지', async () => {
    const invalid = JSON.parse(songBackup);
    invalid.state.songs[0].lyricsUrl = 'http://example.org/lyrics';
    const before = JSON.stringify(await store.getState());
    let rejected = false;
    try { await store.importData(JSON.stringify(invalid)); } catch { rejected = true; }
    assert(rejected, 'invalid song accepted');
    assert(JSON.stringify(await store.getState()) === before, 'state changed after rejection');
    const bytes = new Uint8Array(await (await store.getRecording('test-recording')).arrayBuffer());
    assert(bytes.join() === '0,1,2,251,255', 'audio changed after rejection');
  });
} catch (error) {
  failed++;
  document.querySelector('#results').textContent += error.message;
} finally {
  store?.close();
  // This UUID-named database was created only by this test run.
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  document.querySelector('#summary').textContent = `${passed} passed / ${failed} failed · 임시 테스트 데이터 정리 완료`;
  document.title = `SING checks: ${passed} passed, ${failed} failed`;
}
