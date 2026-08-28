#!/usr/bin/env node
// Stages the copy of the page editor library and design system assets that
// .wp-test/example-plugin/ needs to run, from the canonical source at
// .claude/skills/blueworx-admin-design/. Run this before starting the
// harness against the example plugin:
//
//   node scripts/stage-example-plugin.mjs
//   node scripts/wp-test-env.mjs up --plugin .wp-test/example-plugin
//
// The Playwright suite also stages automatically, via globalSetup — see
// scripts/playwright-global-setup.mjs — so `npx playwright test` (or the
// local install's own binary) never runs against a stale or absent copy
// even if this was never run by hand. Running it by hand still works the
// same way for anyone poking at the screen without the suite.
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export function stage() {
  const designSystem = join(repoRoot, '.claude', 'skills', 'blueworx-admin-design');
  const pluginDir = join(repoRoot, '.wp-test', 'example-plugin');

  const tasks = [
    { kind: 'dir', src: join(designSystem, 'editor', 'php'), dest: join(pluginDir, 'blueworx-page-editor') },
    { kind: 'file', src: join(designSystem, 'editor', 'blueworx-page-editor.js'), dest: join(pluginDir, 'assets', 'blueworx-page-editor.js') },
    { kind: 'file', src: join(designSystem, 'styles.css'), dest: join(pluginDir, 'assets', 'blueworx-admin-design.css') },
    { kind: 'file', src: join(designSystem, 'assets', 'icons', 'lucide-icons.js'), dest: join(pluginDir, 'assets', 'blueworx-admin-icons.js') },
    { kind: 'dir', src: join(designSystem, 'fonts'), dest: join(pluginDir, 'assets', 'fonts') },
  ];

  // Every source is confirmed present before anything is touched. Checking
  // this per task, inline with copying, meant a source missing further down
  // the list (a renamed folder, a skill not fully checked out) could wipe an
  // earlier destination — via the "remove first" step below — and then fail,
  // leaving the plugin half-staged and worse off than before this ran.
  for (const task of tasks) {
    if (!existsSync(task.src)) {
      fail(`Missing source ${task.kind === 'dir' ? 'directory' : 'file'}: ${task.src}`);
    }
  }

  for (const task of tasks) {
    // Each destination is removed first rather than merged into: a file the
    // source no longer has (a renamed or deleted icon, an old field control)
    // must not survive as a stale leftover once staged.
    rmSync(task.dest, { recursive: true, force: true });
    mkdirSync(dirname(task.dest), { recursive: true });
    if (task.kind === 'dir') {
      cpSync(task.src, task.dest, { recursive: true });
    } else {
      cpSync(task.src, task.dest);
    }
  }

  log(`Staged the library and design system assets into ${join('.wp-test', 'example-plugin')}`);
}

function log(msg) {
  console.log(msg);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Runs stage() only when this file is the one node was actually asked to
// execute (`node scripts/stage-example-plugin.mjs`), not when
// scripts/playwright-global-setup.mjs imports it as a module.
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  stage();
}
