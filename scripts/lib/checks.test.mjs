import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  versionBumped,
  changelogUpdated,
  approvedDeps,
  pluginVersionSync,
  pluginZip,
  releaseTag,
  testsExecuted,
  testsExecutedAcross,
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

test('releaseTag: passes when the tag matches the header, with or without a leading v', () => {
  const args = { headerVersion: '1.2.0', pluginFile: 'my-plugin.php' };
  assert.equal(releaseTag({ ...args, tag: 'v1.2.0' }).ok, true);
  assert.equal(releaseTag({ ...args, tag: '1.2.0' }).ok, true);
});

test('releaseTag: fails when the tag and header disagree', () => {
  const result = releaseTag({ tag: 'v1.2.0', headerVersion: '1.1.0', pluginFile: 'my-plugin.php' });
  assert.equal(result.ok, false);
  assert.match(result.message, /1\.2\.0/);
  assert.match(result.message, /1\.1\.0/);
});

test('releaseTag: fails when the plugin file or Version header is missing', () => {
  assert.equal(releaseTag({ tag: 'v1.2.0', headerVersion: '1.2.0', pluginFile: null }).ok, false);
  assert.equal(releaseTag({ tag: 'v1.2.0', headerVersion: null, pluginFile: 'my-plugin.php' }).ok, false);
});

test('releaseTag: fails on a non-semver tag or header', () => {
  assert.equal(releaseTag({ tag: 'release-2', headerVersion: '1.2.0', pluginFile: 'my-plugin.php' }).ok, false);
  assert.equal(releaseTag({ tag: 'v1.2.0', headerVersion: '1.2', pluginFile: 'my-plugin.php' }).ok, false);
});

test('releaseTag: fails when no tag was supplied', () => {
  assert.equal(releaseTag({ tag: '', headerVersion: '1.2.0', pluginFile: 'my-plugin.php' }).ok, false);
});

test('releaseTag: matches prerelease tags exactly', () => {
  const args = { headerVersion: '1.2.0-beta.1', pluginFile: 'my-plugin.php' };
  assert.equal(releaseTag({ ...args, tag: 'v1.2.0-beta.1' }).ok, true);
  assert.equal(releaseTag({ ...args, tag: 'v1.2.0' }).ok, false);
});

// Sharding splits one suite across N runners, so the gate has to be applied to
// the sum. Any single shard legitimately executing nothing is not a failure —
// every shard executing nothing is exactly the failure this check exists for.
test('testsExecutedAcross: sums executed counts over shards', () => {
  const reports = [
    { stats: { expected: 40, unexpected: 0, flaky: 0, skipped: 1 } },
    { stats: { expected: 44, unexpected: 1, flaky: 0, skipped: 0 } },
    { stats: { expected: 45, unexpected: 0, flaky: 2, skipped: 1 } },
  ];
  const result = testsExecutedAcross({ reports });
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { executed: 132, skipped: 2, total: 134 });
});

test('testsExecutedAcross: one empty shard is fine when another ran', () => {
  const reports = [
    { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 } },
    { stats: { expected: 7, unexpected: 0, flaky: 0, skipped: 0 } },
  ];
  assert.equal(testsExecutedAcross({ reports }).ok, true);
});

test('testsExecutedAcross: fails when every shard skipped everything', () => {
  const reports = [
    { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 4 } },
    { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 5 } },
  ];
  const result = testsExecutedAcross({ reports });
  assert.equal(result.ok, false);
  assert.match(result.message, /Every test skipped/);
});

test('testsExecutedAcross: fails when no reports were collected at all', () => {
  const result = testsExecutedAcross({ reports: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /No Playwright JSON report/);
});

test('testsExecutedAcross: a single report behaves exactly like testsExecuted', () => {
  const report = { stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 } };
  assert.deepEqual(
    testsExecutedAcross({ reports: [report] }).counts,
    testsExecuted({ report }).counts,
  );
});
