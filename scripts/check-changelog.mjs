#!/usr/bin/env node
// Fails if this PR records no changelog entry (relative to the base branch).
// An entry is either CHANGELOG.md in the diff, or — when CHANGELOG_DIR is set —
// a file added under that directory. Missing BASE_REF ⇒ skip. If the diff can't
// be computed, require CHANGELOG.md to exist.

import { existsSync } from 'node:fs';
import { gitChangedFiles } from './lib/io.mjs';
import { changelogUpdated } from './lib/checks.mjs';

const baseRef = process.env.BASE_REF;
const changelogPath = process.env.CHANGELOG_PATH || 'CHANGELOG.md';
// Optional per-change fragment directory. Empty means the old rule only.
const changelogDir = process.env.CHANGELOG_DIR || '';

if (!baseRef) {
  console.log('No BASE_REF set — changelog check skipped (not a PR context).');
  process.exit(0);
}

const changedFiles = gitChangedFiles(baseRef);
if (changedFiles === null) {
  if (existsSync(changelogPath)) {
    console.log(`${changelogPath} exists (no base branch available to diff against).`);
    process.exit(0);
  }
  console.error(`${changelogPath} not found and no base branch available to diff against.`);
  process.exit(1);
}

const result = changelogUpdated({ changedFiles, changelogPath, changelogDir });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
