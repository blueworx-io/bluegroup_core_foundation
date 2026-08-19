# Design System Sync Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail a WordPress plugin's pull request when its copy of the shared
`blueworx-admin-design` system has drifted from the copy committed in
`bluegroup_core_foundation`.

**Architecture:** The shared WordPress CI workflow already checks the whole
foundation repo out into `.foundation` before running the guardrail scripts, so
the canonical design system is on disk next to the plugin on every run. The
check is therefore a local byte comparison of two directories plus one shipped
stylesheet — no network fetch, no version file. It follows the existing
guardrail shape exactly: pure logic in `scripts/lib/checks.mjs` with unit tests,
filesystem access in `scripts/lib/io.mjs`, and a thin CLI wrapper in
`scripts/` invoked as one step in the workflow's `static` job.

**Tech Stack:** Node 20 ESM (`.mjs`), `node:test` + `node:assert/strict`,
`node:crypto` for hashing, GitHub Actions reusable workflows.

**Spec:** `docs/superpowers/specs/2026-08-18-design-system-sync.md`

## Global Constraints

- Node 20, ESM only. No new runtime dependencies — the foundation's check
  scripts have zero dependencies and must stay that way.
- Pure logic goes in `scripts/lib/checks.mjs` and returns `{ ok, message }`;
  callers gather inputs and pass them in. No I/O in that file.
- Filesystem helpers go in `scripts/lib/io.mjs`.
- Unit tests go in `scripts/lib/checks.test.mjs` and run via
  `node --test scripts/lib/*.test.mjs` (wired already in `foundation-ci.yml`).
- Canonical skill path: `.claude/skills/blueworx-admin-design`
- Canonical shipped stylesheet path: `assets/blueworx-admin-design.css`
- Foundation repo: `blueworx-io/bluegroup_core_foundation`
- Commit messages: one plain line saying what changed.

---

### Task 1: The comparison rule

**Files:**
- Modify: `scripts/lib/checks.mjs` (append a new exported function)
- Test: `scripts/lib/checks.test.mjs` (append tests + extend the import list)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `designSystemSync({ foundationFiles, pluginFiles, canonicalCss, shippedCss, skillPath, cssPath })`
  → `{ ok: boolean, message: string, problems: string[] }`.
  `foundationFiles` and `pluginFiles` are `Map<string, string>` of
  repo-relative-to-the-skill-folder path → content hash, or `null` when the
  folder is absent. `canonicalCss` and `shippedCss` are content hashes or
  `null` when the file is absent. Task 2's CLI builds those inputs.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/checks.test.mjs`, and add `designSystemSync` to the
existing import list at the top of the file:

