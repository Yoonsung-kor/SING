// These are prototype interaction limits, not clinical or physiological thresholds.
export const LIMITS = Object.freeze({ attempts: 8, retries: 2, targetCents: 50, maxMidi: 83 });

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekDays(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    return localDay(day);
  });
}

export function createLesson(now = new Date(), startingMidi = null) {
  const targetMidi = Number.isInteger(startingMidi) && startingMidi >= 37 && startingMidi <= LIMITS.maxMidi ? startingMidi : null;
  return {
    id: crypto.randomUUID(), startedAt: now.toISOString(), day: localDay(now),
    status: 'exploring', phase: targetMidi === null ? 'start' : 'confirm', targetMidi, attempts: [],
    retryCount: 0, stopReason: null,
  };
}

export function finishLesson(session, reason = 'user') {
  if (session.status === 'finished') return session;
  return { ...session, status: 'finished', phase: 'result', stopReason: reason };
}

export function recordAttempt(session, measurement, comfort, now = new Date()) {
  if (session.status !== 'exploring') return session;
  if (!['comfortable', 'effort', 'unsure', 'pain'].includes(comfort)) throw new Error('체감 응답을 선택해 주세요.');
  const reliable = measurement?.reliable === true && Number.isInteger(measurement.midi)
    && measurement.midi >= 0 && measurement.midi <= 127 && Number.isFinite(measurement.cents);
  const matched = reliable && (session.targetMidi === null
    || Math.abs((measurement.midi - session.targetMidi) * 100 + measurement.cents) <= LIMITS.targetCents);
  const verified = matched && comfort === 'comfortable';
  const attempt = {
    id: crypto.randomUUID(), createdAt: now.toISOString(), targetMidi: session.targetMidi,
    midi: reliable ? measurement.midi : null, cents: reliable ? measurement.cents : null,
    reliable, verified, comfort, reason: measurement?.reason || (reliable ? 'stable' : 'unconfirmed'),
    recordingId: measurement?.recordingId || null,
  };
  let next = { ...session, attempts: [...session.attempts, attempt] };
  if (comfort !== 'comfortable') return finishLesson(next, comfort);
  if (next.attempts.length >= LIMITS.attempts) return finishLesson(next, 'session-limit');
  if (!verified) {
    if (session.retryCount >= LIMITS.retries) return finishLesson(next, 'measurement');
    return { ...next, phase: 'retry', retryCount: session.retryCount + 1 };
  }
  if (session.targetMidi === null) return { ...next, targetMidi: attempt.midi, phase: 'confirm', retryCount: 0 };
  return { ...next, phase: summarizeLesson(next).repeated.length ? 'ready' : 'confirm', retryCount: 0 };
}

export function nextTarget(session) {
  if (session.status !== 'exploring' || session.phase !== 'ready') return session;
  if (session.targetMidi >= LIMITS.maxMidi) return finishLesson(session, 'measurement-range');
  return { ...session, targetMidi: session.targetMidi + 1, phase: 'capture', retryCount: 0 };
}

export function summarizeLesson(session) {
  const counts = new Map();
  for (const attempt of session.attempts) {
    if (attempt.verified === true && attempt.reliable && attempt.comfort === 'comfortable' && Number.isInteger(attempt.midi)) {
      counts.set(attempt.midi, (counts.get(attempt.midi) || 0) + 1);
    }
  }
  const notes = [...counts.keys()].sort((a, b) => a - b);
  return {
    notes, repeated: notes.filter(note => counts.get(note) >= 2),
    highest: notes.at(-1) ?? null, first: notes[0] ?? null,
    unconfirmed: session.attempts.filter(attempt => !attempt.verified).length,
  };
}

export function recommendedNote(session) {
  if (session.stopReason === 'pain') return null;
  return summarizeLesson(session).repeated[0] ?? null;
}

export function needsDailyCheck(session, now = new Date()) {
  return session.day !== localDay(now);
}

export function addActivity(state, type, sessionId, now = new Date()) {
  const day = localDay(now);
  const alreadyRecorded = state.activities.some(a => a.type === type
    && (type === 'practice' ? a.sessionId === sessionId : a.day === day));
  if (alreadyRecorded) return state;
  const activity = { id: crypto.randomUUID(), type, day, createdAt: now.toISOString() };
  if (sessionId) activity.sessionId = sessionId;
  return { ...state, activities: [...state.activities, activity] };
}
