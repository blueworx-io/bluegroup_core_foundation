// Thin git + filesystem helpers shared by the CLI check scripts.
// Kept deliberately small; the pure logic lives in checks.mjs / semver.mjs.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.foundation']);

export function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Run git, returning stdout on success or null on any failure.
export function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

// Contents of `path` at `ref` (e.g. "origin/main"), or null if absent.
export function gitShowFile(ref, path) {
  return git(['show', `${ref}:${path}`]);
}

// Files changed between the merge-base of origin/<baseRef> and HEAD.
// Returns null if the diff can't be computed (e.g. base not fetched).
export function gitChangedFiles(baseRef) {
  const out = git(['diff', '--name-only', `origin/${baseRef}...HEAD`]);
  if (out === null) return null;
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// First *.php (depth <= maxDepth) whose contents declare a WordPress
// plugin header ("Plugin Name:"). Returns a repo-relative path or null.
export function findPluginMainFile(cwd = '.', maxDepth = 2) {
  for (const file of walk(cwd, (f) => f.endsWith('.php'), maxDepth)) {
    try {
      if (/^\s*\*?\s*Plugin Name:/im.test(readFileSync(file, 'utf8'))) {
        return normalize(file);
      }
    } catch {
      /* unreadable — skip */
    }
  }
  return null;
}

export function parsePhpHeaderVersion(content) {
  const m = content.match(/^\s*\*?\s*Version:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

// Zip filenames (basename) whose name starts with `slug`.
export function findZips(cwd, slug) {
  return walk(cwd, (f) => {
    const b = basename(f).toLowerCase();
    return b.endsWith('.zip') && b.startsWith(slug.toLowerCase());
  }, 4).map((f) => basename(f));
}

function walk(dir, predicate, maxDepth, depth = 0, acc = []) {
  if (depth > maxDepth) return acc;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, maxDepth, depth + 1, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
