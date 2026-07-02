#!/usr/bin/env node
// WordPress: fails if more than one <slug>*.zip exists in the repo — only the
// current version's zip should be present. Zero zips is allowed.
// PLUGIN_SLUG overrides the slug; otherwise it's inferred from the plugin file.

import { basename } from 'node:path';
import { findZips, findPluginMainFile } from './lib/io.mjs';
import { pluginZip } from './lib/checks.mjs';

let slug = process.env.PLUGIN_SLUG;
if (!slug) {
  const main = findPluginMainFile('.');
  slug = main ? basename(main).replace(/\.php$/i, '') : basename(process.cwd());
}

const zipFiles = findZips('.', slug);
const result = pluginZip({ zipFiles, slug });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
