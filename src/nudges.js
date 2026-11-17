// Home-screen reminders, one at a time: answer the survey, add the app to the home screen, keep a backup.
// Pure: the app passes today, the time and what it knows about the browser.
const DAY_MS = 86400000;
const REMIND_MS = 14 * DAY_MS;

const finishedHums = state => state.sessions.filter(session => session.status === 'finished').length;

/** What the friend did, for the survey: "허밍 3회 · 곡 5개 · 플레이리스트 2개" (and whether a range is set). */
export function usageSummary(state) {
  const parts = [`허밍 ${finishedHums(state)}회`, `곡 ${state.songs.length}개`, `플레이리스트 ${state.playlists.length}개`];
  if (state.settings?.voice) parts.push('내 음역 설정함');
  return parts.join(' · ');
}

/** The survey address with the summary filled in where the form's prefilled link put __USAGE__. */
export function feedbackLink(template, summary) {
  if (!template) return null;
  return template.split('__USAGE__').join(encodeURIComponent(summary));
}

const longAgo = (iso, now) => !iso || now - Date.parse(iso) >= REMIND_MS;

/** 'feedback', 'install', 'backup' or null: the one card home shows. */
export function nextNudge(state, { today, now, standalone = false, hasFeedbackUrl = false }) {
  const settings = state.settings ?? {};
  const hums = finishedHums(state);
  const songs = state.songs.length;
  const days = new Set([...(settings.openDays ?? []), today]).size;
  if (hasFeedbackUrl && !settings.feedbackAt && !settings.feedbackNudgeAt && (days >= 2 || (hums >= 1 && songs >= 1))) return 'feedback';
  if (!standalone && !settings.installNudgeAt) return 'install';
  if ((hums >= 2 || songs >= 3) && longAgo(settings.lastBackupAt, now) && longAgo(settings.backupNudgeAt, now)) return 'backup';
  return null;
}
