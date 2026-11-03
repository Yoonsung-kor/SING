import assert from 'node:assert/strict';
import test from 'node:test';
import { renderView } from '../src/views.js';
import { defaultState } from '../src/storage.js';

const historyWith = settings => renderView({ page: 'history', state: { ...defaultState(), settings: { ...defaultState().settings, ...settings } }, session: null, busy: false, demo: false });

test('the history page shows whether the consent is current, old, or missing', () => {
  assert.match(historyWith({ aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 3 }), /동의함 · [\s\S]*data-action="ai-consent-revoke"/);
  assert.match(historyWith({ aiConsentAt: '2026-11-03T01:00:00.000Z', aiConsentVersion: 2 }), /예전 동의/);
  assert.match(historyWith({ aiConsentAt: '2026-11-02T01:00:00.000Z', aiConsentVersion: 1 }), /예전 동의 · 다음에 AI를 쓸 때 다시 확인해요/);
  assert.match(historyWith({}), /동의 안 함/);
});
