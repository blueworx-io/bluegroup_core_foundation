#!/usr/bin/env node
// Stages the copy of the page editor library and design system assets that
// .wp-test/example-plugin/ needs to run, from the canonical source at
// .claude/skills/blueworx-admin-design/. Run this before starting the
// harness against the example plugin:
//
//   node scripts/stage-example-plugin.mjs
//   node scripts/wp-test-env.mjs up --plugin .wp-test/example-plugin
//
// Only blueworx-editor-example.php and dev-fixture.php are committed under
// .wp-test/example-plugin/ — everything this script writes is gitignored
// (see .gitignore's allowlist for .wp-test/). Committing the copy instead of
// staging it here was the earlier mistake: nothing checked it stayed in step,
// so a library fix could land while the end-to-end suite kept certifying a
// stale copy underneath it. Staging on every run makes that structurally
// impossible — the example always runs today's library, never yesterday's.

import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const designSystem = join(repoRoot, '.claude', 'skills', 'blueworx-admin-design');
const pluginDir = join(repoRoot, '.wp-test', 'example-plugin');

if (!existsSync(designSystem)) {
  fail(`Design system not found at ${designSystem}`);
}

// Each destination is removed first rather than merged into: a file the
// source no longer has (a renamed or deleted icon, an old field control)
// must not survive as a stale leftover once staged.
stageDir(join(designSystem, 'editor', 'php'), join(pluginDir, 'blueworx-page-editor'));
stageFile(join(designSystem, 'editor', 'blueworx-page-editor.js'), join(pluginDir, 'assets', 'blueworx-page-editor.js'));
stageFile(join(designSystem, 'styles.css'), join(pluginDir, 'assets', 'blueworx-admin-design.css'));
stageFile(join(designSystem, 'assets', 'icons', 'lucide-icons.js'), join(pluginDir, 'assets', 'blueworx-admin-icons.js'));
stageDir(join(designSystem, 'fonts'), join(pluginDir, 'assets', 'fonts'));

log(`Staged the library and design system assets into ${join('.wp-test', 'example-plugin')}`);

function stageDir(src, dest) {
  if (!existsSync(src)) fail(`Missing source directory: ${src}`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function stageFile(src, dest) {
  if (!existsSync(src)) fail(`Missing source file: ${src}`);
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { force: true });
  cpSync(src, dest);
}

function log(msg) {
  console.log(msg);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
