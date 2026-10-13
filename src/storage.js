import { validateSong } from './songs.js';

const DB_NAME = 'sing-practice';
const DB_VERSION = 1;
const STATE_KEY = 'current';
const MAX_BACKUP_TEXT = 25 * 1024 * 1024;
const MAX_RECORDING = 10 * 1024 * 1024;
const MAX_ITEMS = 500;
const MAX_BACKUP_RECORDINGS = 5000;
const COMFORT = ['comfortable', 'effort', 'unsure', 'pain'];

export function defaultState() {
  return { version: 1, sessions: [], draft: null, activities: [], songs: [], settings: { keepAudio: false } };
}

function invalid(path) { throw new Error(`Invalid backup: ${path}`); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
}
function string(value, path) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) invalid(path);
}
function nullableString(value, path) {
  if (value !== null) string(value, path);
}
function timestamp(value, path) {
  string(value, path);
  if (!Number.isFinite(Date.parse(value))) invalid(path);
}
function day(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(path);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) invalid(path);
}
function midi(value, path) {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 127)) invalid(path);
}
function boundedArray(value, path, max = MAX_ITEMS) {
  if (!Array.isArray(value) || value.length > max) invalid(path);
}
function uniqueIds(items, path) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) invalid(`${path} duplicate id`);
    ids.add(item.id);
  }
}
function validateAttempt(value, path) {
  object(value, path);
  string(value.id, `${path}.id`);
  midi(value.targetMidi, `${path}.targetMidi`);
  midi(value.midi, `${path}.midi`);
  if (typeof value.reliable !== 'boolean') invalid(`${path}.reliable`);
  if (value.cents !== null && (typeof value.cents !== 'number' || !Number.isFinite(value.cents))) invalid(`${path}.cents`);
  if (!COMFORT.includes(value.comfort)) invalid(`${path}.comfort`);
  timestamp(value.createdAt, `${path}.createdAt`);
  nullableString(value.recordingId, `${path}.recordingId`);
  if (value.verified !== undefined && typeof value.verified !== 'boolean') invalid(`${path}.verified`);
}
function validatePractice(value, path) {
  object(value, path);
  midi(value.midi, `${path}.midi`);
  if (value.midi === null) invalid(`${path}.midi`);
  object(value.measurement, `${path}.measurement`);
  if (typeof value.measurement.reliable !== 'boolean') invalid(`${path}.measurement.reliable`);
  midi(value.measurement.midi, `${path}.measurement.midi`);
  if (value.measurement.cents !== null && (typeof value.measurement.cents !== 'number' || !Number.isFinite(value.measurement.cents))) invalid(`${path}.measurement.cents`);
  if (value.measurement.reason !== undefined) string(value.measurement.reason, `${path}.measurement.reason`);
  if (!COMFORT.includes(value.comfort)) invalid(`${path}.comfort`);
  nullableString(value.recordingId, `${path}.recordingId`);
  timestamp(value.completedAt, `${path}.completedAt`);
}
function validateSession(value, path) {
  object(value, path);
  string(value.id, `${path}.id`);
  timestamp(value.startedAt, `${path}.startedAt`);
  day(value.day, `${path}.day`);
  if (!['exploring', 'finished'].includes(value.status)) invalid(`${path}.status`);
  boundedArray(value.attempts, `${path}.attempts`, 100);
  value.attempts.forEach((attempt, i) => validateAttempt(attempt, `${path}.attempts[${i}]`));
  uniqueIds(value.attempts, `${path}.attempts`);
  midi(value.targetMidi, `${path}.targetMidi`);
  if (!['start', 'confirm', 'ready', 'capture', 'retry', 'result'].includes(value.phase)) invalid(`${path}.phase`);
  if (!Number.isInteger(value.retryCount) || value.retryCount < 0 || value.retryCount > 100) invalid(`${path}.retryCount`);
  nullableString(value.stopReason, `${path}.stopReason`);
  if (value.completedAt !== undefined && value.completedAt !== null) timestamp(value.completedAt, `${path}.completedAt`);
  if (value.practice !== undefined && value.practice !== null) validatePractice(value.practice, `${path}.practice`);
}
function validateActivity(value, path) {
  object(value, path);
  string(value.id, `${path}.id`);
  if (!['practice', 'learn', 'rest'].includes(value.type)) invalid(`${path}.type`);
  day(value.day, `${path}.day`);
  timestamp(value.createdAt, `${path}.createdAt`);
  if (value.sessionId !== undefined) string(value.sessionId, `${path}.sessionId`);
}
function validateState(value) {
  object(value, 'state');
  if (value.version !== 1) invalid('state version');
  boundedArray(value.sessions, 'sessions');
  value.sessions.forEach((session, i) => validateSession(session, `sessions[${i}]`));
  uniqueIds(value.sessions, 'sessions');
  if (value.draft !== null) validateSession(value.draft, 'draft');
  boundedArray(value.activities, 'activities');
  value.activities.forEach((activity, i) => validateActivity(activity, `activities[${i}]`));
  uniqueIds(value.activities, 'activities');
  if (value.songs !== undefined) {
    boundedArray(value.songs, 'songs');
    value.songs.forEach(validateSong);
    uniqueIds(value.songs, 'songs');
  }
  object(value.settings, 'settings');
  if (typeof value.settings.keepAudio !== 'boolean') invalid('settings.keepAudio');
  return value.songs === undefined ? { ...value, songs: [] } : value;
}

