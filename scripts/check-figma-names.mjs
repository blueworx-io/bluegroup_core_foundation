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

const USAGE = [
  'Usage: check-figma-names.mjs --figma <variables.json> --theme <theme folder>',
  '       check-figma-names.mjs --figma-file <key or link> --theme <theme folder>   (needs FIGMA_TOKEN)',
  'Optional: --collection <name> to check one Figma variable collection.',
].join('\n');

// Failing means "could not read something" (exit 2). It throws to the end of main,
// so the message is written out before Node exits, however much is piped.
class Stop extends Error {}
function fail(message) {
  throw new Stop(message);
}

async function main() {
  if (mode === 'off') {
    console.log('Figma names: skipped (FIGMA_NAMES=off).');
    return 0;
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
    const labels = [...figmaFiles];
    for (const path of figmaFiles) {
      if (!existsSync(path)) throw new Error(`Cannot find the Figma variables file ${path}.`);
      try {
        sources.push(JSON.parse(readFileSync(path, 'utf8')));
      } catch {
        throw new Error(`${path} is not valid JSON.`);
      }
    }
    if (figmaFile) labels.push(`The Figma file ${figmaFile}`);
    if (figmaFile) sources.push(await fetchFigmaVariables({ key: figmaKey(figmaFile), token: process.env.FIGMA_TOKEN }));
    const all = new Set();
    sources.forEach((source, i) => {
      let names;
      try {
        names = figmaNames(source, { collection });
      } catch (error) {
        throw new Error(`${labels[i]}: ${error.message}`);
      }
      if (names.length === 0) throw new Error(`${labels[i]} has no variables in it.`);
      names.forEach((n) => all.add(n));
    });
    figma = [...all];
  } catch (error) {
    fail(`Figma names: ${error.message}`);
  }

  const themeFiles = [];
  const unreadable = [];
  for (const path of themePaths) {
    if (!existsSync(path)) fail(`Figma names: cannot find the theme at ${path}.`);
    try {
      if (statSync(path).isDirectory()) themeFiles.push(...readTextFiles(path, ['.css', '.scss', '.pcss'], Infinity, (file) => unreadable.push(file)));
      else themeFiles.push({ path, content: readFileSync(path, 'utf8') });
    } catch {
      unreadable.push(path);
    }
  }
  if (unreadable.length > 0) {
    const list = unreadable.map((f) => `  - ${f}`).join('\n');
    fail(`Figma names: cannot read these theme files or folders, so the check would only see part of the theme:\n${list}`);
  }

  const result = compareNames({ figma, theme: themeNames(themeFiles) });
  console.log(result.message);
  if (result.ok) return 0;
  if (mode === 'warn') {
    console.log('\nFIGMA_NAMES=warn — reporting this as a warning, not a failure.');
    return 0;
  }
  return 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  console.error(error.message);
  process.exitCode = 2;
}
