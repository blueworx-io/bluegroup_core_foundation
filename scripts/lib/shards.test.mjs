import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countTests, planShards, TESTS_PER_SHARD, MOST_SHARDS } from './shards.mjs';

test('countTests: counts each test, whatever its modifier, and nothing else', () => {
  const source = [
    "test('one', async () => {});",
    "  test.slow('two', async () => {});",
    'test.skip(`three`, () => {});',
    'test("four", () => {});',
    "test.describe('a group', () => {});",
    "test.beforeAll(async () => {});",
    "  // test('commented out') is still counted, which is close enough",
    "const x = attest('no');",
  ].join('\n');

  assert.equal(countTests(source), 5);
});

test('planShards: a number the project set is kept as it is', () => {
  assert.equal(planShards({ asked: '3', tests: 2000, local: true }), 3);
  assert.equal(planShards({ asked: '1', tests: 2000, local: true }), 1);
});

test('planShards: unset or 0 sizes the split from the suite', () => {
  assert.equal(planShards({ asked: '', tests: 40, local: true }), 1);
  assert.equal(planShards({ asked: '0', tests: TESTS_PER_SHARD, local: true }), 1);
  assert.equal(planShards({ asked: '0', tests: TESTS_PER_SHARD + 1, local: true }), 2);
  assert.equal(planShards({ asked: '0', tests: 773, local: true }), 6);
  assert.equal(planShards({ asked: '0', tests: 5000, local: true }), MOST_SHARDS);
  assert.equal(planShards({ asked: '0', tests: 0, local: true }), 1);
});

test('planShards: a shared preview site is never split automatically', () => {
  assert.equal(planShards({ asked: '0', tests: 773, local: false }), 1);
});

test('planShards: anything but a whole number is refused', () => {
  assert.throws(() => planShards({ asked: 'four', tests: 10, local: true }), /whole number/);
  assert.throws(() => planShards({ asked: '-1', tests: 10, local: true }), /whole number/);
});
