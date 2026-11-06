// One consent covers OpenAI (recommendations, highest-note lookups, my comfortable high), song search (TJ Media, then MusicBrainz),
// and the song screen (YouTube video search and lyric timing; lyric text is never kept).
// Version 2 added MusicBrainz and the comfortable high; version 3 added TJ Media search; version 4 the song screen;
// version 5 practice measurements sent for feedback (recordings never).
// Older consents are asked again once.
export const AI_CONSENT_VERSION = 5;

export function hasCurrentConsent(settings) {
  return Boolean(settings?.aiConsentAt) && settings.aiConsentVersion === AI_CONSENT_VERSION;
}

export function withConsent(settings, now = new Date()) {
  return { ...settings, aiConsentAt: now.toISOString(), aiConsentVersion: AI_CONSENT_VERSION };
}

export function withoutConsent(settings) {
  return { ...settings, aiConsentAt: null, aiConsentVersion: null };
}
