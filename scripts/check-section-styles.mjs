#!/usr/bin/env node
// WordPress: fails if a section's styles type in their own colour, font or size
// instead of using the theme's named styles (var(--color-primary) and friends).
// Sections are the stylesheets and render.php files under a blocks/ folder.
//
// On a pull request (BASE_REF set) only the sections the PR touches are judged,
// so a plugin brings its sections in line as it works on them. With no BASE_REF
// every section in the repo is judged, which is what you want when running it
// by hand.
//
// SECTION_NAMES_FILE   the old BlueWorx plugin's one file of theme names, if it
//                      lives under blocks/ and so would otherwise be judged.
// SECTION_STYLES=warn  report without failing (a plugin catching up mid-feature);
//                      off skips the check.

import { existsSync, readFileSync } from 'node:fs';
import { gitChangedFiles, readTextFiles } from './lib/io.mjs';
import { isSectionFile, sectionStyles } from './lib/section-styles.mjs';

const mode = process.env.SECTION_STYLES || 'error';
if (mode === 'off') {
  console.log('Section styles: skipped (SECTION_STYLES=off).');
  process.exit(0);
}

let files;
const baseRef = process.env.BASE_REF;
if (baseRef) {
  const changed = gitChangedFiles(baseRef);
  if (changed === null) {
    console.log('No base branch available to diff against — section styles check skipped.');
    process.exit(0);
  }
  files = changed
    .filter((path) => isSectionFile(path) && existsSync(path))
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
} else {
  files = readTextFiles('.', ['.css', '.scss', '.pcss', '.php']).filter((f) => isSectionFile(f.path));
}

const result = sectionStyles({ files, namesFile: process.env.SECTION_NAMES_FILE || '' });

console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nSECTION_STYLES=warn — reporting this as a warning, not a failure. Remove that setting once the sections are caught up.');
  process.exit(0);
}
process.exit(1);
