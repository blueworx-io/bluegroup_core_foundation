#!/usr/bin/env node
// Fails if the pushed release tag doesn't match the plugin header's Version:.
// RELEASE_TAG is the tag (e.g. v1.2.0). PLUGIN_FILE optionally overrides detection.

import { readFileSync } from 'node:fs';
import { findPluginMainFile, parsePhpHeaderVersion } from './lib/io.mjs';
import { releaseTag } from './lib/checks.mjs';

const tag = process.env.RELEASE_TAG || '';
const pluginFile = process.env.PLUGIN_FILE || findPluginMainFile('.');

let headerVersion = null;
if (pluginFile) {
  try {
    headerVersion = parsePhpHeaderVersion(readFileSync(pluginFile, 'utf8'));
  } catch {
    headerVersion = null;
  }
}

const result = releaseTag({ tag, headerVersion, pluginFile });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
