// One consent covers OpenAI (recommendations, highest-note lookups, my comfortable high) and MusicBrainz (song search).
// Version 2 added MusicBrainz and the comfortable high, so a version 1 consent is asked again once.
export const AI_CONSENT_VERSION = 2;

export function hasCurrentConsent(settings) {
  return Boolean(settings?.aiConsentAt) && settings.aiConsentVersion === AI_CONSENT_VERSION;
}

export function withConsent(settings, now = new Date()) {
  return { ...settings, aiConsentAt: now.toISOString(), aiConsentVersion: AI_CONSENT_VERSION };
}

export function withoutConsent(settings) {
  return { ...settings, aiConsentAt: null, aiConsentVersion: null };
}
