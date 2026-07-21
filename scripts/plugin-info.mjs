#!/usr/bin/env node
// Resolves the plugin's main file and slug, printing them as key=value lines
// for `>> "$GITHUB_OUTPUT"`. PLUGIN_SLUG overrides the derived slug.
//
//   plugin_file=my-plugin.php
//   slug=my-plugin

import { basename } from 'node:path';
import { findPluginMainFile } from './lib/io.mjs';

const pluginFile = process.env.PLUGIN_FILE || findPluginMainFile('.');

if (!pluginFile) {
  console.error('No plugin main file (with "Plugin Name:") found in this repo.');
  process.exit(1);
}

const slug = process.env.PLUGIN_SLUG || basename(pluginFile).replace(/\.php$/i, '');

console.log(`plugin_file=${pluginFile}`);
console.log(`slug=${slug}`);
