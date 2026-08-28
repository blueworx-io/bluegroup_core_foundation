#!/usr/bin/env node
// WordPress: fails if the plugin's copy of the shared blueworx-admin-design
// system has drifted from the copy committed in the foundation. CI already
// fetches the foundation to FOUNDATION_DIR, so this is a local comparison — no
// network fetch, no version file.
//
// DESIGN_SYSTEM_SYNC=warn downgrades a failure to a printed warning (for a
// plugin that cannot absorb a design system update mid-feature); off skips it.

import { join } from 'node:path';
import { hashTree, hashFile } from './lib/io.mjs';
import { designSystemSync } from './lib/checks.mjs';

const mode = process.env.DESIGN_SYSTEM_SYNC || 'error';
if (mode === 'off') {
  console.log('Design system sync: skipped (DESIGN_SYSTEM_SYNC=off).');
  process.exit(0);
}

const foundationDir = process.env.FOUNDATION_DIR || '.foundation';
const skillPath = process.env.SKILL_PATH || '.claude/skills/blueworx-admin-design';
const cssPath = process.env.CSS_PATH || 'assets/blueworx-admin-design.css';
const fontsPath = process.env.FONTS_PATH || 'assets/fonts';
const iconsPath = process.env.ICONS_PATH || 'assets/blueworx-admin-icons.js';
const editorPhpPath = process.env.EDITOR_PHP_PATH || 'blueworx-page-editor';
const editorJsPath = process.env.EDITOR_JS_PATH || 'assets/blueworx-page-editor.js';
// The ref the workflow fetched the foundation at, so the printed fix pulls the
// same thing this run compared against rather than whatever main holds today.
const foundationRef = process.env.FOUNDATION_REF || 'main';

const result = designSystemSync({
  foundationFiles: hashTree(join(foundationDir, skillPath)),
  pluginFiles: hashTree(skillPath),
  canonicalCss: hashFile(join(foundationDir, skillPath, 'styles.css')),
  shippedCss: hashFile(cssPath),
  canonicalFonts: hashTree(join(foundationDir, skillPath, 'fonts')),
  shippedFonts: hashTree(fontsPath),
  canonicalIcons: hashFile(join(foundationDir, skillPath, 'assets/icons/lucide-icons.js')),
  shippedIcons: hashFile(iconsPath),
  canonicalEditorPhp: hashTree(join(foundationDir, skillPath, 'editor/php')),
  shippedEditorPhp: hashTree(editorPhpPath),
  canonicalEditorJs: hashFile(join(foundationDir, skillPath, 'editor/blueworx-page-editor.js')),
  shippedEditorJs: hashFile(editorJsPath),
  skillPath,
  cssPath,
  fontsPath,
  iconsPath,
  editorPhpPath,
  editorJsPath,
  foundationRef,
});

console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nDESIGN_SYSTEM_SYNC=warn — reporting this as a warning, not a failure. Remove that setting once the plugin is caught up.');
  process.exit(0);
}
process.exit(1);
