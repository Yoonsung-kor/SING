import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_CONSENT_VERSION, hasCurrentConsent, withConsent, withoutConsent } from '../src/consent.js';

const now = new Date('2026-11-03T01:00:00.000Z');

test('only a version 2 consent counts as current', () => {
  assert.equal(AI_CONSENT_VERSION, 2);
  assert.equal(hasCurrentConsent({ aiConsentAt: null, aiConsentVersion: null }), false);
  assert.equal(hasCurrentConsent({ aiConsentAt: '2026-11-02T01:00:00.000Z', aiConsentVersion: 1 }), false);
  const given = withConsent({ keepAudio: true, aiConsentAt: null, aiConsentVersion: null }, now);
  assert.deepEqual(given, { keepAudio: true, aiConsentAt: now.toISOString(), aiConsentVersion: 2 });
  assert.equal(hasCurrentConsent(given), true);
  assert.deepEqual(withoutConsent(given), { keepAudio: true, aiConsentAt: null, aiConsentVersion: null });
});
