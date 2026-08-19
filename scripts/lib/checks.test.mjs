import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  versionBumped,
  changelogUpdated,
  approvedDeps,
  pluginVersionSync,
  pluginZip,
  netlifyPreview,
  pluginZipContent,
  releaseTag,
  testsExecuted,
  testsExecutedAcross,
  designSystemSync,
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

test('changelogUpdated: a fragment under the fragment dir satisfies the check', () => {
  assert.equal(
    changelogUpdated({
      changedFiles: ['src/a.js', 'changelog.d/add-thing.md'],
      changelogPath: 'CHANGELOG.md',
      changelogDir: 'changelog.d',
    }).ok,
    true,
  );
});

test('changelogUpdated: editing CHANGELOG.md still passes when a fragment dir is configured', () => {
  assert.equal(
    changelogUpdated({
      changedFiles: ['CHANGELOG.md'],
      changelogPath: 'CHANGELOG.md',
      changelogDir: 'changelog.d',
    }).ok,
    true,
  );
});

test('changelogUpdated: fails when neither shape is present', () => {
  const result = changelogUpdated({
    changedFiles: ['src/a.js'],
    changelogPath: 'CHANGELOG.md',
    changelogDir: 'changelog.d',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /changelog\.d\//);
  assert.match(result.message, /CHANGELOG\.md/);
});

test('changelogUpdated: the fragment dir README does not count as an entry', () => {
  assert.equal(
    changelogUpdated({
      changedFiles: ['changelog.d/README.md'],
      changelogPath: 'CHANGELOG.md',
      changelogDir: 'changelog.d',
    }).ok,
    false,
  );
});

test('changelogUpdated: no fragment dir configured means fragments do not count', () => {
  assert.equal(
    changelogUpdated({ changedFiles: ['changelog.d/add-thing.md'], changelogPath: 'CHANGELOG.md' }).ok,
    false,
  );
  assert.equal(
    changelogUpdated({
      changedFiles: ['changelog.d/add-thing.md'],
      changelogPath: 'CHANGELOG.md',
      changelogDir: '',
    }).ok,
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

const preview = (state, updated_at, target_url = 'https://deploy-preview-7--site.netlify.app') => ({
  context: 'netlify/site/deploy-preview',
  state,
  updated_at,
  target_url,
});

test('netlifyPreview: no Netlify status is pending, not failed', () => {
  // Every PR has a window before Netlify posts anything. Failing there would
  // fail every PR in that window.
  const result = netlifyPreview({ statuses: [{ context: 'ci/other', state: 'success' }] });
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
});

test('netlifyPreview: passes on success and hands back the preview URL', () => {
  const result = netlifyPreview({ statuses: [preview('success', '2026-08-01T10:00:00Z')] });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://deploy-preview-7--site.netlify.app');
});

test('netlifyPreview: reads the latest status per context, not the first', () => {
  // GitHub keeps every status ever posted, so pending-then-success appears twice.
  const statuses = [preview('pending', '2026-08-01T10:00:00Z'), preview('success', '2026-08-01T10:04:00Z')];
  assert.equal(netlifyPreview({ statuses }).ok, true);
  assert.equal(netlifyPreview({ statuses: [...statuses].reverse() }).ok, true);

  // …and a success later superseded by a failure is a failure.
  const regressed = [preview('success', '2026-08-01T10:00:00Z'), preview('failure', '2026-08-01T10:06:00Z')];
  const result = netlifyPreview({ statuses: regressed });
  assert.equal(result.ok, false);
  assert.equal(result.pending, false);
});

test('netlifyPreview: a failed or errored deploy fails outright, never pends', () => {
  for (const state of ['failure', 'error']) {
    const result = netlifyPreview({ statuses: [preview(state, '2026-08-01T10:00:00Z')] });
    assert.equal(result.ok, false);
    assert.equal(result.pending, false);
  }
});

test('netlifyPreview: one context still building keeps the whole thing pending', () => {
  const statuses = [
    preview('success', '2026-08-01T10:00:00Z'),
    { context: 'netlify/site/deploy-preview-headers', state: 'pending', updated_at: '2026-08-01T10:01:00Z' },
  ];
  const result = netlifyPreview({ statuses });
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
});

const shippable = [
  'my-plugin/my-plugin.php',
  'my-plugin/uninstall.php',
  'my-plugin/readme.txt',
  'my-plugin/CHANGELOG.md',
  'my-plugin/includes/admin.php',
  'my-plugin/assets/app.js',
  'my-plugin/plugin-update-checker/plugin-update-checker.php',
];

test('pluginZipContent: passes a clean tree', () => {
  const result = pluginZipContent({ entries: shippable, slug: 'my-plugin' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.offenders, []);
});

test('pluginZipContent: fails an empty tree rather than calling it clean', () => {
  assert.equal(pluginZipContent({ entries: [], slug: 'my-plugin' }).ok, false);
});

test('pluginZipContent: catches a forbidden directory nested inside a shipped one', () => {
  // The case a top-level exclude cannot see, and the reason this check exists.
  const result = pluginZipContent({
    entries: [...shippable, 'my-plugin/includes/preview/index.php'],
    slug: 'my-plugin',
  });
  assert.equal(result.ok, false);
  assert.match(result.offenders.join('\n'), /includes\/preview\/index\.php/);
});

test('pluginZipContent: catches forbidden files by basename glob', () => {
  for (const entry of [
    'my-plugin/composer.json',
    'my-plugin/CLAUDE.md',
    'my-plugin/includes/thing.spec.js',
    'my-plugin/assets/deploy.pem',
    'my-plugin/my-plugin.zip',
    'my-plugin/includes/.env.local',
  ]) {
    const result = pluginZipContent({ entries: [...shippable, entry], slug: 'my-plugin' });
    assert.equal(result.ok, false, `${entry} should not be shippable`);
  }
});

test('pluginZipContent: fails entries that escape the slug directory', () => {
  const result = pluginZipContent({ entries: [...shippable, 'stray.php'], slug: 'my-plugin' });
  assert.equal(result.ok, false);
  assert.match(result.offenders.join('\n'), /outside my-plugin\//);
});

test('pluginZipContent: a shipped name that merely contains a forbidden word is fine', () => {
  const result = pluginZipContent({
    entries: [...shippable, 'my-plugin/includes/preview-card.php', 'my-plugin/assets/tests-page.css'],
    slug: 'my-plugin',
  });
  assert.equal(result.ok, true);
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

const CSS = 'assets/blueworx-admin-design.css';

// Small helper so the cases below read as intent, not as Map plumbing.
const tree = (obj) => new Map(Object.entries(obj));
const inSync = {
  foundationFiles: tree({ 'SKILL.md': 'a', 'styles.css': 'b' }),
  pluginFiles: tree({ 'SKILL.md': 'a', 'styles.css': 'b' }),
  canonicalCss: 'b',
  shippedCss: 'b',
};

test('designSystemSync: passes when the foundation has no design system yet', () => {
  const r = designSystemSync({ ...inSync, foundationFiles: null });
  assert.equal(r.ok, true);
  assert.match(r.message, /not in the foundation yet/);
});

test('designSystemSync: passes when the plugin has not adopted it', () => {
  const r = designSystemSync({ ...inSync, pluginFiles: null });
  assert.equal(r.ok, true);
  assert.match(r.message, /not adopted/);
});

test('designSystemSync: passes when both copies and the shipped CSS match', () => {
  const r = designSystemSync(inSync);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('designSystemSync: fails when a file differs', () => {
  const r = designSystemSync({
    ...inSync,
    pluginFiles: tree({ 'SKILL.md': 'CHANGED', 'styles.css': 'b' }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /SKILL\.md/);
  assert.match(r.problems[0], /differs/);
});

test('designSystemSync: fails when the plugin is missing a file', () => {
  const r = designSystemSync({ ...inSync, pluginFiles: tree({ 'SKILL.md': 'a' }) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /styles\.css — missing from this plugin/);
});

test('designSystemSync: fails on a file the design system does not have', () => {
  const r = designSystemSync({
    ...inSync,
    pluginFiles: tree({ 'SKILL.md': 'a', 'styles.css': 'b', 'local-hack.md': 'x' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /local-hack\.md/);
});

test('designSystemSync: fails when the shipped stylesheet is missing', () => {
  const r = designSystemSync({ ...inSync, shippedCss: null });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /assets\/blueworx-admin-design\.css — missing/);
});

test('designSystemSync: fails when the shipped stylesheet is stale', () => {
  const r = designSystemSync({ ...inSync, shippedCss: 'OLD' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /differs from/);
});

test('designSystemSync: failure message names the files and the fix', () => {
  const r = designSystemSync({ ...inSync, shippedCss: 'OLD' });
  assert.ok(r.message.includes(CSS));
  assert.match(r.message, /curl/);
  assert.match(r.message, /cp .*styles\.css/);
});

test('designSystemSync: reports every problem, not just the first', () => {
  const r = designSystemSync({
    ...inSync,
    pluginFiles: tree({ 'SKILL.md': 'CHANGED' }),
    shippedCss: 'OLD',
  });
  assert.equal(r.problems.length, 3);
});
