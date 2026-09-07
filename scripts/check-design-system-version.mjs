#!/usr/bin/env node
// Foundation-only. Fails the run if this PR changes the design system's
// stylesheet without moving its version. See scripts/lib/design-system-version.mjs
// for why the two travel together.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { designSystemVersionBump, parseDesignSystemVersion } from './lib/design-system-version.mjs';

const base = process.env.BASE_REF || 'main';
const skill = '.claude/skills/blueworx-admin-design';

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

const changed = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const result = designSystemVersionBump({
  styleChanged: changed.includes(`${skill}/styles.css`),
  baseVersion: parseDesignSystemVersion(gitShow(`origin/${base}`, `${skill}/design-system.php`)),
  headVersion: parseDesignSystemVersion(readFileSync(`${skill}/design-system.php`, 'utf8')),
});

console.log(result.message);
process.exit(result.ok ? 0 : 1);
