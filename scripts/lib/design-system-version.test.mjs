import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changedDesignSystemPaths,
  designSystemVersionBump,
  parseDesignSystemVersion,
} from './design-system-version.mjs';

const SKILL = '.claude/skills/blueworx-admin-design';

test('parses the version out of the registration call', () => {
  const php = "// comment\nblueworx_admin_design_register( '2.3.1', __FILE__ );\n";
  assert.equal(parseDesignSystemVersion(php), '2.3.1');
});

test('returns empty string when there is no registration call', () => {
  assert.equal(parseDesignSystemVersion('<?php // nothing here'), '');
});

test('changedDesignSystemPaths: catches the stylesheet', () => {
  const changed = [`${SKILL}/styles.css`, 'README.md'];
  assert.deepEqual(changedDesignSystemPaths(changed, SKILL), [`${SKILL}/styles.css`]);
});

test('changedDesignSystemPaths: catches the icon module', () => {
  const changed = [`${SKILL}/assets/icons/lucide-icons.js`];
  assert.deepEqual(changedDesignSystemPaths(changed, SKILL), [`${SKILL}/assets/icons/lucide-icons.js`]);
});

test('changedDesignSystemPaths: catches any file under fonts/', () => {
  const changed = [`${SKILL}/fonts/inter-400.woff2`, `${SKILL}/fonts/sora-700.woff2`];
  assert.deepEqual(changedDesignSystemPaths(changed, SKILL), changed);
});

test('changedDesignSystemPaths: ignores unrelated files, including ones elsewhere in the skill', () => {
  const changed = [`${SKILL}/readme.md`, `${SKILL}/components/core/Button.jsx`, 'scripts/check-design-system-version.mjs'];
  assert.deepEqual(changedDesignSystemPaths(changed, SKILL), []);
});

test('fails when a watched file changed and the version did not', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/styles.css`],
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /styles\.css/);
});

test('fails when the icon module changed and the version did not, and says so by name', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/assets/icons/lucide-icons.js`],
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /lucide-icons\.js/);
  assert.doesNotMatch(result.message, /styles\.css/);
});

test('fails when a font changed and the version did not, and says so by name', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/fonts/inter-400.woff2`],
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /inter-400\.woff2/);
});

test('passes when a watched file changed and the version went up', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/styles.css`],
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.0.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, true);
});

test('fails when the version went backwards', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/styles.css`],
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.2.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /backwards/);
});

test('passes when nothing watched changed', () => {
  const result = designSystemVersionBump({
    changedPaths: [],
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, true);
});

// The hole from round 1: baseVersion '' used to mean the same thing whether
// the registrar was brand new on this PR (fine) or the base version simply
// could not be read (dangerous — a real missed bump would pass silently).
// These three separate the causes.

test('passes when the registrar did not exist on the base at all — this is the PR that introduces it', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/styles.css`],
    baseRefExists: true,
    baseRegistrarExisted: false,
    baseVersion: '',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /first version/);
});

test('fails when the registrar existed on the base but its version could not be read — the actual hole', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/styles.css`],
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /could not read the version/);
});

test('fails when the base ref itself could not be resolved, naming the ref', () => {
  const result = designSystemVersionBump({
    changedPaths: [`${SKILL}/styles.css`],
    baseRefExists: false,
    baseRegistrarExisted: false,
    baseRef: 'origin/main',
    baseVersion: '',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /origin\/main/);
});
