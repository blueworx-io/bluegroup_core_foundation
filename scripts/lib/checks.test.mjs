import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  versionBumped,
  changelogUpdated,
  approvedDeps,
  pluginVersionSync,
  pluginZip,
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
