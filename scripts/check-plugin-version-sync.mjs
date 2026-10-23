#!/usr/bin/env node
// WordPress: fails if the plugin header Version and package.json version disagree.
// No package.json ⇒ pass (nothing to sync). With THEME_SLUG set it is a theme,
// and the Version: line of style.css is compared instead.

import { readFileSync } from 'node:fs';
import { readJson, findPluginMainFile, findThemeStylesheet, parsePhpHeaderVersion } from './lib/io.mjs';
import { pluginVersionSync } from './lib/checks.mjs';

const theme = Boolean(process.env.THEME_SLUG);
const main = theme ? findThemeStylesheet('.') : findPluginMainFile('.');
if (!main) {
  console.error(theme
    ? 'Theme version sync: no style.css with "Theme Name:" found at the repo root.'
    : 'Plugin version sync: no plugin main file (with "Plugin Name:") found.');
  process.exit(1);
}

const headerVersion = parsePhpHeaderVersion(readFileSync(main, 'utf8'));
if (!headerVersion) {
  console.error(`Plugin version sync: no "Version:" header found in ${main}.`);
  process.exit(1);
}

const pkgVersion = readJson(process.env.PKG_PATH || 'package.json')?.version ?? null;
const result = theme
  ? pluginVersionSync({ headerVersion, pkgVersion, header: 'style.css Version' })
  : pluginVersionSync({ headerVersion, pkgVersion });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
