// The hook has no library of its own to unit-test — it is a 40-line resolver
// that finds the foundation, loads the real rules, and shells out a verdict.
// So this spawns it as a real child process, exactly as Claude Code would,
// and asserts on exit codes and stderr. Two of the fixes in this fix wave
// (the wrong Edit line number, the MODULE_NOT_FOUND noise in a repo missing
// this file) would both have been caught by a test this cheap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, 'admin-ui-adherence.mjs');
const repoRoot = resolve(here, '..', '..');

const STYLES_CSS = [
  ':root{',
  '  --bw-brand: #4F46E5;',
  '}',
  '.bw-card{ color: var(--bw-brand); }',
  '.bw-btn{ color: var(--bw-brand); }',
].join('\n');

// A temp "plugin repo" with just enough of the design system in place for the
// hook to find it and build a vocabulary from it — the same shape it expects
// to see beside a real plugin's files.
function pluginRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'admin-ui-hook-test-'));
  const skillDir = join(dir, '.claude', 'skills', 'blueworx-admin-design');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'styles.css'), STYLES_CSS);
  return dir;
}

// Runs the hook the way Claude Code does: JSON on stdin, cwd at the repo
// root, BLUEWORX_FOUNDATION pointing at this checkout so the hook finds the
// real rules without needing a second clone on disk.
function runHook(cwd, input) {
  return spawnSync(process.execPath, [hookPath], {
    cwd,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, BLUEWORX_FOUNDATION: repoRoot },
  });
}

test('hook: a good Write exits 0 with no output', () => {
  const cwd = pluginRepo();
  const content = "add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );\n<div class=\"bw-card\">Hi</div>";
  const result = runHook(cwd, {
    tool_name: 'Write',
    tool_input: { file_path: 'includes/screen.php', content },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

test('hook: a bad Write exits 2 and names the offending file', () => {
  const cwd = pluginRepo();
  const content = 'add_menu_page( \'X\', \'X\', \'manage_options\', \'x\', \'render\' );\n<div class="bw-card" style="color:#333">Hi</div>';
  const result = runHook(cwd, {
    tool_name: 'Write',
    tool_input: { file_path: 'includes/screen.php', content },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /includes\/screen\.php/);
});

test('hook: an empty object exits 0', () => {
  const cwd = pluginRepo();
  const result = runHook(cwd, {});
  assert.equal(result.status, 0);
});

test('hook: invalid JSON on stdin exits 0', () => {
  const cwd = pluginRepo();
  const result = runHook(cwd, 'not json {{{');
  assert.equal(result.status, 0);
});

test('hook: a Write to a file that is not an admin screen exits 0', () => {
  const cwd = pluginRepo();
  const result = runHook(cwd, {
    tool_name: 'Write',
    tool_input: { file_path: 'includes/shortcode.php', content: "add_shortcode( 'x', 'render' );" },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});
