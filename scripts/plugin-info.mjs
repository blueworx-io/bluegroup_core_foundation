#!/usr/bin/env node
// Resolves the plugin's main file and slug, printing them as key=value lines
// for `>> "$GITHUB_OUTPUT"`. PLUGIN_SLUG overrides the derived slug.
//
//   plugin_file=my-plugin.php
//   slug=my-plugin
//
// With THEME_SLUG set it is a theme: the header file is style.css (which must
// declare "Theme Name:") and the slug is THEME_SLUG. The key stays plugin_file
// so the release workflow reads one output either way.
//
//   plugin_file=style.css
//   slug=blueworx

import { basename } from 'node:path';
import { findPluginMainFile, findThemeStylesheet } from './lib/io.mjs';

if (process.env.THEME_SLUG) {
  const stylesheet = findThemeStylesheet('.');
  if (!stylesheet) {
    console.error('No style.css with "Theme Name:" found at the repo root.');
    process.exit(1);
  }
  console.log(`plugin_file=${stylesheet}`);
  console.log(`slug=${process.env.THEME_SLUG}`);
  process.exit(0);
}

const pluginFile = process.env.PLUGIN_FILE || findPluginMainFile('.');

if (!pluginFile) {
  console.error('No plugin main file (with "Plugin Name:") found in this repo.');
  process.exit(1);
}

const slug = process.env.PLUGIN_SLUG || basename(pluginFile).replace(/\.php$/i, '');

console.log(`plugin_file=${pluginFile}`);
console.log(`slug=${slug}`);
