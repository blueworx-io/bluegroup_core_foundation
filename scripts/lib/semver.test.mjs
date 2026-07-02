import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemver, compareSemver } from './semver.mjs';

test('parseSemver parses core versions and tolerates a leading v', () => {
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3, pre: null });
  assert.deepEqual(parseSemver('v0.10.0'), { major: 0, minor: 10, patch: 0, pre: null });
  assert.equal(parseSemver('1.2.3').pre, null);
  assert.equal(parseSemver('1.2.3-rc.1').pre, 'rc.1');
});

test('parseSemver returns null for junk', () => {
  assert.equal(parseSemver('not-a-version'), null);
  assert.equal(parseSemver('1.2'), null);
});

test('compareSemver orders by major/minor/patch', () => {
  assert.equal(compareSemver('1.2.3', '1.2.2'), 1);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.equal(compareSemver('1.2.3', '2.0.0'), -1);
  assert.equal(compareSemver('1.3.0', '1.2.9'), 1);
});

test('compareSemver: a release outranks its prerelease', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3-rc.1'), 1);
  assert.equal(compareSemver('1.2.3-rc.1', '1.2.3'), -1);
});

test('compareSemver orders prerelease identifiers', () => {
  assert.equal(compareSemver('1.2.3-rc.1', '1.2.3-rc.2'), -1);
  assert.equal(compareSemver('1.2.3-rc.2', '1.2.3-rc.10'), -1); // numeric, not lexical
  assert.equal(compareSemver('1.2.3-alpha', '1.2.3-beta'), -1);
});

test('compareSemver throws on invalid input', () => {
  assert.throws(() => compareSemver('1.2', '1.2.3'));
  assert.throws(() => compareSemver('x', 'y'));
});
