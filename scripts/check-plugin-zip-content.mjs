#!/usr/bin/env node
// WordPress: fails if anything that must never reach a live site would ship in
// the plugin zip. Reads archive-style entry paths (one per line) on stdin —
// either a staged tree's relative paths at PR time, or `unzip -Z1` output from
// the real artifact at release time. Same input shape, same verdict.
//
// PLUGIN_SLUG overrides the slug; otherwise it's inferred from the plugin file.

import { basename } from 'node:path';
import { findPluginMainFile } from './lib/io.mjs';
import { pluginZipContent } from './lib/checks.mjs';

let slug = process.env.PLUGIN_SLUG;
if (!slug) {
  const main = findPluginMainFile('.');
  slug = main ? basename(main).replace(/\.php$/i, '') : basename(process.cwd());
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const entries = Buffer.concat(chunks).toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const result = pluginZipContent({ entries, slug });
if (!result.ok) {
  console.error(`::error title=Plugin zip would ship files it must not::${result.offenders.length} offending path(s)`);
  console.error(result.message);
  process.exit(1);
}
console.log(result.message);