function recordingBytes(data) {
  if (typeof data !== 'string' || data.length % 4) invalid('recording base64');
  const size = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (size > MAX_RECORDING) invalid('recording size');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) invalid('recording base64');
  if (data.endsWith('==') && data.length < 4) invalid('recording base64');
  return size;
}
function validateRecording(value, path) {
  object(value, path);
  string(value.id, `${path}.id`);
  if (!audioMime(value.mime)) invalid(`${path}.mime`);
  recordingBytes(value.data);
}
function audioMime(value) {
  return typeof value === 'string' && /^audio\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*$/i.test(value);
}

// Pure parser used before a restore transaction begins.
export function parseBackup(json) {
  if (typeof json !== 'string' || json.length > MAX_BACKUP_TEXT || new TextEncoder().encode(json).length > MAX_BACKUP_TEXT) throw new Error('Invalid backup size (maximum 25 MB)');
  let value;
  try { value = JSON.parse(json); } catch { throw new Error('Invalid backup JSON'); }
  object(value, 'root');
  if (value.version !== 1) invalid('version');
  value.state = validateState(value.state);
  boundedArray(value.recordings, 'recordings', MAX_BACKUP_RECORDINGS);
  value.recordings.forEach((recording, i) => validateRecording(recording, `recordings[${i}]`));
  uniqueIds(value.recordings, 'recordings');
  return value;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  });
}
function decodeBase64(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function encodeBase64(bytes) {
  let result = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) result += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(result);
}
async function writeTransaction(db, stores, operation) {
  const tx = db.transaction(stores, 'readwrite');
  const done = transactionDone(tx);
  try { operation(tx); } catch (error) {
    tx.abort();
    await done.catch(() => {});
    throw error;
  }
  await done;
}

export async function openStore({ name = DB_NAME } = {}) {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable; records cannot be saved on this device.');
  string(name, 'database name');
  const request = indexedDB.open(name, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings');
  };
  const db = await new Promise((resolve, reject) => {
    let blocked = false;
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('IndexedDB could not open'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('IndexedDB upgrade is blocked by another open tab. Close it and try again.'));
    };
  });
  return {
    close() { db.close(); },
    async getState() {
      const tx = db.transaction('state', 'readonly');
      const done = transactionDone(tx);
      const [value] = await Promise.all([requestResult(tx.objectStore('state').get(STATE_KEY)), done]);
      return validateState(value ?? defaultState());
    },
    saveState(state, { deleteRecordings = [] } = {}) {
      const normalizedState = validateState(state);
      boundedArray(deleteRecordings, 'delete recordings', 5000);
      deleteRecordings.forEach(id => string(id, 'recording id'));
      return writeTransaction(db, ['state', 'recordings'], tx => {
        tx.objectStore('state').put(normalizedState, STATE_KEY);
        deleteRecordings.forEach(id => tx.objectStore('recordings').delete(id));
      });
    },
    putRecording(id, blob) {
      string(id, 'recording id');
      if (!(blob instanceof Blob) || blob.size > MAX_RECORDING || !audioMime(blob.type)) throw new Error('Invalid recording blob (maximum 10 MB audio)');
      return writeTransaction(db, ['recordings'], tx => tx.objectStore('recordings').put(blob, id));
    },
    async getRecording(id) {
      const tx = db.transaction('recordings', 'readonly');
      const done = transactionDone(tx);
      const [blob] = await Promise.all([requestResult(tx.objectStore('recordings').get(id)), done]);
      return blob ?? null;
    },
    deleteRecording(id) {
      return writeTransaction(db, ['recordings'], tx => tx.objectStore('recordings').delete(id));
    },
    async exportData() {
      const tx = db.transaction(['state', 'recordings'], 'readonly');
      const done = transactionDone(tx);
      const [storedState, ids, blobs] = await Promise.all([
        requestResult(tx.objectStore('state').get(STATE_KEY)),
        requestResult(tx.objectStore('recordings').getAllKeys()),
        requestResult(tx.objectStore('recordings').getAll()),
        done,
      ]);
      const state = validateState(storedState ?? defaultState());
      if (ids.length > MAX_BACKUP_RECORDINGS) throw new Error(`Backup recording limit exceeded (${MAX_BACKUP_RECORDINGS})`);
      const recordings = await Promise.all(blobs.map(async (blob, i) => ({
        id: ids[i], mime: blob.type, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())),
      })));
      const json = JSON.stringify({ version: 1, state, recordings });
      if (new TextEncoder().encode(json).length > MAX_BACKUP_TEXT) throw new Error('Backup size exceeds 25 MB');
      parseBackup(json);
      return json;
    },
    async importData(json) {
      const backup = parseBackup(json);
      const recordings = backup.recordings.map(({ id, mime, data }) => ({ id, blob: new Blob([decodeBase64(data)], { type: mime }) }));
      await writeTransaction(db, ['state', 'recordings'], tx => {
        const stateStore = tx.objectStore('state');
        const recordingStore = tx.objectStore('recordings');
        stateStore.clear();
        recordingStore.clear();
        stateStore.put(backup.state, STATE_KEY);
        recordings.forEach(({ id, blob }) => recordingStore.put(blob, id));
      });
      return backup.state;
    },
    clear() {
      return writeTransaction(db, ['state', 'recordings'], tx => {
        tx.objectStore('state').clear();
        tx.objectStore('recordings').clear();
      });
    },
  };
}
