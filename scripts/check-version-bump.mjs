#!/usr/bin/env node
// Fails if the version was not bumped above the base branch.
// VERSION_SOURCE=package (default) reads package.json; VERSION_SOURCE=plugin-header
// reads the WordPress plugin header. Missing BASE_REF or base file ⇒ pass.

import { readFileSync } from 'node:fs';
import { readJson, gitShowFile, findPluginMainFile, parsePhpHeaderVersion } from './lib/io.mjs';
import { versionBumped } from './lib/checks.mjs';

const baseRef = process.env.BASE_REF;
const source = process.env.VERSION_SOURCE || 'package';
const pkgPath = process.env.PKG_PATH || 'package.json';

if (!baseRef) {
  console.log('No BASE_REF set — version bump check skipped (not a PR context).');
  process.exit(0);
}

let current = null;
let base = null;

if (source === 'plugin-header') {
  const main = findPluginMainFile('.');
  if (!main) {
    console.error('Version bump check: no plugin main file (with "Plugin Name:") found.');
    process.exit(1);
  }
  current = parsePhpHeaderVersion(readFileSync(main, 'utf8'));
  const baseContent = gitShowFile(`origin/${baseRef}`, main);
  base = baseContent ? parsePhpHeaderVersion(baseContent) : null;
} else {
  current = readJson(pkgPath)?.version ?? null;
  const baseContent = gitShowFile(`origin/${baseRef}`, pkgPath);
  try {
    base = baseContent ? (JSON.parse(baseContent).version ?? null) : null;
  } catch {
    base = null;
  }
}

const result = versionBumped({ current, base });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
