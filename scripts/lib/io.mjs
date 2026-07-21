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

// Visits every file at the current depth before descending into any
// subdirectory, so a match at depth N is always returned ahead of a match at
// depth N+1 regardless of alphabetical sort order. This matters for
// findPluginMainFile(): a WordPress main plugin file is always at the repo
// root, but a subdirectory file (e.g. an admin class) can also legitimately
// carry a "Plugin Name:" docblock, and readdirSync's alphabetical order can
// put that subdirectory ahead of the root file (e.g. "admin/" before
// "my-plugin.php"). Depth-first-into-subdirs traversal would return the
// subdirectory file in that case; this breadth-by-depth order never does.
function walk(dir, predicate, maxDepth, depth = 0, acc = []) {
  if (depth > maxDepth) return acc;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  const subdirs = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) subdirs.push(full);
    else if (predicate(full)) acc.push(full);
  }
  for (const full of subdirs) {
    walk(full, predicate, maxDepth, depth + 1, acc);
  }
  return acc;
}

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
