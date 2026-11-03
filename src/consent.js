// One consent covers OpenAI (recommendations, highest-note lookups, my comfortable high) and song search (TJ Media, then MusicBrainz).
// Version 2 added MusicBrainz and the comfortable high; version 3 added TJ Media search. Older consents are asked again once.
export const AI_CONSENT_VERSION = 3;

export function hasCurrentConsent(settings) {
  return Boolean(settings?.aiConsentAt) && settings.aiConsentVersion === AI_CONSENT_VERSION;
}

export function withConsent(settings, now = new Date()) {
  return { ...settings, aiConsentAt: now.toISOString(), aiConsentVersion: AI_CONSENT_VERSION };
}

export function withoutConsent(settings) {
  return { ...settings, aiConsentAt: null, aiConsentVersion: null };
}
