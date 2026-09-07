import test from 'node:test';
import assert from 'node:assert/strict';
import { designSystemVersionBump, parseDesignSystemVersion } from './design-system-version.mjs';

test('parses the version out of the registration call', () => {
  const php = "// comment\nblueworx_admin_design_register( '2.3.1', __FILE__ );\n";
  assert.equal(parseDesignSystemVersion(php), '2.3.1');
});

test('returns empty string when there is no registration call', () => {
  assert.equal(parseDesignSystemVersion('<?php // nothing here'), '');
});

test('fails when styles.css changed and the version did not', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /styles\.css/);
});

test('passes when styles.css changed and the version went up', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.0.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, true);
});

test('fails when the version went backwards', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseRefExists: true,
    baseRegistrarExisted: true,
    baseVersion: '1.2.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /backwards/);
});

test('passes when styles.css did not change', () => {
  const result = designSystemVersionBump({
    styleChanged: false,
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
    styleChanged: true,
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
    styleChanged: true,
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
    styleChanged: true,
    baseRefExists: false,
    baseRegistrarExisted: false,
    baseRef: 'origin/main',
    baseVersion: '',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /origin\/main/);
});