```javascript
const SKILL = '.claude/skills/blueworx-admin-design';
const CSS = 'assets/blueworx-admin-design.css';

// Small helper so the cases below read as intent, not as Map plumbing.
const tree = (obj) => new Map(Object.entries(obj));
const inSync = {
  foundationFiles: tree({ 'SKILL.md': 'a', 'styles.css': 'b' }),
  pluginFiles: tree({ 'SKILL.md': 'a', 'styles.css': 'b' }),
  canonicalCss: 'b',
  shippedCss: 'b',
};

test('designSystemSync: passes when the foundation has no design system yet', () => {
  const r = designSystemSync({ ...inSync, foundationFiles: null });
  assert.equal(r.ok, true);
  assert.match(r.message, /not in the foundation yet/);
});

test('designSystemSync: passes when the plugin has not adopted it', () => {
  const r = designSystemSync({ ...inSync, pluginFiles: null });
  assert.equal(r.ok, true);
  assert.match(r.message, /not adopted/);
});

test('designSystemSync: passes when both copies and the shipped CSS match', () => {
  const r = designSystemSync(inSync);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('designSystemSync: fails when a file differs', () => {
  const r = designSystemSync({
    ...inSync,
    pluginFiles: tree({ 'SKILL.md': 'CHANGED', 'styles.css': 'b' }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /SKILL\.md/);
  assert.match(r.problems[0], /differs/);
});

test('designSystemSync: fails when the plugin is missing a file', () => {
  const r = designSystemSync({ ...inSync, pluginFiles: tree({ 'SKILL.md': 'a' }) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /styles\.css — missing from this plugin/);
});

test('designSystemSync: fails on a file the design system does not have', () => {
  const r = designSystemSync({
    ...inSync,
    pluginFiles: tree({ 'SKILL.md': 'a', 'styles.css': 'b', 'local-hack.md': 'x' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /local-hack\.md/);
});

test('designSystemSync: fails when the shipped stylesheet is missing', () => {
  const r = designSystemSync({ ...inSync, shippedCss: null });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /assets\/blueworx-admin-design\.css — missing/);
});

test('designSystemSync: fails when the shipped stylesheet is stale', () => {
  const r = designSystemSync({ ...inSync, shippedCss: 'OLD' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /differs from/);
});

test('designSystemSync: failure message names the files and the fix', () => {
  const r = designSystemSync({ ...inSync, shippedCss: 'OLD' });
  assert.match(r.message, new RegExp(CSS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r.message, /curl/);
  assert.match(r.message, /cp .*styles\.css/);
});

test('designSystemSync: reports every problem, not just the first', () => {
  const r = designSystemSync({
    ...inSync,
    pluginFiles: tree({ 'SKILL.md': 'CHANGED' }),
    shippedCss: 'OLD',
  });
  assert.equal(r.problems.length, 3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: FAIL — `designSystemSync is not defined` (the import does not resolve).

- [ ] **Step 3: Write the implementation**

Append to `scripts/lib/checks.mjs`:

```javascript
// The design system is copied into each plugin twice, and the two copies drift
// independently: the skill folder is what Claude Code reads when building an
// admin screen, and assets/blueworx-admin-design.css is what the plugin
// actually enqueues on the page. Comparing content hashes both ways catches a
// plugin that has fallen behind AND a file hand-edited inside a plugin.
//
// Absence is deliberately not a failure on either side. The check ships before
// the design system does, and existing plugins adopt it one at a time — a
// guardrail that broke every repo on day one would just get switched off.
export function designSystemSync({
  foundationFiles,
  pluginFiles,
  canonicalCss,
  shippedCss,
  skillPath = '.claude/skills/blueworx-admin-design',
  cssPath = 'assets/blueworx-admin-design.css',
}) {
  if (foundationFiles === null) {
    return { ok: true, problems: [], message: `Design system sync: ${skillPath} is not in the foundation yet — nothing to compare.` };
  }
  if (pluginFiles === null) {
    return { ok: true, problems: [], message: `Design system sync: this plugin has no ${skillPath} — design system not adopted, skipping.` };
  }

  const problems = [];
  const names = new Set([...foundationFiles.keys(), ...pluginFiles.keys()]);
  for (const name of [...names].sort()) {
    const want = foundationFiles.get(name);
    const got = pluginFiles.get(name);
    if (got === undefined) problems.push(`${skillPath}/${name} — missing from this plugin`);
    else if (want === undefined) problems.push(`${skillPath}/${name} — not part of the design system; delete it`);
    else if (want !== got) problems.push(`${skillPath}/${name} — differs from the design system`);
  }

  if (canonicalCss === null) {
    problems.push(`${skillPath}/styles.css — missing from the design system itself; fix it in the foundation`);
  } else if (shippedCss === null) {
    problems.push(`${cssPath} — missing; the plugin must ship the stylesheet it enqueues`);
  } else if (shippedCss !== canonicalCss) {
    problems.push(`${cssPath} — differs from ${skillPath}/styles.css`);
  }

  if (problems.length === 0) {
    return { ok: true, problems, message: `Design system sync: ${skillPath} and ${cssPath} match the foundation.` };
  }

  const fix = [
    'Fix by re-pulling the design system and re-copying the stylesheet:',
    '',
    '  mkdir -p .claude/skills',
    `  rm -rf ${skillPath}`,
    '  curl -sL https://github.com/blueworx-io/bluegroup_core_foundation/archive/refs/heads/main.tar.gz \\',
    '    | tar -xz --strip-components=3 -C .claude/skills \\',
    `      bluegroup_core_foundation-main/${skillPath}`,
    `  cp ${skillPath}/styles.css ${cssPath}`,
    '',
    'Authoring happens in Claude Design — do not hand-edit either copy here.',
  ].join('\n');

  return {
    ok: false,
    problems,
    message: [`Design system out of sync (${problems.length} problem(s)):`, ...problems.map((p) => `  - ${p}`), '', fix].join('\n'),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: PASS, all tests including the ten new ones.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/checks.mjs scripts/lib/checks.test.mjs
git commit -m "Add the design system sync comparison rule"
```

---

### Task 2: Reading the two copies off disk

**Files:**
- Modify: `scripts/lib/io.mjs` (append two helpers)
- Create: `scripts/check-design-system-sync.mjs`
- Test: `scripts/lib/io.test.mjs` (new file)

**Interfaces:**
- Consumes: `designSystemSync` from Task 1.
- Produces: `hashFile(path)` → `string | null` (sha256 hex, `null` when absent)
  and `hashTree(dir)` → `Map<string, string> | null` keyed by path relative to
  `dir` with forward slashes. Both normalise CRLF to LF for text file
  extensions so a Windows working tree does not read as drift.
  Also produces the CLI `scripts/check-design-system-sync.mjs`, which Task 3
  wires into the workflow and which reads `FOUNDATION_DIR`, `SKILL_PATH`,
  `CSS_PATH` and `DESIGN_SYSTEM_SYNC` from the environment.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/io.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashFile, hashTree } from './io.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'io-test-'));

test('hashFile: returns null for a file that does not exist', () => {
  assert.equal(hashFile(join(scratch(), 'nope.css')), null);
});

test('hashFile: is stable and content-sensitive', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.css'), 'body {}');
  writeFileSync(join(dir, 'b.css'), 'body {}');
  writeFileSync(join(dir, 'c.css'), 'body { color: red }');
  assert.equal(hashFile(join(dir, 'a.css')), hashFile(join(dir, 'b.css')));
  assert.notEqual(hashFile(join(dir, 'a.css')), hashFile(join(dir, 'c.css')));
});

test('hashFile: ignores CRLF vs LF in text files', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.md'), '# Title\nline two\n');
  writeFileSync(join(dir, 'b.md'), '# Title\r\nline two\r\n');
  assert.equal(hashFile(join(dir, 'a.md')), hashFile(join(dir, 'b.md')));
});

test('hashTree: returns null for a directory that does not exist', () => {
  assert.equal(hashTree(join(scratch(), 'nope')), null);
});

test('hashTree: keys are forward-slash paths relative to the root', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'components'));
  writeFileSync(join(dir, 'SKILL.md'), 'front matter');
  writeFileSync(join(dir, 'components', 'button.md'), 'button');
  const hashes = hashTree(dir);
  assert.deepEqual([...hashes.keys()].sort(), ['SKILL.md', 'components/button.md']);
});

test('hashTree: two identical trees hash identically', () => {
  const one = scratch();
  const two = scratch();
  for (const dir of [one, two]) {
    mkdirSync(join(dir, 'components'));
    writeFileSync(join(dir, 'SKILL.md'), 'front matter');
    writeFileSync(join(dir, 'components', 'button.md'), 'button');
  }
  assert.deepEqual([...hashTree(one).entries()], [...hashTree(two).entries()]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/io.test.mjs`
Expected: FAIL — `hashFile`/`hashTree` are not exported from `io.mjs`.

- [ ] **Step 3: Write the implementation**

Append to `scripts/lib/io.mjs`. Its existing imports already cover everything
used below (`existsSync`, `readFileSync`, `readdirSync`, `join`, `basename`);
the only new one is `node:crypto`, which goes at the top of the file:

```javascript
import { createHash } from 'node:crypto';

// Text extensions get CRLF-normalised before hashing. Without this a Windows
// working tree reads as drift against the same bytes checked out on the Linux
// runner, and the guardrail cries wolf on every PR.
const TEXT_EXTENSIONS = new Set(['.md', '.css', '.json', '.txt', '.js', '.mjs', '.svg', '.html', '.yml', '.yaml']);

export function hashFile(path) {
  if (!existsSync(path)) return null;
  const dot = basename(path).lastIndexOf('.');
  const ext = dot === -1 ? '' : basename(path).slice(dot).toLowerCase();
  let bytes = readFileSync(path);
  if (TEXT_EXTENSIONS.has(ext)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

// Map of path-relative-to-dir (forward slashes, so the two platforms agree)
// → content hash. null when the directory is absent, which both callers treat
// as "not present" rather than as an error.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/io.test.mjs`
Expected: PASS, six tests.

- [ ] **Step 5: Write the CLI wrapper**

Create `scripts/check-design-system-sync.mjs`:

```javascript
#!/usr/bin/env node
// WordPress: fails if the plugin's copy of the shared blueworx-admin-design
// system has drifted from the copy committed in the foundation. CI already
// checks the foundation out into .foundation, so this is a local comparison.
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

const result = designSystemSync({
  foundationFiles: hashTree(join(foundationDir, skillPath)),
  pluginFiles: hashTree(skillPath),
  canonicalCss: hashFile(join(foundationDir, skillPath, 'styles.css')),
  shippedCss: hashFile(cssPath),
  skillPath,
  cssPath,
});

console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nDESIGN_SYSTEM_SYNC=warn — reporting this as a warning, not a failure. Remove that setting once the plugin is caught up.');
  process.exit(0);
}
process.exit(1);
```

- [ ] **Step 6: Verify the CLI end to end against real directories**

```bash
rm -rf /tmp/ds && mkdir -p /tmp/ds/plugin/assets /tmp/ds/plugin/.foundation/.claude/skills/blueworx-admin-design /tmp/ds/plugin/.claude/skills/blueworx-admin-design
printf 'front matter\n' > /tmp/ds/plugin/.foundation/.claude/skills/blueworx-admin-design/SKILL.md
printf 'body{}\n'       > /tmp/ds/plugin/.foundation/.claude/skills/blueworx-admin-design/styles.css
cp /tmp/ds/plugin/.foundation/.claude/skills/blueworx-admin-design/* /tmp/ds/plugin/.claude/skills/blueworx-admin-design/
cp /tmp/ds/plugin/.foundation/.claude/skills/blueworx-admin-design/styles.css /tmp/ds/plugin/assets/blueworx-admin-design.css

cd /tmp/ds/plugin && node "$OLDPWD/scripts/check-design-system-sync.mjs"; echo "exit=$?"
# Expected: "... match the foundation." and exit=0

printf 'stale\n' > /tmp/ds/plugin/assets/blueworx-admin-design.css
node "$OLDPWD/scripts/check-design-system-sync.mjs"; echo "exit=$?"
# Expected: lists assets/blueworx-admin-design.css as differing, prints the fix, exit=1

DESIGN_SYSTEM_SYNC=warn node "$OLDPWD/scripts/check-design-system-sync.mjs"; echo "exit=$?"
# Expected: same report, exit=0
```

- [ ] **Step 7: Syntax-check every script the way foundation CI does**

Run: `for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f"; done`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/io.mjs scripts/lib/io.test.mjs scripts/check-design-system-sync.mjs
git commit -m "Add the design system sync check script"
```

---

### Task 3: Run it on every plugin PR, and document the copy

**Files:**
- Modify: `.github/workflows/ci-wordpress.yml` (new input after `changelog_dir`
  at line 118, new step in the `static` job after the plugin version sync step
  at line 261-262)
- Modify: `docs/starter-prompt-wordpress-plugin.md` (document the shipped CSS
  path and the sync rule)
- Modify: `CLAUDE.md.template` (state the shipped CSS path in the design system
  section)
- Modify: `README.md` (mention the guardrail in the CI guardrails list)

**Interfaces:**
- Consumes: `scripts/check-design-system-sync.mjs` from Task 2.
- Produces: a `design_system_sync` workflow input (`error` | `warn` | `off`,
  default `error`) that consumer repos set in their caller workflow.

- [ ] **Step 1: Add the workflow input**

In `.github/workflows/ci-wordpress.yml`, directly after the `changelog_dir`
input block (ends line 119) and before `foundation_ref`:

```yaml
      design_system_sync:
        description: >-
          Whether a plugin whose copy of the shared blueworx-admin-design system
          has drifted fails the run. `error` (default) fails, `warn` prints the
          report and passes, `off` skips the check. Use `warn` only while a
          plugin catches up mid-feature — a plugin left on it is quietly
          shipping a different admin UI from every other plugin.
        type: string
        default: error
```

- [ ] **Step 2: Add the step to the `static` job**

In the same file, directly after the "Plugin version sync (header vs
package.json)" step (line 261-262):

```yaml
      - name: Design system sync (shared admin UI)
        env:
          DESIGN_SYSTEM_SYNC: ${{ inputs.design_system_sync }}
          FOUNDATION_DIR: .foundation
        run: node "$GITHUB_WORKSPACE/.foundation/scripts/check-design-system-sync.mjs"
```

- [ ] **Step 3: Verify the workflow still parses**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/ci-wordpress.yml','utf8');
const i=s.indexOf('design_system_sync');
if(i===-1)throw new Error('input missing');
if(!s.includes('check-design-system-sync.mjs'))throw new Error('step missing');
console.log('workflow references both the input and the script');"
```
Expected: `workflow references both the input and the script`

Then confirm GitHub accepts it by pushing the branch and opening the PR — the
foundation's own CI parses the file. A YAML error surfaces there immediately.

- [ ] **Step 4: Document the shipped stylesheet in the starter prompt**

In `docs/starter-prompt-wordpress-plugin.md`, in the bullet that begins
"**Admin screens come from the shared `blueworx-admin-design` system**",
replace the sentence "Also copy its `styles.css` into `assets/` and enqueue it
on the plugin's admin pages" with:

```markdown
  Also copy its `styles.css` to `assets/blueworx-admin-design.css` — that exact
  path — and enqueue it on the plugin's admin pages. CI compares both copies
  against the foundation on every pull request and fails the run if either has
  drifted, so keep them verbatim: no minifying, no local tweaks.
```

- [ ] **Step 5: Document it in the template**

In `CLAUDE.md.template`, in the WordPress Admin Design System section, replace
the bullet beginning "The plugin also **ships**" with:

```markdown
- The plugin also **ships** the design system's `styles.css` as
  `assets/blueworx-admin-design.css` — that exact path — and enqueues it on its
  admin pages. There is no shared runtime package, because two of our plugins on
  one site can be at different versions.
- **CI fails the PR if either copy has drifted** from the foundation. The fix is
  always to re-pull, never to edit the copy here — the failure message prints
  the commands.
```

- [ ] **Step 6: Add it to the README's guardrail list**

In `README.md`, in the sentence listing what the shared workflow checks on every
pull request, add the design system check to the list — after the dependency
check and before PHPCS:

```markdown
checks the plugin's copy of the shared admin design system is current,
```

- [ ] **Step 7: Run the full foundation test suite**

Run:
```bash
node --test scripts/lib/*.test.mjs
for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f"; done
```
Expected: all tests pass, no syntax errors.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci-wordpress.yml docs/starter-prompt-wordpress-plugin.md CLAUDE.md.template README.md
git commit -m "Fail a plugin PR when its copy of the admin design system has drifted"
```

---

## After the plan

The check passes harmlessly until two things exist: the design system folder
committed at `.claude/skills/blueworx-admin-design/` in this repo, and a plugin
that has adopted it. Those are the remaining manual steps, in order:

1. Unzip the Claude Design export into `.claude/skills/blueworx-admin-design/`
   here and commit it.
2. Tell Claude Design the repo and path so its Sync targets them.
3. Adopt it in one plugin — pull the folder, copy the stylesheet to
   `assets/blueworx-admin-design.css`, enqueue it, rebuild one settings page
   from the skill. That plugin proves the loop end to end.
