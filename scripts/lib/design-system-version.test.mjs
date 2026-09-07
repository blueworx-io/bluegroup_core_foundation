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
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /styles\.css/);
});

test('passes when styles.css changed and the version went up', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseVersion: '1.0.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, true);
});

test('fails when the version went backwards', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
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
