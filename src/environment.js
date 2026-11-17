// Where the page is running: an app's built-in browser (KakaoTalk opens links in its own), the phone's platform,
// and whether it was opened from the home screen. Pure functions over what the browser reports.

/** 'kakaotalk', 'other' (another app's browser) or null (a normal browser). */
export function inAppBrowser(userAgent) {
  const ua = String(userAgent ?? '');
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  if (/NAVER\(inapp|Instagram|FBAN|FBAV| Line\//.test(ua)) return 'other';
  return null;
}

/** 'android', 'ios' or 'desktop'. An iPad asks for desktop pages and calls itself a Mac, but it has a touch screen. */
export function platform(userAgent, { maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent ?? '');
  if (/Android/.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

/** Opened from the home screen (an installed web app). */
export function isStandalone({ matchMedia, standalone } = {}) {
  try { if (matchMedia?.('(display-mode: standalone)')?.matches) return true; } catch { /* very old browsers */ }
  return standalone === true;
}

/** A link that asks the app to open this address in the phone's default browser, when the app has one. */
export function externalUrl(app, href) {
  return app === 'kakaotalk' ? `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}` : null;
}
