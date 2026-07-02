#!/usr/bin/env node
// WordPress: fails if the plugin header Version and package.json version disagree.
// No package.json ⇒ pass (nothing to sync).

import { readFileSync } from 'node:fs';
import { readJson, findPluginMainFile, parsePhpHeaderVersion } from './lib/io.mjs';
import { pluginVersionSync } from './lib/checks.mjs';

const main = findPluginMainFile('.');
if (!main) {
  console.error('Plugin version sync: no plugin main file (with "Plugin Name:") found.');
  process.exit(1);
}

const headerVersion = parsePhpHeaderVersion(readFileSync(main, 'utf8'));
if (!headerVersion) {
  console.error(`Plugin version sync: no "Version:" header found in ${main}.`);
  process.exit(1);
}

const pkgVersion = readJson(process.env.PKG_PATH || 'package.json')?.version ?? null;
const result = pluginVersionSync({ headerVersion, pkgVersion });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
