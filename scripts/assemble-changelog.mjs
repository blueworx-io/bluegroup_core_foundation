#!/usr/bin/env node
// Folds every pending changelog fragment into CHANGELOG.md under the current
// version, then deletes the fragments.
//
// The changelog guardrail lets a PR record its entry as its own file under
// changelog.d/ rather than at the top of CHANGELOG.md, so two open branches
// never conflict on the same lines. This is the step that clears them, and it
// belongs on the default branch — running it on a feature branch puts the entry
// back in the shared file and re-creates exactly that conflict.
//
// Env:
//   CHANGELOG_DIR    fragment directory (default changelog.d)
//   CHANGELOG_PATH   changelog file (default CHANGELOG.md)
//   VERSION_SOURCE   package (default) | plugin-header — same contract as
//                    check-version-bump.mjs, so a project names its version
//                    source once and both agree
//   PKG_PATH         package.json path when VERSION_SOURCE=package
//   ASSEMBLE_DATE    YYYY-MM-DD, for tests and reproducible runs

import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, findPluginMainFile, parsePhpHeaderVersion } from './lib/io.mjs';
import { assemble } from './lib/changelog.mjs';

const fragmentDir = process.env.CHANGELOG_DIR || 'changelog.d';
const changelogPath = process.env.CHANGELOG_PATH || 'CHANGELOG.md';
const source = process.env.VERSION_SOURCE || 'package';
const pkgPath = process.env.PKG_PATH || 'package.json';

if (!existsSync(fragmentDir)) {
  console.log(`No ${fragmentDir}/ directory — nothing to assemble.`);
  process.exit(0);
}

// README.md documents the directory; it is not an entry.
const names = readdirSync(fragmentDir)
  .filter((n) => n.endsWith('.md') && n !== 'README.md')
  .sort();

if (names.length === 0) {
  console.log(`No fragments in ${fragmentDir}/ — nothing to assemble.`);
  process.exit(0);
}

if (!existsSync(changelogPath)) {
  console.error(`${names.length} fragment(s) pending but ${changelogPath} does not exist — nothing to assemble into.`);
  process.exit(1);
}

const version = currentVersion();
if (!version) {
  console.error(
    `Could not read the current version (VERSION_SOURCE=${source}). ` +
      'Fragments are left in place rather than filed under an unknown version.',
  );
  process.exit(1);
}

const date = process.env.ASSEMBLE_DATE || new Date().toISOString().slice(0, 10);
const fragments = names.map((name) => ({ name, text: readFileSync(join(fragmentDir, name), 'utf8') }));

// parseFragment throws on a malformed fragment. Let it: filing an entry under
// the wrong heading, or dropping it, is worse than stopping and saying which
// file is wrong.
const updated = assemble({ changelog: readFileSync(changelogPath, 'utf8'), fragments, version, date });

writeFileSync(changelogPath, updated);
for (const name of names) unlinkSync(join(fragmentDir, name));

console.log(`Assembled ${names.length} fragment(s) into ${changelogPath} under ${version}: ${names.join(', ')}.`);

function currentVersion() {
  if (source === 'plugin-header') {
    const main = findPluginMainFile('.');
    if (!main) return null;
    return parsePhpHeaderVersion(readFileSync(main, 'utf8'));
  }
  return readJson(pkgPath)?.version ?? null;
}
