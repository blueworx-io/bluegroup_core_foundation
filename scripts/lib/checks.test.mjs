import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  versionBumped,
  changelogUpdated,
  approvedDeps,
  pluginVersionSync,
  pluginZip,
  testsExecuted,
} from './checks.mjs';

test('versionBumped: passes on first build (no base)', () => {
  assert.equal(versionBumped({ current: '1.0.0', base: null }).ok, true);
});

test('versionBumped: passes when strictly greater, fails otherwise', () => {
  assert.equal(versionBumped({ current: '1.0.1', base: '1.0.0' }).ok, true);
  assert.equal(versionBumped({ current: '1.0.0', base: '1.0.0' }).ok, false);
  assert.equal(versionBumped({ current: '1.0.0', base: '1.0.1' }).ok, false);
});

test('changelogUpdated: passes only when the changelog is in the diff', () => {
  assert.equal(
    changelogUpdated({ changedFiles: ['src/a.js', 'CHANGELOG.md'], changelogPath: 'CHANGELOG.md' }).ok,
    true,
  );
  assert.equal(
    changelogUpdated({ changedFiles: ['src/a.js'], changelogPath: 'CHANGELOG.md' }).ok,
    false,
  );
});

test('approvedDeps: flags deps not on the allow-list', () => {
  const pkg = { dependencies: { react: '^18' }, devDependencies: { vitest: '^1' } };
  const empty = approvedDeps({ pkg, approved: { dependencies: {}, devDependencies: {} } });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.offenders.sort(), ['dependencies: react', 'devDependencies: vitest']);
});

test('approvedDeps: accepts object and array allow-list forms', () => {
  const pkg = { dependencies: { react: '^18' }, devDependencies: {} };
  assert.equal(approvedDeps({ pkg, approved: { dependencies: { react: '*' } } }).ok, true);
  assert.equal(approvedDeps({ pkg, approved: { dependencies: ['react'] } }).ok, true);
});

test('pluginVersionSync: null package version passes; else must match', () => {
  assert.equal(pluginVersionSync({ headerVersion: '2.0.0', pkgVersion: null }).ok, true);
  assert.equal(pluginVersionSync({ headerVersion: '2.0.0', pkgVersion: '2.0.0' }).ok, true);
  assert.equal(pluginVersionSync({ headerVersion: '2.0.0', pkgVersion: '1.9.0' }).ok, false);
});

test('pluginZip: passes for 0 or 1 matching zip, fails for more', () => {
  assert.equal(pluginZip({ zipFiles: [], slug: 'my-plugin' }).ok, true);
  assert.equal(pluginZip({ zipFiles: ['my-plugin.zip'], slug: 'my-plugin' }).ok, true);
  assert.equal(
    pluginZip({ zipFiles: ['my-plugin.zip', 'my-plugin-1.0.0.zip'], slug: 'my-plugin' }).ok,
    false,
  );
});

test('testsExecuted: passes when tests ran, from the stats block', () => {
  const report = { stats: { expected: 12, unexpected: 0, flaky: 0, skipped: 0 } };
  const result = testsExecuted({ report });
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { executed: 12, skipped: 0, total: 12 });
});

test('testsExecuted: a failing run still counts as executed', () => {
  // This check is about whether anything ran, not whether it passed —
  // Playwright's own exit code handles failures.
  const report = { stats: { expected: 3, unexpected: 2, flaky: 1, skipped: 0 } };
  const result = testsExecuted({ report });
  assert.equal(result.ok, true);
  assert.equal(result.counts.executed, 6);
});

test('testsExecuted: fails when every test skipped', () => {
  const report = { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 9 } };
  const result = testsExecuted({ report });
  assert.equal(result.ok, false);
  assert.match(result.message, /Every test skipped/);
});

test('testsExecuted: fails on an empty report', () => {
  assert.equal(testsExecuted({ report: {} }).ok, false);
  assert.equal(testsExecuted({ report: { suites: [] } }).ok, false);
  assert.equal(testsExecuted({ report: null }).ok, false);
});

test('testsExecuted: some executed alongside skips still passes', () => {
  const report = { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 20 } };
  const result = testsExecuted({ report });
  assert.equal(result.ok, true);
  assert.match(result.message, /20 skipped/);
});

test('testsExecuted: walks the suite tree when stats are absent', () => {
  const report = {
    suites: [
      {
        specs: [{ tests: [{ results: [{ status: 'passed' }] }] }],
        suites: [
          { specs: [{ tests: [{ results: [{ status: 'skipped' }] }] }] },
        ],
      },
    ],
  };
  const result = testsExecuted({ report });
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { executed: 1, skipped: 1, total: 2 });
});

test('testsExecuted: nested all-skipped suite tree fails', () => {
  const report = {
    suites: [
      { suites: [{ specs: [{ tests: [{ results: [{ status: 'skipped' }] }] }] }] },
    ],
  };
  assert.equal(testsExecuted({ report }).ok, false);
});

test('testsExecuted: tolerates malformed stats values', () => {
  const report = { stats: { expected: null, unexpected: undefined, skipped: 'nope' } };
  const result = testsExecuted({ report });
  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { executed: 0, skipped: 0, total: 0 });
});
