#!/usr/bin/env node
// Decides how many runners the Playwright suite is split across (#89), run by
// ci-wordpress.yml's `prep` job from the project's checkout.
//
// SHARDS is the workflow's `shards` input: a number the project set is used as
// it is; 0 or unset sizes the split from how many tests the project's spec
// files declare (see lib/shards.mjs). LOCAL_WORDPRESS is 'true' when the suite
// runs on a per-runner WordPress — only then is a suite split automatically.
//
// Writes `count` and the matrix's `shards` array to GITHUB_OUTPUT.

import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countTests, planShards } from './lib/shards.mjs';

const SKIP = new Set(['node_modules', 'vendor', '.git', '.wp-test', '.foundation', 'test-results', 'playwright-report']);
const SPEC = /\.spec\.(js|mjs|cjs|ts|mts|cts)$/;

/** Every spec file under a directory. */
function specs(dir) {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) {
        found.push(...specs(join(dir, entry.name)));
      }
    } else if (SPEC.test(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }

  return found;
}

const files = specs(process.cwd());
const tests = files.reduce((sum, file) => sum + countTests(readFileSync(file, 'utf8')), 0);
const local = 'true' === process.env.LOCAL_WORDPRESS;

let count;

try {
  count = planShards({ asked: process.env.SHARDS ?? '', tests, local });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const asked = Number(process.env.SHARDS || 0);
const why = asked > 0 ? 'as the project set it' : local ? `sized from ${tests} test(s) in ${files.length} spec file(s)` : 'a shared preview site is never split';

console.log(`Running the Playwright suite across ${count} shard(s), ${why}.`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${count}\nshards=[${Array.from({ length: count }, (_, i) => i + 1).join(',')}]\n`);
}
