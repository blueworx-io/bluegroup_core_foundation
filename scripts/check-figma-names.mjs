#!/usr/bin/env node
// Checks that a client's Figma file uses exactly the theme's colour, font,
// size, space and corner names, before build starts. Lists every variable that
// is missing from Figma, extra in Figma, or named almost-but-not-quite right.
//
//   node ../bluegroup_core_foundation/scripts/check-figma-names.mjs \
//        --figma variables.json --theme .
//
//   --figma <file>       the Figma variables, exported to a file (repeat for
//                        several files); a plain list of names also works
//   --figma-file <key>   or read them straight from Figma: a file key or link.
//                        Needs FIGMA_TOKEN, and an Enterprise plan (Figma only
//                        shares variables with the API there)
//   --theme <path>       the theme's folder (or one stylesheet) that defines
//                        --color-*, --font-*, --text-*, --space-*, --radius-*
//                        (repeat for several)
//   --collection <name>  only check one Figma variable collection
//
// FIGMA_NAMES=warn reports without failing; off skips. Exits 0 when the names
// match, 1 when they don't, 2 when it could not read something.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { readTextFiles } from './lib/io.mjs';
import { compareNames, fetchFigmaVariables, figmaKey, figmaNames, themeNames } from './lib/figma-names.mjs';

const mode = process.env.FIGMA_NAMES || 'error';
if (mode === 'off') {
  console.log('Figma names: skipped (FIGMA_NAMES=off).');
  process.exit(0);
}

const USAGE = [
  'Usage: check-figma-names.mjs --figma <variables.json> --theme <theme folder>',
  '       check-figma-names.mjs --figma-file <key or link> --theme <theme folder>   (needs FIGMA_TOKEN)',
  'Optional: --collection <name> to check one Figma variable collection.',
].join('\n');

function fail(message) {
  console.error(message);
  process.exit(2);
}

const figmaFiles = [];
const themePaths = [];
let figmaFile = '';
let collection = '';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const value = argv[i + 1];
  const flag = argv[i];
  if (!['--figma', '--figma-file', '--theme', '--collection'].includes(flag)) fail(`Unknown option ${flag}.\n${USAGE}`);
  if (value === undefined || value.startsWith('--')) fail(`${flag} needs a value.\n${USAGE}`);
  i += 1;
  if (flag === '--figma') figmaFiles.push(value);
  else if (flag === '--figma-file') figmaFile = value;
  else if (flag === '--theme') themePaths.push(value);
  else collection = value;
}
if ((figmaFiles.length === 0 && !figmaFile) || themePaths.length === 0) fail(USAGE);

let figma = [];
try {
  const sources = [];
  for (const path of figmaFiles) {
    if (!existsSync(path)) throw new Error(`Cannot find the Figma variables file ${path}.`);
    try {
      sources.push(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      throw new Error(`${path} is not valid JSON.`);
    }
  }
  if (figmaFile) sources.push(await fetchFigmaVariables({ key: figmaKey(figmaFile), token: process.env.FIGMA_TOKEN }));
  figma = [...new Set(sources.flatMap((s) => figmaNames(s, { collection })))];
} catch (error) {
  fail(`Figma names: ${error.message}`);
}

const themeFiles = [];
for (const path of themePaths) {
  if (!existsSync(path)) fail(`Figma names: cannot find the theme at ${path}.`);
  if (statSync(path).isDirectory()) themeFiles.push(...readTextFiles(path, ['.css', '.scss', '.pcss']));
  else themeFiles.push({ path, content: readFileSync(path, 'utf8') });
}

const result = compareNames({ figma, theme: themeNames(themeFiles) });
console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nFIGMA_NAMES=warn — reporting this as a warning, not a failure.');
  process.exit(0);
}
process.exit(1);
