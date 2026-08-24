// Thin git + filesystem helpers shared by the CLI check scripts.
// Kept deliberately small; the pure logic lives in checks.mjs / semver.mjs.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';

// .wp-test holds a provisioned WordPress (see scripts/wp-test-env.mjs). It is a
// whole WordPress tree, so walking it would find core's PHP files and any zip
// left in it — never the project's own.
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.foundation', '.wp-test']);

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

// Every file under `cwd` with one of `extensions`, as { path, content } with
// repo-relative forward-slash paths. Uses the same walk — and the same skip
// list — as findPluginMainFile, so a provisioned WordPress or a vendor tree is
// never mistaken for the plugin's own code.
export function readTextFiles(cwd, extensions, maxDepth = 6) {
  const wanted = new Set(extensions.map((e) => e.toLowerCase()));
  const out = [];
  for (const file of walk(cwd, (f) => wanted.has(extname(f).toLowerCase()), maxDepth)) {
    try {
      out.push({ path: normalize(relative(cwd, file)), content: readFileSync(file, 'utf8') });
    } catch {
      /* unreadable — skip */
    }
  }
  return out;
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

// Text extensions get CRLF-normalised before hashing. Without this a Windows
// working tree reads as drift against the same bytes checked out on the Linux
// runner, and the guardrail cries wolf on every PR.
const TEXT_EXTENSIONS = new Set(['.md', '.css', '.json', '.txt', '.js', '.mjs', '.svg', '.html', '.yml', '.yaml']);

export function hashFile(path) {
  if (!existsSync(path)) return null;
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase();
  let bytes = readFileSync(path);
  if (TEXT_EXTENSIONS.has(ext)) {
    bytes = Buffer.from(bytes.toString('utf8').split('\r\n').join('\n'), 'utf8');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

// Map of path-relative-to-dir (forward slashes, so the two platforms agree)
// -> content hash. null when the directory is absent, which callers treat as
// "not present" rather than as an error.
export function hashTree(dir) {
  if (!existsSync(dir)) return null;
  const out = new Map();
  const walk = (abs, rel) => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childAbs = join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile()) out.set(childRel, hashFile(childAbs));
    }
  };
  walk(dir, '');
  return out;
}
