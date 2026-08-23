#!/usr/bin/env node
// Claude Code PreToolUse hook: refuses a Write or Edit that would put markup
// into a WordPress admin screen that is not built from the shared
// blueworx-admin-design system. Same rules as the CI check, so a session finds
// out at the moment it writes the line rather than at the pull request.
//
// The rules live in the foundation. If no foundation checkout is reachable this
// exits silently: a missing guardrail must never break somebody's editing.

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const CANDIDATES = [
  process.env.BLUEWORX_FOUNDATION ? join(process.env.BLUEWORX_FOUNDATION, 'scripts') : null,
  '.foundation/scripts',
  '../bluegroup_core_foundation/scripts',
  '../../bluegroup_core_foundation/scripts',
].filter(Boolean);

const scripts = CANDIDATES.find((dir) => existsSync(join(dir, 'lib', 'admin-ui.mjs')));
if (!scripts) process.exit(0);

const load = (rel) => import(pathToFileURL(resolve(scripts, rel)).href);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const path = input?.tool_input?.file_path;
if (!path) process.exit(0);

// Write carries the whole file; Edit carries only the replacement text, which is
// a fragment — so the whole-file rules are held back for it.
const isWrite = input.tool_name === 'Write';
const pending = isWrite ? input?.tool_input?.content : input?.tool_input?.new_string;
if (typeof pending !== 'string' || pending === '') process.exit(0);

const skillDir = '.claude/skills/blueworx-admin-design';
const skillCss = join(skillDir, 'styles.css');
if (!existsSync(skillCss)) process.exit(0);

const { vocabulary } = await load('lib/design-system.mjs');
const { classifyAdminFile, findViolations, adminAssetPaths } = await load('lib/admin-ui.mjs');
const { readTextFiles, readJson } = await load('lib/io.mjs');

const readmeFile = join(skillDir, 'readme.md');
const vocab = vocabulary({
  css: readFileSync(skillCss, 'utf8'),
  manifest: readJson(join(skillDir, '_ds_manifest.json')),
  markup: existsSync(readmeFile) ? readFileSync(readmeFile, 'utf8') : '',
});

// Classify on what the file will be: the pending content for a Write, and what
// is already on disk for an Edit fragment.
const forClassification = isWrite
  ? pending
  : (existsSync(path) ? readFileSync(path, 'utf8') : pending);

const kind = classifyAdminFile({
  path,
  content: forClassification,
  adminAssets: adminAssetPaths(readTextFiles('.', ['.php'])),
});
if (!kind) process.exit(0);

const problems = findViolations({ path, kind, content: pending, vocab, whole: isWrite })
  .filter((p) => p.severity === 'error');
if (problems.length === 0) process.exit(0);

console.error([
  'This admin screen is not built from the blueworx-admin-design system:',
  '',
  ...problems.map((p) => `  ${p.path}:${p.line} — ${p.message}`),
  '',
  'Invoke the blueworx-admin-design skill and take the pattern from there. If',
  'the system has no pattern for what you need, add it to the system in the',
  'foundation first, then build the screen on it.',
].join('\n'));
process.exit(2);
