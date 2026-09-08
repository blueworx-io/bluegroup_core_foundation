#!/usr/bin/env node
// Foundation-only. Fails the run if this PR changes a file the design system
// ships to plugins — the stylesheet, the icon module, or a font — without
// moving its version. See scripts/lib/design-system-version.mjs for why they
// travel together.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { changedDesignSystemPaths, designSystemVersionBump, parseDesignSystemVersion } from './lib/design-system-version.mjs';

const base = process.env.BASE_REF || 'main';
const baseRefName = `origin/${base}`;
const skill = '.claude/skills/blueworx-admin-design';
const registrarPath = `${skill}/design-system.php`;

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function pathExistsAtRef(ref, path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Diffing against a ref that can't be resolved — or that a shallow clone
// can't find a merge base with — throws instead of returning an empty list.
// That is exactly the "guard is dead" situation this whole script exists to
// catch, so it is treated as a signal (null), not left to crash the run with
// a raw stack trace before the check ever gets to say so.
function changedFiles(ref) {
  try {
    return execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

const headVersion = parseDesignSystemVersion(readFileSync(registrarPath, 'utf8'));
const changed = changedFiles(baseRefName);
const baseRefExists = changed !== null;
// Only worth asking whether the registrar existed on a ref that itself
// resolved — on an unresolved ref this would come back false anyway and get
// lost behind the "ref could not be resolved" failure, which is the one that
// actually applies there.
const baseRegistrarExisted = baseRefExists && pathExistsAtRef(baseRefName, registrarPath);

const result = designSystemVersionBump({
  // A ref this script can't diff against is treated as if a watched file
  // changed: it has no way to prove otherwise, and the whole point of this
  // guard is to never pass silently just because it lost the ability to check.
  changedPaths: baseRefExists ? changedDesignSystemPaths(changed, skill) : [`${skill}/styles.css`],
  baseRefExists,
  baseRegistrarExisted,
  baseRef: baseRefName,
  baseVersion: baseRefExists ? parseDesignSystemVersion(gitShow(baseRefName, registrarPath)) : '',
  headVersion,
});

console.log(result.message);
process.exit(result.ok ? 0 : 1);
