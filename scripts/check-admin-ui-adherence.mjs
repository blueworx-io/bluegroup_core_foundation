#!/usr/bin/env node
// WordPress: fails if an admin screen this PR touches is not built from the
// shared blueworx-admin-design system. The rules are read out of the design
// system the plugin already carries, so they never go stale.
//
// Only the diff is judged — a plugin adopts the system screen by screen, and an
// untouched legacy screen is left alone until somebody works on it.
//
// ADMIN_UI_ADHERENCE=warn downgrades a failure to a printed warning (for a
// plugin catching up mid-feature); off skips it.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitChangedFiles, readJson, readTextFiles } from './lib/io.mjs';
import { vocabulary } from './lib/design-system.mjs';
import { adminAssetPaths } from './lib/admin-ui.mjs';
import { adminUiAdherence } from './lib/checks.mjs';

const mode = process.env.ADMIN_UI_ADHERENCE || 'error';
if (mode === 'off') {
  console.log('Admin UI adherence: skipped (ADMIN_UI_ADHERENCE=off).');
  process.exit(0);
}

const baseRef = process.env.BASE_REF;
if (!baseRef) {
  console.log('No BASE_REF set — admin UI adherence check skipped (not a PR context).');
  process.exit(0);
}

const skillPath = process.env.SKILL_PATH || '.claude/skills/blueworx-admin-design';
const cssFile = join(skillPath, 'styles.css');
const readmeFile = join(skillPath, 'readme.md');
const vocab = existsSync(cssFile)
  ? vocabulary({
      css: readFileSync(cssFile, 'utf8'),
      manifest: readJson(join(skillPath, '_ds_manifest.json')),
      markup: existsSync(readmeFile) ? readFileSync(readmeFile, 'utf8') : '',
    })
  : null;

const changed = gitChangedFiles(baseRef);
if (changed === null) {
  console.log('No base branch available to diff against — admin UI adherence check skipped.');
  process.exit(0);
}

// Read the plugin's PHP once, to learn which assets it puts on an admin screen.
// Classifying a changed CSS or JS file depends on knowing that.
const adminAssets = adminAssetPaths(readTextFiles('.', ['.php']));

const files = changed
  .filter((path) => /\.(?:php|jsx|tsx|css)$/i.test(path) && existsSync(path))
  .map((path) => ({ path, content: readFileSync(path, 'utf8') }));

const result = adminUiAdherence({
  files,
  vocab,
  adminAssets,
  promoteWarnings: process.env.PROMOTE_ADMIN_UI_WARNINGS === 'true',
});

console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nADMIN_UI_ADHERENCE=warn — reporting this as a warning, not a failure. Remove that setting once the plugin is caught up.');
  process.exit(0);
}
process.exit(1);
