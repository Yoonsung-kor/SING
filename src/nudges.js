// Home-screen reminders, one at a time: answer the survey, add the app to the home screen, keep a backup.
// Pure: the app passes today, the time and what it knows about the browser.
const DAY_MS = 86400000;
const REMIND_MS = 14 * DAY_MS;

const finishedHums = state => state.sessions.filter(session => session.status === 'finished').length;

// An iPhone's home-screen app keeps its own storage apart from Safari: the invite code and the records do not follow.
const INSTALL_HELP = Object.freeze({
  ios: '공유 버튼(네모 위로 화살표)을 누르고 ‘홈 화면에 추가’를 골라 주세요. 사파리는 화면 아래쪽(안 보이면 ⋯ 버튼 안), 크롬은 주소창 오른쪽에 있어요. 아이폰의 홈 화면 앱은 사파리와 저장 공간이 따로라서, 처음 열 때 초대 코드를 한 번 더 물어요. 카톡으로 받은 초대 링크를 그대로 붙여 넣으면 돼요. 지금까지의 기록은 ‘나의 기록 → 기록 백업’으로 옮길 수 있어요.',
  other: '브라우저 메뉴(⋮)에서 ‘홈 화면에 추가’를 골라 주세요.',
});

/** How to add the app to the home screen when the browser offers no prompt of its own. */
export const installHelp = platformName => (platformName === 'ios' ? INSTALL_HELP.ios : INSTALL_HELP.other);

/** What the friend did, for the survey: "허밍 3회 · 곡 5개 · 플레이리스트 2개" (whether a range is set, and the phone's tag). */
export function usageSummary(state, tag = '') {
  const parts = [`허밍 ${finishedHums(state)}회`, `곡 ${state.songs.length}개`, `플레이리스트 ${state.playlists.length}개`];
  if (state.settings?.voice) parts.push('내 음역 설정함');
  if (tag) parts.push(`기기 ${tag}`);
  return parts.join(' · ');
}

/** Four hex characters for the survey, so answers from different phones can be told apart without a name or an
 * e-mail. A hash of the random device number: it cannot be turned back into the number, and the server never sees it. */
export async function deviceTag(deviceId) {
  if (!deviceId) return '';
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sing-survey:${deviceId}`)));
  return [...bytes.slice(0, 2)].map(byte => byte.toString(16).padStart(2, '0')).join('');
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
