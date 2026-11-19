import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageLockSync } from './checks.mjs';

const files = (entries) => new Map(Object.entries(entries));
const foundation = files({ 'blueworx-page-lock.php': 'a', 'Registry.php': 'b', 'v1/Lock.php': 'c', 'v1/page-lock.js': 'd' });

test('pageLockSync: a repo without a copy passes', () => {
  assert.equal(pageLockSync({ foundationFiles: foundation, copyFiles: null }).ok, true);
});

test('pageLockSync: an exact copy passes', () => {
  assert.equal(pageLockSync({ foundationFiles: foundation, copyFiles: new Map(foundation) }).ok, true);
});

test('pageLockSync: an edited file fails and is named', () => {
  const copy = new Map(foundation);
  copy.set('v1/Lock.php', 'edited');
  const r = pageLockSync({ foundationFiles: foundation, copyFiles: copy });
  assert.equal(r.ok, false);
  assert.match(r.message, /v1\/Lock\.php — differs/);
});

test('pageLockSync: a missing or extra file fails', () => {
  const copy = new Map(foundation);
  copy.delete('v1/page-lock.js');
  copy.set('v1/extra.php', 'x');
  const r = pageLockSync({ foundationFiles: foundation, copyFiles: copy });
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems, [
    'blueworx-page-lock/v1/extra.php — not part of the shared page lock; delete it',
    'blueworx-page-lock/v1/page-lock.js — missing',
  ]);
});

test('pageLockSync: a foundation ref without the lock passes', () => {
  assert.equal(pageLockSync({ foundationFiles: null, copyFiles: foundation }).ok, true);
});
