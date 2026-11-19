#!/usr/bin/env node
// WordPress: fails if a theme's or plugin's copy of the shared page lock
// (blueworx-page-lock/) differs from the foundation's page-lock/. CI already
// fetches the foundation to FOUNDATION_DIR, so this is a local comparison.
//
// PAGE_LOCK_SYNC=warn reports a difference without failing; off skips it.

import { join } from 'node:path';
import { hashTree } from './lib/io.mjs';
import { pageLockSync } from './lib/checks.mjs';

const mode = process.env.PAGE_LOCK_SYNC || 'error';
if (mode === 'off') {
  console.log('Page lock sync: skipped (PAGE_LOCK_SYNC=off).');
  process.exit(0);
}

const foundationDir = process.env.FOUNDATION_DIR || '.foundation';
const copyPath = process.env.PAGE_LOCK_PATH || 'blueworx-page-lock';

const result = pageLockSync({
  foundationFiles: hashTree(join(foundationDir, 'page-lock')),
  copyFiles: hashTree(copyPath),
  copyPath,
  foundationRef: process.env.FOUNDATION_REF || 'main',
});

console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nPAGE_LOCK_SYNC=warn — reporting this as a warning, not a failure.');
  process.exit(0);
}
process.exit(1);
