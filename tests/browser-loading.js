import { defaultState } from '/src/storage.js';
import { createLesson } from '/src/lesson.js';
import { createSong } from '/src/songs.js';

const originalFactory = globalThis.indexedDB;
const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const testName = `sing-practice-test-loading-${crypto.randomUUID()}`;
const title = `격리 검증용 곡 ${crypto.randomUUID()}`;
const connections = new Set();
let passed = 0;
let failed = 0;

function assert(condition, message) { if (!condition) throw new Error(message); }
async function check(label, action) {
  const row = document.createElement('li');
  try { await action(); passed++; row.textContent = `PASS · ${label}`; }
  catch (error) { failed++; row.textContent = `FAIL · ${label}: ${error.message}`; }
  document.querySelector('#results').append(row);
}
function openNative(name, version) {
  return new Promise((resolve, reject) => {
    const request = originalFactory.open(name, version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('recordings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('seed transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('seed transaction failed'));
  });
}
function waitForRenderAfter(action) {
  return new Promise((resolve, reject) => {
    const root = document.querySelector('#app');
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('초기화 렌더링 시간 초과')); }, 5000);
    const observer = new MutationObserver(() => { clearTimeout(timeout); observer.disconnect(); resolve(); });
    observer.observe(root, { childList: true });
    action();
  });
}
function click(action) {
  const target = document.querySelector(`[data-action="${action}"]`);
  assert(target && !target.disabled, `${action} 버튼 없음`);
  target.click();
}

try {
  const seed = await openNative(testName, 1);
  connections.add(seed);
  const draft = createLesson(new Date());
  const song = createSong({ title });
  const initialState = { ...defaultState(), draft, songs: [song] };
  const tx = seed.transaction('state', 'readwrite');
  const done = transactionComplete(tx);
  tx.objectStore('state').put(initialState, 'current');
  await done;
  seed.close();

  let openRequested;
  const requested = new Promise(resolve => { openRequested = resolve; });
  let openSucceeded;
  const succeeded = new Promise(resolve => { openSucceeded = resolve; });
  let release = false;
  let delivered = false;
  let successEvent;
  let successHandler;
  const deliver = () => {
    if (release && !delivered && successEvent && successHandler) {
      delivered = true;
      successHandler(successEvent);
    }
  };
  const isolatedFactory = {
    open(requestedName, version) {
      assert(requestedName === 'sing-practice', `예상 밖 저장소 접근: ${requestedName}`);
      const request = originalFactory.open(testName, version);
      openRequested();
      request.onsuccess = event => {
        connections.add(request.result);
        successEvent = event;
        openSucceeded();
        deliver();
      };
      return new Proxy(request, {
        get(target, key) { return Reflect.get(target, key, target); },
        set(target, key, value) {
          if (key === 'onsuccess') successHandler = value;
          else Reflect.set(target, key, value, target);
          return true;
        },
      });
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: isolatedFactory });

  await import('/src/app.js');
  await requested;
  await succeeded;
  await check('저장소 로딩 중 체험 진입', async () => {
    click('demo');
    assert(Boolean(document.querySelector('.demo-banner')), '체험 배너 없음');
    click('songs');
    assert(Boolean(document.querySelector('.song-empty')), '체험 노래장이 비어 있지 않음');
    assert(!document.querySelector('#song-results')?.textContent.includes(title), '실제 곡이 체험에 노출됨');
  });
  await check('늦은 초기화 후에도 체험 노래장 격리', async () => {
    await waitForRenderAfter(() => { release = true; deliver(); });
    assert(Boolean(document.querySelector('.demo-banner')), '체험 모드가 종료됨');
    assert(Boolean(document.querySelector('.song-empty')), '실제 곡이 체험 노래장에 섞임');
    assert(!document.querySelector('#song-results')?.textContent.includes(title), '실제 곡이 체험에 노출됨');
  });
  await check('체험 종료 후 실제 곡과 레슨 초안 복구', async () => {
    click('exit-demo');
    assert(document.querySelector('#app')?.textContent.includes('이어서 연습하기'), '실제 레슨 초안이 보이지 않음');
    click('songs');
    assert(document.querySelector('#song-results')?.textContent.includes(title), '실제 곡이 보이지 않음');
    assert(!document.querySelector('.demo-banner'), '체험 배너가 남음');
  });
} catch (error) {
  failed++;
  const row = document.createElement('li');
  row.textContent = `FAIL · 검사 준비 또는 실행: ${error.message}`;
  document.querySelector('#results').append(row);
} finally {
  // Remove the test app controls before restoring the native factory.
  document.querySelector('#app').replaceChildren();
  if (originalDescriptor) Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
  else delete globalThis.indexedDB;
  for (const db of connections) db.close();
  const deleted = await new Promise(resolve => {
    const request = originalFactory.deleteDatabase(testName);
    const timeout = setTimeout(() => resolve(false), 5000);
    request.onsuccess = () => { clearTimeout(timeout); resolve(true); };
    request.onerror = () => { clearTimeout(timeout); resolve(false); };
    request.onblocked = () => { for (const db of connections) db.close(); };
  });
  if (!deleted) failed++;
  document.querySelector('#summary').textContent = `${passed} passed / ${failed} failed · ${deleted ? '임시 테스트 데이터 정리 완료' : '임시 테스트 DB 삭제 실패'}`;
  document.title = `SING loading check: ${passed} passed, ${failed} failed`;
}
