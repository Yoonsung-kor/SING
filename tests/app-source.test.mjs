// Checks on the app's source text for rules a unit test cannot reach (app.js needs a browser to run).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('every API call goes through the one client (invite code, device id, limits)', () => {
  assert.doesNotMatch(app, /fetch\(\s*['"`]\/api/);
  assert.match(app, /api\.request\(/);
});
