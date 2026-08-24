# Admin UI Adherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible to merge — or, in a Claude Code session, to write — a WordPress plugin admin screen that isn't built from the shared `blueworx-admin-design` system.

**Architecture:** A pure rules engine in `scripts/lib/` that reads its allowlists out of the design system a plugin already carries, wrapped by one CLI. The CLI runs twice: as a step in the reusable WordPress CI workflow over the files a PR changed, and as a Claude Code `PreToolUse` hook over the content of a pending Write/Edit. Same rules, same messages, both times.

**Tech Stack:** Node 20 ESM, `node:test` + `node:assert/strict` (no test framework, no new dependencies — the foundation has none and `approved-deps.json` governs). GitHub Actions reusable workflow. Claude Code hooks.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-ui-adherence-design.md` — read it before starting. It carries the reasoning; this plan carries the steps.

## Global Constraints

- **No new dependencies.** Node standard library only. The foundation ships zero runtime deps and its own CI enforces `approved-deps.json` on consumers.
- **Pure logic in `scripts/lib/`, I/O in `scripts/*.mjs`.** Every existing guardrail follows this split and it is what makes them testable. Pure functions take strings and objects; never read a file inside `scripts/lib/`.
- **Check contract:** every check function returns `{ ok: boolean, message: string }`, plus `problems: Array` here, as `designSystemSync` already does.
- **LF line endings, no trailing whitespace, two-space JSON.** `.gitattributes` governs; `hashFile()` normalises CRLF before hashing so a Windows working tree does not read as drift.
- **A plugin that has not adopted the design system passes every new check.** The same rule `designSystemSync` follows — otherwise this breaks every repo the day it lands.
- **Copy rules for every message a person reads:** address the reader as "you", sentence case, one sentence, name the fix. No exclamation marks, no emoji. British English.
- **Modes on every new check:** `error` (default) / `warn` (print, pass) / `off` (skip), read from an environment variable, matching `DESIGN_SYSTEM_SYNC`.
- **`scripts/lib/*.test.mjs` is picked up automatically** by `foundation-ci.yml`'s `node --test scripts/lib/*.test.mjs` step. New test files need no wiring.

---

### Task 1: Design system vocabulary

The check must never hard-code a list of valid classes or tokens — the design system gains components over time and a hand-copied list goes stale silently. This reads the vocabulary out of the files the plugin already carries and CI already verifies.

**Files:**
- Create: `scripts/lib/design-system.mjs`
- Test: `scripts/lib/design-system.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseTokens(css: string) => Set<string>` — custom property names including the leading `--`.
  - `parseClasses(css: string) => Set<string>` — class names without the leading dot.
  - `parseComponents(manifest: object|null) => Set<string>` — component names from `_ds_manifest.json`.
  - `vocabulary({ css: string, manifest: object|null }) => { tokens: Set<string>, classes: Set<string>, components: Set<string> }`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/design-system.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens, parseClasses, parseComponents, vocabulary } from './design-system.mjs';

const CSS = [
  ':root{',
  '  --bw-brand: #4F46E5;',
  '  --bw-space-3: 12px;',
  '}',
  '.bw-btn{ background: var(--bw-brand); }',
  '.bw-btn--primary{ color: #fff; }',
  '.bw-card .bw-card__head{ border-bottom: 1px solid var(--bw-border); }',
].join('\n');

test('parseTokens: finds every custom property, ignores var() uses', () => {
  const tokens = parseTokens(CSS);
  assert.equal(tokens.has('--bw-brand'), true);
  assert.equal(tokens.has('--bw-space-3'), true);
  assert.equal(tokens.has('--bw-border'), false);
});

test('parseClasses: finds classes including modifiers and nested selectors', () => {
  const classes = parseClasses(CSS);
  assert.equal(classes.has('bw-btn'), true);
  assert.equal(classes.has('bw-btn--primary'), true);
  assert.equal(classes.has('bw-card__head'), true);
});

test('parseClasses: does not mistake decimals for classes', () => {
  assert.equal(parseClasses('.bw-x{ opacity: .05; transition: .2s ease; }').has('05'), false);
});

test('parseComponents: reads names from the manifest, tolerates a missing one', () => {
  const names = parseComponents({ components: [{ name: 'Button' }, { name: 'Notice' }] });
  assert.equal(names.has('Button'), true);
  assert.equal(names.has('Notice'), true);
  assert.equal(parseComponents(null).size, 0);
});

test('vocabulary: bundles all three', () => {
  const v = vocabulary({ css: CSS, manifest: { components: [{ name: 'Button' }] } });
  assert.equal(v.tokens.has('--bw-brand'), true);
  assert.equal(v.classes.has('bw-btn'), true);
  assert.equal(v.components.has('Button'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/design-system.test.mjs`
Expected: FAIL — `Cannot find module './design-system.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/design-system.mjs`:

```js
// The design system's own vocabulary, read out of the files a plugin already
// carries. The adherence check never hard-codes a list of valid classes or
// tokens: the system gains components over time, and a hand-copied list goes
// stale without anyone noticing. Pure — the CLI does the reading.

// `--bw-brand: #4F46E5;` -> '--bw-brand'. Declarations only; a var() use is
// not a declaration and must not widen the allowlist.
export function parseTokens(css) {
  const out = new Set();
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) out.add(m[1]);
  return out;
}

// `.bw-btn--primary{` -> 'bw-btn--primary'. Requires a letter or underscore
// after the dot, so `.05` and `.2s` in a value are not read as classes.
export function parseClasses(css) {
  const out = new Set();
  for (const m of css.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)) out.add(m[1]);
  return out;
}

export function parseComponents(manifest) {
  const out = new Set();
  for (const c of manifest?.components ?? []) {
    if (c?.name) out.add(c.name);
  }
  return out;
}

export function vocabulary({ css, manifest }) {
  return {
    tokens: parseTokens(css),
    classes: parseClasses(css),
    components: parseComponents(manifest),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/design-system.test.mjs`
Expected: PASS, 5 tests.

Then prove it against the real system — write a throwaway script in the scratchpad that reads `.claude/skills/blueworx-admin-design/styles.css` and `_ds_manifest.json`, builds the vocabulary and prints the three sizes.
Expected: roughly 126 tokens, 255+ classes, 50+ components. If any count is 0 the parser is wrong — fix it before moving on.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/design-system.mjs scripts/lib/design-system.test.mjs
git commit -m "Read the design system's own class and token names"
```

---

### Task 2: Which changed files are admin screens

Decided by what a file contains, not by which folder it sits in, so a plugin that lays itself out differently cannot slip past the check.

**Files:**
- Create: `scripts/lib/admin-ui.mjs`
- Test: `scripts/lib/admin-ui.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1 yet.
- Produces:
  - `normalisePath(path: string) => string` — forward slashes, no leading `./`.
  - `adminAssetPaths(phpFiles: Array<{ path: string, content: string }>) => Set<string>` — repo-relative asset paths a plugin enqueues on admin screens.
  - `classifyAdminFile({ path: string, content: string, adminAssets?: Set<string> }) => 'php' | 'jsx' | 'css' | null`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/admin-ui.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAssetPaths, classifyAdminFile } from './admin-ui.mjs';

test('adminAssetPaths: collects assets enqueued beside an admin hook', () => {
  const paths = adminAssetPaths([
    {
      path: 'includes/class-admin.php',
      content: [
        "add_action( 'admin_enqueue_scripts', [ $this, 'assets' ] );",
        "wp_enqueue_style( 'bw-admin', PLUGIN_URL . 'assets/blueworx-admin-design.css', [], V );",
        "wp_enqueue_style( 'my-admin', PLUGIN_URL . 'assets/css/admin.css', [], V );",
      ].join('\n'),
    },
    {
      path: 'includes/class-public.php',
      content: [
        "add_action( 'wp_enqueue_scripts', [ $this, 'assets' ] );",
        "wp_enqueue_style( 'front', PLUGIN_URL . 'assets/css/public.css', [], V );",
      ].join('\n'),
    },
  ]);
  assert.equal(paths.has('assets/css/admin.css'), true);
  assert.equal(paths.has('assets/css/public.css'), false);
});

test('classifyAdminFile: PHP that registers or renders an admin page', () => {
  assert.equal(classifyAdminFile({ path: 'includes/menu.php', content: "add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );" }), 'php');
  assert.equal(classifyAdminFile({ path: 'views/screen.php', content: '<div class="wrap bw-wrap">' }), 'php');
  assert.equal(classifyAdminFile({ path: 'includes/shortcode.php', content: "add_shortcode( 'x', 'render' );" }), null);
});

test('classifyAdminFile: JSX that imports the system or uses its classes', () => {
  assert.equal(classifyAdminFile({ path: 'src/Settings.jsx', content: "import { Button } from '../.claude/skills/blueworx-admin-design/components/core/Button.jsx';" }), 'jsx');
  assert.equal(classifyAdminFile({ path: 'src/Panel.jsx', content: '<div className="bw-card" />' }), 'jsx');
  assert.equal(classifyAdminFile({ path: 'src/Front.jsx', content: '<div className="hero" />' }), null);
});

test('classifyAdminFile: CSS only when the plugin enqueues it on an admin screen', () => {
  const adminAssets = new Set(['assets/css/admin.css']);
  assert.equal(classifyAdminFile({ path: 'assets/css/admin.css', content: '.x{}', adminAssets }), 'css');
  assert.equal(classifyAdminFile({ path: 'assets/css/public.css', content: '.x{}', adminAssets }), null);
});

test('classifyAdminFile: the design system itself is never judged against itself', () => {
  assert.equal(
    classifyAdminFile({ path: '.claude/skills/blueworx-admin-design/components/core/Button.jsx', content: '<button className="bw-btn" />' }),
    null,
  );
  assert.equal(
    classifyAdminFile({ path: 'assets/blueworx-admin-design.css', content: '.bw-btn{ color: #fff; }', adminAssets: new Set(['assets/blueworx-admin-design.css']) }),
    null,
  );
});

test('classifyAdminFile: Windows paths are normalised', () => {
  assert.equal(classifyAdminFile({ path: 'includes\\menu.php', content: 'add_menu_page(' }), 'php');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: FAIL — `Cannot find module './admin-ui.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/admin-ui.mjs`:

```js
// Which of a plugin's files are admin screens, and what is wrong with them.
// Pure: callers pass file contents in. Classification is by content rather
// than by folder name, because a plugin that lays itself out differently would
// otherwise escape the check entirely.

const ADMIN_PAGE_CALL = /\badd_(?:menu|submenu|options|management|theme|users|plugins|dashboard)_page\s*\(|\badd_settings_(?:section|field)\s*\(|\bregister_setting\s*\(/;
const ADMIN_HOOK = /\badmin_(?:enqueue_scripts|menu|init|notices)\b/;
const ADMIN_MARKUP = /class\s*=\s*["'][^"']*\b(?:wrap|bw-admin|bw-page)\b/;
const DS_IMPORT = /from\s+["'][^"']*blueworx-admin-design[^"']*["']/;
const BW_CLASS = /\bbw-[a-z]/;

const SKILL_DIR = '.claude/skills/blueworx-admin-design/';
const SHIPPED_CSS = 'assets/blueworx-admin-design.css';

export function normalisePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

// A plugin's admin CSS and JS is whatever it enqueues from a file that also
// wires up an admin hook. Tracing the actual callback would need a PHP parser;
// same-file is close enough, and it errs towards checking more rather than less.
export function adminAssetPaths(phpFiles) {
  const out = new Set();
  for (const { content } of phpFiles) {
    if (!/admin_enqueue_scripts/.test(content)) continue;
    for (const m of content.matchAll(/["']([^"']+\.(?:css|jsx?|tsx?))["']/g)) {
      out.add(normalisePath(m[1]));
    }
  }
  return out;
}

export function classifyAdminFile({ path, content, adminAssets = new Set() }) {
  const p = normalisePath(path);

  // The system is the standard; it is not a consumer of itself.
  if (p.includes(SKILL_DIR) || p === SHIPPED_CSS) return null;

  if (p.endsWith('.php')) {
    if (ADMIN_PAGE_CALL.test(content) || ADMIN_HOOK.test(content) || ADMIN_MARKUP.test(content)) return 'php';
    return null;
  }
  if (/\.(?:jsx|tsx)$/.test(p)) {
    if (DS_IMPORT.test(content) || BW_CLASS.test(content) || adminAssets.has(p)) return 'jsx';
    return null;
  }
  if (p.endsWith('.css')) {
    return adminAssets.has(p) ? 'css' : null;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/admin-ui.mjs scripts/lib/admin-ui.test.mjs
git commit -m "Spot which changed files are admin screens"
```

---

### Task 3: The rules that fail a screen

The hard rules. Each names a line a person can go and look at, and names the component to use instead.

**Files:**
- Modify: `scripts/lib/admin-ui.mjs`
- Modify: `scripts/lib/admin-ui.test.mjs`

**Interfaces:**
- Consumes: the vocabulary object from Task 1 (`{ tokens, classes, components }`).
- Produces: `findViolations({ path: string, kind: 'php'|'jsx'|'css', content: string, vocab: object, whole?: boolean }) => Array<{ path: string, line: number, rule: string, severity: 'error'|'warn', message: string }>`
- `whole` defaults to `true`. Task 7's hook passes `false` when it is looking at an edit fragment rather than a whole file.

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/admin-ui.test.mjs` — add `findViolations` to the existing import at the top of the file, then:

```js
const VOCAB = { tokens: new Set(['--bw-brand']), classes: new Set(['bw-btn', 'bw-card', 'bw-wrap', 'bw-icon']), components: new Set(['Button']) };
const rules = (problems) => problems.map((p) => p.rule);
const scan = (content, kind = 'php') => findViolations({ path: 'includes/screen.php', kind, content, vocab: VOCAB });

test('findViolations: a colour written by hand fails', () => {
  assert.equal(rules(scan('.bw-x{ color: #4F46E5; }', 'css')).includes('raw-color'), true);
  assert.equal(rules(scan('.bw-x{ color: rgb(10 12 41); }', 'css')).includes('raw-color'), true);
  assert.equal(rules(scan('.bw-x{ color: var(--bw-brand); }', 'css')).includes('raw-color'), false);
});

test('findViolations: an anchor fragment is not a colour', () => {
  assert.equal(rules(scan('<a class="bw-btn" href="#abc">Section</a>')).includes('raw-color'), false);
});

test('findViolations: a hand-written size fails, but not inside a breakpoint', () => {
  assert.equal(rules(scan('.bw-x{ padding: 24px; }', 'css')).includes('raw-size'), true);
  assert.equal(rules(scan('@media (min-width: 782px){', 'css')).includes('raw-size'), false);
  assert.equal(rules(scan('.bw-x{ padding: var(--bw-space-6); }', 'css')).includes('raw-size'), false);
});

test('findViolations: a hand-set font and shadow fail', () => {
  assert.equal(rules(scan('.bw-x{ font-family: Arial, sans-serif; }', 'css')).includes('raw-font'), true);
  assert.equal(rules(scan('.bw-x{ font-family: var(--bw-font-sans); }', 'css')).includes('raw-font'), false);
  assert.equal(rules(scan('.bw-x{ box-shadow: 0 1px 2px rgb(0 0 0 / .1); }', 'css')).includes('raw-shadow'), true);
  assert.equal(rules(scan('.bw-x{ box-shadow: none; }', 'css')).includes('raw-shadow'), false);
});

test('findViolations: inline style fails in markup and in JSX', () => {
  assert.equal(rules(scan('<div class="bw-card" style="margin-top:8px">')).includes('inline-style'), true);
  assert.equal(rules(scan('<div className="bw-card" style={{ marginTop: 8 }} />', 'jsx')).includes('inline-style'), true);
});

test('findViolations: a hand-drawn icon fails', () => {
  assert.equal(rules(scan('<div class="bw-card"><svg viewBox="0 0 24 24"></svg></div>')).includes('hand-svg'), true);
  assert.equal(rules(scan('<i class="bw-icon" data-lucide="settings"></i>')).includes('hand-svg'), false);
});

test('findViolations: WordPress core classes fail and name the replacement', () => {
  const problems = scan('<table class="form-table">');
  assert.equal(rules(problems).includes('wp-core-class'), true);
  assert.match(problems.find((p) => p.rule === 'wp-core-class').message, /FormRow/);
  assert.match(scan('<button class="button button-primary">Save</button>').find((p) => p.rule === 'wp-core-class').message, /Button/);
  assert.match(scan('<div class="notice notice-error"><p>No</p></div>').find((p) => p.rule === 'wp-core-class').message, /Notice/);
});

test('findViolations: an invented bw- class fails, a real one passes', () => {
  assert.equal(rules(scan('<div class="bw-card">')).includes('unknown-bw-class'), false);
  assert.equal(rules(scan('<div class="bw-superpanel">')).includes('unknown-bw-class'), true);
});

test('findViolations: a class built from a variable is left alone', () => {
  assert.equal(rules(scan('<div className={`bw-btn bw-btn--${variant}`} />', 'jsx')).includes('unknown-bw-class'), false);
});

test('findViolations: every problem carries a line number a person can open', () => {
  const problems = scan('<div class="bw-card">\n<table class="form-table">');
  assert.equal(problems.find((p) => p.rule === 'wp-core-class').line, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: FAIL — `findViolations` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/lib/admin-ui.mjs`:

```js
// WordPress core classes the design system exists to replace, and what to use
// instead. Deliberately specific — a bare `button` is far too common in real
// markup to flag, but `button-primary` is unambiguous.
const WP_CORE_CLASSES = {
  'button-primary': 'Button',
  'button-secondary': 'Button',
  'form-table': 'FormRow',
  'wp-list-table': 'DataTable',
  postbox: 'Card',
  'nav-tab': 'Tabs',
  'notice-success': 'Notice',
  'notice-error': 'Notice',
  'notice-warning': 'Notice',
  'notice-info': 'Notice',
};

// Three, six or eight hex digits, and not the fragment part of a link.
const HEX_COLOUR = /(?<!href\s*=\s*["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
const FUNCTION_COLOUR = /\b(?:rgba?|hsla?)\s*\(/;
const RAW_PX = /\b\d+px\b/;
const USES_TOKEN = /var\(\s*--/;

export function findViolations({ path, kind, content, vocab, whole = true }) {
  const p = normalisePath(path);
  const problems = [];
  const lines = content.split(/\r?\n/);
  const add = (index, rule, severity, message) =>
    problems.push({ path: p, line: index + 1, rule, severity, message });

  lines.forEach((line, i) => {
    // A breakpoint is a fact about the viewport, not a design decision, so px
    // is the only sensible way to write one.
    const inBreakpoint = /@media\b/.test(line);

    if (HEX_COLOUR.test(line) || (FUNCTION_COLOUR.test(line) && !USES_TOKEN.test(line))) {
      add(i, 'raw-color', 'error', 'You have written a colour by hand — use a design system colour token, such as var(--bw-brand).');
    }
    if (!inBreakpoint && RAW_PX.test(line) && !USES_TOKEN.test(line)) {
      add(i, 'raw-size', 'error', 'You have written a size by hand — use a design system spacing or control token.');
    }
    if (/font-family\s*:/.test(line) && !/var\(\s*--bw-font/.test(line)) {
      add(i, 'raw-font', 'error', 'You have set a font by hand — the system provides Sora and Inter through var(--bw-font-…).');
    }
    if (/box-shadow\s*:/.test(line) && !USES_TOKEN.test(line) && !/box-shadow\s*:\s*none/.test(line)) {
      add(i, 'raw-shadow', 'error', 'You have written a shadow by hand — use a design system shadow token.');
    }
    if (/\bstyle\s*=\s*["']/.test(line) || /\bstyle\s*=\s*\{\{/.test(line)) {
      add(i, 'inline-style', 'error', 'This element carries an inline style — put the styling on a design system class instead.');
    }
    if (/<svg\b/i.test(line)) {
      add(i, 'hand-svg', 'error', 'This is a hand-drawn icon — use the Icon component in React, or an i element with class bw-icon and a data-lucide name in PHP.');
    }
    for (const [wpClass, component] of Object.entries(WP_CORE_CLASSES)) {
      if (new RegExp(`\\b${wpClass}\\b`).test(line)) {
        add(i, 'wp-core-class', 'error', `This uses the WordPress core class "${wpClass}" — use the design system's ${component} instead.`);
      }
    }
    for (const cls of literalBwClasses(line)) {
      if (!vocab.classes.has(cls)) {
        add(i, 'unknown-bw-class', 'error', `"${cls}" is not a class in the design system — add the pattern to the system first, then use it here.`);
      }
    }
  });

  return problems;
}

// Only classes written out in full. A class assembled from a variable cannot be
// checked against the vocabulary, and guessing at it would fail good code.
function literalBwClasses(line) {
  const out = [];
  for (const m of line.matchAll(/class(?:Name)?\s*=\s*["']([^"']*)["']/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls.startsWith('bw-') && !/[${}<>]/.test(cls)) out.push(cls);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/admin-ui.mjs scripts/lib/admin-ui.test.mjs
git commit -m "Fail the things a design system exists to stop"
```

---

### Task 4: The two structural rules

A stray admin stylesheet, and a screen with no design system in it at all. The second is the fuzzy one, so it ships as a warning.

**Files:**
- Modify: `scripts/lib/admin-ui.mjs`
- Modify: `scripts/lib/admin-ui.test.mjs`

**Interfaces:**
- Consumes: `findViolations()` from Task 3 — this extends it; the signature does not change.
- Produces: two more rule names in the same array — `stray-admin-css` (severity `error`) and `no-bw-class` (severity `warn`).

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/admin-ui.test.mjs`:

```js
test('findViolations: a plugin admin stylesheet may only hold the documented chrome overrides', () => {
  const allowed = [
    '.wrap.bw-wrap { margin: 0; }',
    'body.toplevel_page_x #wpcontent { padding-left: 0; }',
    'body.toplevel_page_x #wpbody-content { padding-bottom: 0; }',
    'body.toplevel_page_x #wpfooter { display: none; }',
  ].join('\n');
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: allowed, vocab: VOCAB })).includes('stray-admin-css'),
    false,
  );
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: '.my-settings-panel { border: 0; }', vocab: VOCAB })).includes('stray-admin-css'),
    true,
  );
});

test('findViolations: a screen with no design system classes at all is a warning', () => {
  const problems = findViolations({ path: 'includes/screen.php', kind: 'php', content: '<div class="settings"><table class="widefat"></table></div>', vocab: VOCAB });
  const bare = problems.find((p) => p.rule === 'no-bw-class');
  assert.ok(bare);
  assert.equal(bare.severity, 'warn');
});

test('findViolations: a screen that uses the system does not warn', () => {
  assert.equal(
    rules(findViolations({ path: 'includes/screen.php', kind: 'php', content: '<div class="bw-card"></div>', vocab: VOCAB })).includes('no-bw-class'),
    false,
  );
});

test('findViolations: no-bw-class never fires on an edit fragment', () => {
  assert.equal(
    rules(findViolations({ path: 'includes/screen.php', kind: 'php', content: '<div class="settings">', vocab: VOCAB, whole: false })).includes('no-bw-class'),
    false,
  );
});

test('findViolations: markup with no classes at all does not warn', () => {
  assert.equal(
    rules(findViolations({ path: 'includes/menu.php', kind: 'php', content: "add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );", vocab: VOCAB })).includes('no-bw-class'),
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: FAIL — the assertions about `stray-admin-css` and `no-bw-class`.

- [ ] **Step 3: Write minimal implementation**

Add this constant beside the others at the top of `scripts/lib/admin-ui.mjs`:

```js
// The only styling a plugin may keep of its own: the chrome overrides the
// system's readme documents for a full-bleed screen. Anything else in an admin
// stylesheet is a second design system growing beside the first.
const ALLOWED_ADMIN_SELECTORS = [
  /\.wrap\b/,
  /#wpcontent\b/,
  /#wpbody-content\b/,
  /#wpfooter\b/,
  /#wpadminbar\b/,
];
```

and insert these two blocks in `findViolations`, immediately before `return problems;`:

```js
  if (kind === 'css') {
    lines.forEach((line, i) => {
      const selector = line.match(/^([^{}]+)\{/);
      if (!selector) return;
      const text = selector[1].trim();
      if (!text || text.startsWith('@') || text.startsWith('/*')) return;
      if (ALLOWED_ADMIN_SELECTORS.some((re) => re.test(text))) return;
      add(i, 'stray-admin-css', 'error', `"${text}" belongs in the design system, not in a plugin stylesheet — the only styling a plugin keeps of its own is the documented full-bleed chrome overrides.`);
    });
  }

  // The catch-all for a screen built from scratch. It is the one rule that
  // reasons about a whole file rather than a line, so it never runs on an edit
  // fragment, and it is a warning until it has proved itself on a real plugin.
  if (whole && kind !== 'css' && /class(?:Name)?\s*=/.test(content) && !BW_CLASS.test(content)) {
    add(0, 'no-bw-class', 'warn', 'This admin screen uses none of the design system — build it from the system\'s components rather than from scratch.');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/admin-ui.mjs scripts/lib/admin-ui.test.mjs
git commit -m "Catch a stray stylesheet and a screen built from scratch"
```

---

### Task 5: The check itself

The aggregator that turns a list of changed files into the `{ ok, message }` every guardrail in this repo returns.

**Files:**
- Modify: `scripts/lib/checks.mjs` — add an import at the top, append the function at the end after `designSystemSync`
- Modify: `scripts/lib/checks.test.mjs` — add `adminUiAdherence` to the existing import block, append tests

**Interfaces:**
- Consumes: `classifyAdminFile()` and `findViolations()` from `./admin-ui.mjs`; the vocabulary shape from Task 1.
- Produces: `adminUiAdherence({ files, vocab, adminAssets?, promoteWarnings? }) => { ok: boolean, problems: Array, message: string }`
  - `files`: `Array<{ path: string, content: string }>` — already narrowed to the diff by the caller.
  - `vocab`: the `vocabulary()` object, or `null` when the plugin has no design system.
  - `adminAssets`: `Set<string>`, defaults to empty.
  - `promoteWarnings`: `false` by default; `true` turns `warn` problems into failures, for when the fuzzy rule has earned it.

- [ ] **Step 1: Write the failing test**

Add `adminUiAdherence` to the import block at the top of `scripts/lib/checks.test.mjs`, then append:

```js
const DS_VOCAB = { tokens: new Set(['--bw-brand']), classes: new Set(['bw-card', 'bw-btn']), components: new Set(['Button']) };
const SCREEN = 'add_menu_page( "X", "X", "manage_options", "x", "render" );';

test('adminUiAdherence: a plugin with no design system is skipped', () => {
  const r = adminUiAdherence({ files: [{ path: 'includes/screen.php', content: '<table class="form-table">' }], vocab: null });
  assert.equal(r.ok, true);
  assert.match(r.message, /no blueworx-admin-design/);
});

test('adminUiAdherence: a conforming screen passes', () => {
  const r = adminUiAdherence({
    files: [{ path: 'includes/screen.php', content: `${SCREEN}\n<div class="bw-card"><button class="bw-btn">Save changes</button></div>` }],
    vocab: DS_VOCAB,
  });
  assert.equal(r.ok, true);
});

test('adminUiAdherence: a non-conforming screen fails and names file and line', () => {
  const r = adminUiAdherence({
    files: [{ path: 'includes/screen.php', content: `${SCREEN}\n<div class="bw-card" style="color:#333">Hi</div>` }],
    vocab: DS_VOCAB,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /includes\/screen\.php:2/);
});

test('adminUiAdherence: a changed file that is not an admin screen is ignored', () => {
  const r = adminUiAdherence({
    files: [{ path: 'includes/public.php', content: '<div class="hero" style="color:#333">Hi</div>' }],
    vocab: DS_VOCAB,
  });
  assert.equal(r.ok, true);
});

test('adminUiAdherence: warnings print but do not fail, unless promoted', () => {
  const files = [{ path: 'includes/screen.php', content: `${SCREEN}\n<div class="plain">Hi</div>` }];
  const soft = adminUiAdherence({ files, vocab: DS_VOCAB });
  assert.equal(soft.ok, true);
  assert.match(soft.message, /warning/i);
  assert.equal(adminUiAdherence({ files, vocab: DS_VOCAB, promoteWarnings: true }).ok, false);
});

test('adminUiAdherence: an empty diff passes', () => {
  assert.equal(adminUiAdherence({ files: [], vocab: DS_VOCAB }).ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: FAIL — `adminUiAdherence` is not exported by `./checks.mjs`.

- [ ] **Step 3: Write minimal implementation**

At the top of `scripts/lib/checks.mjs`, beside the existing `semver.mjs` import:

```js
import { classifyAdminFile, findViolations } from './admin-ui.mjs';
```

At the end of `scripts/lib/checks.mjs`:

```js
// Fails when an admin screen this PR touches is not built from the shared
// blueworx-admin-design system. Only the files in the diff are judged, so a
// plugin adopts the system screen by screen and an untouched legacy screen is
// left alone until somebody works on it.
export function adminUiAdherence({ files, vocab, adminAssets = new Set(), promoteWarnings = false }) {
  if (!vocab) {
    return { ok: true, problems: [], message: 'Admin UI adherence: this plugin has no blueworx-admin-design system — skipping.' };
  }

  const problems = [];
  let screens = 0;
  for (const { path, content } of files) {
    const kind = classifyAdminFile({ path, content, adminAssets });
    if (!kind) continue;
    screens += 1;
    problems.push(...findViolations({ path, kind, content, vocab }));
  }

  const errors = problems.filter((p) => p.severity === 'error' || promoteWarnings);
  const warnings = promoteWarnings ? [] : problems.filter((p) => p.severity === 'warn');

  if (errors.length === 0 && warnings.length === 0) {
    return {
      ok: true,
      problems,
      message: `Admin UI adherence: ${screens} admin screen(s) changed, all built from the design system.`,
    };
  }

  const lines = [];
  if (errors.length > 0) {
    lines.push(`Admin UI adherence: ${errors.length} problem(s) in the admin screens this PR changes.`, '');
    for (const p of errors) lines.push(`  ${p.path}:${p.line} — ${p.message}`);
  }
  if (warnings.length > 0) {
    lines.push('', `${warnings.length} warning(s):`);
    for (const p of warnings) lines.push(`  ${p.path}:${p.line} — ${p.message}`);
  }
  lines.push(
    '',
    'Every admin screen is built from the shared design system. Invoke the',
    'blueworx-admin-design skill and take the pattern from there. If the system',
    'has no pattern for what you need, add it to the system in the foundation',
    'first, then build the screen on it.',
  );

  return { ok: errors.length === 0, problems, message: lines.join('\n') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: PASS — the whole existing suite plus 6 new tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/checks.mjs scripts/lib/checks.test.mjs
git commit -m "Turn the admin UI rules into a guardrail check"
```

---

### Task 6: The command line check

The I/O half: read the diff, read the plugin, run the check, print, exit.

**Files:**
- Create: `scripts/check-admin-ui-adherence.mjs`
- Modify: `scripts/lib/io.mjs` — add `readTextFiles`, extend the `node:path` import
- Modify: `scripts/lib/io.test.mjs` — test it

**Interfaces:**
- Consumes: `adminUiAdherence()` from Task 5, `vocabulary()` from Task 1, `adminAssetPaths()` from Task 2, and `gitChangedFiles()` / `readJson()` which already exist in `io.mjs`.
- Produces:
  - `readTextFiles(cwd: string, extensions: string[], maxDepth?: number) => Array<{ path: string, content: string }>` — repo-relative forward-slash paths, using the existing `walk()` and its skip list (`node_modules`, `.git`, `vendor`, `.foundation`, `.wp-test`).
  - `scripts/check-admin-ui-adherence.mjs`, reading `ADMIN_UI_ADHERENCE`, `BASE_REF`, `SKILL_PATH`, `PROMOTE_ADMIN_UI_WARNINGS`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/io.test.mjs`, following the temp-directory pattern already used in that file. If it has none, import `mkdtempSync`, `mkdirSync` and `writeFileSync` from `node:fs`, `tmpdir` from `node:os` and `join` from `node:path`:

```js
test('readTextFiles: returns repo-relative paths and skips vendored trees', () => {
  const dir = mkdtempSync(join(tmpdir(), 'io-test-'));
  mkdirSync(join(dir, 'includes'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(dir, 'includes', 'admin.php'), '<?php // admin');
  writeFileSync(join(dir, 'node_modules', 'x', 'ignore.php'), '<?php // vendored');

  const files = readTextFiles(dir, ['.php']);
  assert.deepEqual(files.map((f) => f.path), ['includes/admin.php']);
  assert.match(files[0].content, /admin/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/io.test.mjs`
Expected: FAIL — `readTextFiles is not a function`.

- [ ] **Step 3: Write minimal implementation**

Extend the path import at the top of `scripts/lib/io.mjs` to `import { join, basename, extname, relative } from 'node:path';` and add:

```js
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
```

Create `scripts/check-admin-ui-adherence.mjs`:

```js
#!/usr/bin/env node
// WordPress: fails if an admin screen this PR touches is not built from the
// shared blueworx-admin-design system. The rules are read out of the design
// system the plugin already carries, so they never go stale.
//
// Only the diff is judged — a plugin adopts the system screen by screen, and an
// untouched legacy screen is left alone until somebody works on it.
//
// ADMIN_UI_ADHERENCE=warn downgrades a failure to a printed warning (for a
// plugin catching up mid-feature); off skips it.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitChangedFiles, readJson, readTextFiles } from './lib/io.mjs';
import { vocabulary } from './lib/design-system.mjs';
import { adminAssetPaths } from './lib/admin-ui.mjs';
import { adminUiAdherence } from './lib/checks.mjs';

const mode = process.env.ADMIN_UI_ADHERENCE || 'error';
if (mode === 'off') {
  console.log('Admin UI adherence: skipped (ADMIN_UI_ADHERENCE=off).');
  process.exit(0);
}

const baseRef = process.env.BASE_REF;
if (!baseRef) {
  console.log('No BASE_REF set — admin UI adherence check skipped (not a PR context).');
  process.exit(0);
}

const skillPath = process.env.SKILL_PATH || '.claude/skills/blueworx-admin-design';
const cssFile = join(skillPath, 'styles.css');
const vocab = existsSync(cssFile)
  ? vocabulary({ css: readFileSync(cssFile, 'utf8'), manifest: readJson(join(skillPath, '_ds_manifest.json')) })
  : null;

const changed = gitChangedFiles(baseRef);
if (changed === null) {
  console.log('No base branch available to diff against — admin UI adherence check skipped.');
  process.exit(0);
}

// Read the plugin's PHP once, to learn which assets it puts on an admin screen.
// Classifying a changed CSS or JS file depends on knowing that.
const adminAssets = adminAssetPaths(readTextFiles('.', ['.php']));

const files = changed
  .filter((path) => /\.(?:php|jsx|tsx|css)$/i.test(path) && existsSync(path))
  .map((path) => ({ path, content: readFileSync(path, 'utf8') }));

const result = adminUiAdherence({
  files,
  vocab,
  adminAssets,
  promoteWarnings: process.env.PROMOTE_ADMIN_UI_WARNINGS === 'true',
});

console.log(result.message);
if (result.ok) process.exit(0);
if (mode === 'warn') {
  console.log('\nADMIN_UI_ADHERENCE=warn — reporting this as a warning, not a failure. Remove that setting once the plugin is caught up.');
  process.exit(0);
}
process.exit(1);
```

- [ ] **Step 4: Run the tests and prove the script runs**

Run: `node --test scripts/lib/*.test.mjs`
Expected: PASS, whole suite.

Run: `node --check scripts/check-admin-ui-adherence.mjs`
Expected: no output. This is the same syntax check `foundation-ci.yml` runs.

Run: `node scripts/check-admin-ui-adherence.mjs`
Expected: `No BASE_REF set — admin UI adherence check skipped (not a PR context).` and exit 0.

Run: `ADMIN_UI_ADHERENCE=off node scripts/check-admin-ui-adherence.mjs`
Expected: the skip line, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-admin-ui-adherence.mjs scripts/lib/io.mjs scripts/lib/io.test.mjs
git commit -m "Add the admin UI adherence check script"
```

---

### Task 7: The session hook

The half that stops a session designing away in the first place, so CI becomes the backstop rather than the place the problem is discovered.

**Files:**
- Create: `.claude/hooks/admin-ui-adherence.mjs`
- Modify: `.claude/settings.json`
- Modify: `docs/starter-prompt-wordpress-plugin.md` — the `curl` block that pulls `settings.json`

**Interfaces:**
- Consumes: `classifyAdminFile()`, `findViolations()`, `adminAssetPaths()` from `scripts/lib/admin-ui.mjs`; `vocabulary()` from `scripts/lib/design-system.mjs`; `readTextFiles()` and `readJson()` from `scripts/lib/io.mjs` — all resolved at run time from whichever foundation checkout is reachable.
- Produces: exit code 2 with the problems on stderr when a pending Write or Edit would put non-system markup into an admin screen; exit 0 and silence in every other case.

**Note for the implementer:** a hook that errors on a machine without a foundation checkout would break every edit in every repo. Exiting silently on "I cannot find the check" is a deliberate decision, not an oversight. Do not turn it into a warning.

- [ ] **Step 1: Write the fixtures that define the expected behaviour**

There is no harness for hook scripts in this repo and building one for a 40-line resolver is not worth it, so this task is verified by running the hook by hand. Fix the expected behaviour first by writing two fixtures in the scratchpad directory (not in the repo).

`hook-bad.json` — a Write that puts a WordPress core table into an admin screen:

```json
{"tool_name":"Write","tool_input":{"file_path":"includes/screen.php","content":"add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );\n<div class=\"bw-card\"><table class=\"form-table\"></table></div>"}}
```

`hook-good.json` — the same screen built from the system:

```json
{"tool_name":"Write","tool_input":{"file_path":"includes/screen.php","content":"add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );\n<div class=\"bw-card\"><button class=\"bw-btn\">Save changes</button></div>"}}
```

- [ ] **Step 2: Confirm there is nothing there yet**

Run the hook against `hook-bad.json` on stdin.
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Write minimal implementation**

Create `.claude/hooks/admin-ui-adherence.mjs`:

```js
#!/usr/bin/env node
// Claude Code PreToolUse hook: refuses a Write or Edit that would put markup
// into a WordPress admin screen that is not built from the shared
// blueworx-admin-design system. Same rules as the CI check, so a session finds
// out at the moment it writes the line rather than at the pull request.
//
// The rules live in the foundation. If no foundation checkout is reachable this
// exits silently: a missing guardrail must never break somebody's editing.

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const CANDIDATES = [
  process.env.BLUEWORX_FOUNDATION ? join(process.env.BLUEWORX_FOUNDATION, 'scripts') : null,
  '.foundation/scripts',
  '../bluegroup_core_foundation/scripts',
  '../../bluegroup_core_foundation/scripts',
].filter(Boolean);

const scripts = CANDIDATES.find((dir) => existsSync(join(dir, 'lib', 'admin-ui.mjs')));
if (!scripts) process.exit(0);

const load = (rel) => import(pathToFileURL(resolve(scripts, rel)).href);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const path = input?.tool_input?.file_path;
if (!path) process.exit(0);

// Write carries the whole file; Edit carries only the replacement text, which is
// a fragment — so the whole-file rules are held back for it.
const isWrite = input.tool_name === 'Write';
const pending = isWrite ? input?.tool_input?.content : input?.tool_input?.new_string;
if (typeof pending !== 'string' || pending === '') process.exit(0);

const skillDir = '.claude/skills/blueworx-admin-design';
const skillCss = join(skillDir, 'styles.css');
if (!existsSync(skillCss)) process.exit(0);

const { vocabulary } = await load('lib/design-system.mjs');
const { classifyAdminFile, findViolations, adminAssetPaths } = await load('lib/admin-ui.mjs');
const { readTextFiles, readJson } = await load('lib/io.mjs');

const vocab = vocabulary({
  css: readFileSync(skillCss, 'utf8'),
  manifest: readJson(join(skillDir, '_ds_manifest.json')),
});

// Classify on what the file will be: the pending content for a Write, and what
// is already on disk for an Edit fragment.
const forClassification = isWrite
  ? pending
  : (existsSync(path) ? readFileSync(path, 'utf8') : pending);

const kind = classifyAdminFile({
  path,
  content: forClassification,
  adminAssets: adminAssetPaths(readTextFiles('.', ['.php'])),
});
if (!kind) process.exit(0);

const problems = findViolations({ path, kind, content: pending, vocab, whole: isWrite })
  .filter((p) => p.severity === 'error');
if (problems.length === 0) process.exit(0);

console.error([
  'This admin screen is not built from the blueworx-admin-design system:',
  '',
  ...problems.map((p) => `  ${p.path}:${p.line} — ${p.message}`),
  '',
  'Invoke the blueworx-admin-design skill and take the pattern from there. If',
  'the system has no pattern for what you need, add it to the system in the',
  'foundation first, then build the screen on it.',
].join('\n'));
process.exit(2);
```

Add to `.claude/settings.json`, as a sibling of `permissions` and `skillOverrides`:

```json
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/admin-ui-adherence.mjs" }
        ]
      }
    ]
  }
```

In `docs/starter-prompt-wordpress-plugin.md`, immediately after the line that curls `.claude/settings.json`, add a `mkdir -p .claude/hooks` and a second `curl` pulling `.claude/hooks/admin-ui-adherence.mjs` from the same raw GitHub path, with one plain sentence above it: the hook stops a session writing an admin screen that isn't built from the design system, and it goes quiet on a machine with no foundation checkout beside the project.

- [ ] **Step 4: Run the hook by hand to verify every path**

From this repo, which has the design system and can see the foundation (itself):

Run the hook with `hook-bad.json` on stdin and echo the exit code.
Expected: the `form-table` problem on stderr naming `FormRow`, and exit code 2.

Run it with `hook-good.json`.
Expected: no output, exit 0.

Run it with `{}` on stdin.
Expected: no output, exit 0.

Then prove the silent fallback: copy the hook into a temp directory with no foundation anywhere near it and run it with `hook-bad.json`.
Expected: no output, exit 0. If it prints a module error the resolver is wrong — fix it before committing.

Finally, confirm in a live session that the hook does not interfere with ordinary editing: edit an unrelated file, such as a README, and check that the edit goes through with no hook output.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/admin-ui-adherence.mjs .claude/settings.json docs/starter-prompt-wordpress-plugin.md
git commit -m "Stop a session writing an off-system admin screen"
```

---

### Task 8: Wire it into WordPress CI

**Files:**
- Modify: `.github/workflows/ci-wordpress.yml` — the `inputs:` block beside `design_system_sync`, and the checks job immediately after the "Design system sync" step

**Interfaces:**
- Consumes: `scripts/check-admin-ui-adherence.mjs` from Task 6, called out of the already-checked-out `.foundation` directory.
- Produces: an `admin_ui_adherence` workflow input, default `error`.

- [ ] **Step 1: Add the input**

In the `inputs:` block, directly after `design_system_sync`:

```yaml
      admin_ui_adherence:
        description: >-
          Whether an admin screen this PR touches that is not built from the
          shared blueworx-admin-design system fails the run. `error` (default)
          fails, `warn` prints the report and passes, `off` skips the check.
          Use `warn` only while a plugin catches up mid-feature — a plugin left
          on it is quietly shipping a hand-rolled admin UI.
        type: string
        default: error
```

- [ ] **Step 2: Add the step**

Directly after the "Design system sync (shared admin UI)" step:

```yaml
      # The sync check above proves the plugin carries the design system. This
      # one proves the screens are built from it. Only files in the diff are
      # judged, so a plugin adopts the system screen by screen.
      - name: Admin UI adherence (screens built from the system)
        env:
          ADMIN_UI_ADHERENCE: ${{ inputs.admin_ui_adherence }}
          BASE_REF: ${{ github.base_ref }}
        run: node "$GITHUB_WORKSPACE/.foundation/scripts/check-admin-ui-adherence.mjs"
```

- [ ] **Step 3: Verify the workflow is wired and still parses**

Run a grep over `.github/workflows/ci-wordpress.yml` for `admin_ui_adherence` and `check-admin-ui-adherence`.
Expected: both present — the input and the step.

Then read the new step beside its neighbours and confirm the indentation matches exactly. A mis-indented step fails at parse time on the runner, not locally, so this is checked by eye here.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-wordpress.yml
git commit -m "Fail a plugin PR whose admin screens skip the design system"
```

---

### Task 9: Say so in the docs

The rule only works if the next session reads that it is now enforced rather than advised.

**Files:**
- Modify: `CLAUDE.md.template` — the Hard Guardrails list (around line 19), the skill table row for `blueworx-admin-design` (around line 114), the "Enforced vs model-driven" bullet (around line 127)
- Modify: `docs/starter-prompt-wordpress-plugin.md` — the admin screens bullet (around line 63)
- Modify: `README.md` — the `scripts/` description (around line 318)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Move it into the Hard Guardrails**

Add to the Hard Guardrails list in `CLAUDE.md.template`:

```markdown
- WordPress plugin admin screens this PR touches are built from the shared design system
```

- [ ] **Step 2: Correct the "no hooks" bullet**

It currently says there are deliberately no hooks, because the skill triggers fire on the *kind* of change, which a tool event cannot detect without misfiring. That reasoning still holds for the skills and does not hold for this check. Replace its final sentence with:

```markdown
There are deliberately no per-*skill* hooks: those triggers fire on the kind of change (a bug, a security-sensitive edit, a feature), which a tool event cannot detect without misfiring. There is one hook, and it is not a skill trigger — it refuses a Write or Edit that would put non-design-system markup into an admin screen, which is a plain fact about the file's contents.
```

- [ ] **Step 3: Update the skill table row and the starter prompt**

Append to the How column of the `blueworx-admin-design` table row: `CI and a Write/Edit hook both refuse a screen that isn't built from it.`

Add one sentence to the admin screens bullet in `docs/starter-prompt-wordpress-plugin.md`: the check refuses a colour, size, font, shadow or icon written by hand, WordPress core's own admin classes, an inline style, a second admin stylesheet, or a `bw-` class the system does not define.

- [ ] **Step 4: Update the README script list**

Add the new check to the parenthesised list in the `scripts/` bullet, beside "design system sync".

- [ ] **Step 5: Read every edit back against the house style**

Each one: under 150 words, sentence case, addresses the reader as "you", says what breaks rather than how it works, British English, and no identifier a reader does not have to act on.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md.template docs/starter-prompt-wordpress-plugin.md README.md
git commit -m "Record that admin screens are now enforced, not advised"
```

---

### Task 10: Flip the design system to code-owned

The spec's sync rules make code the source of truth. Three committed documents currently say the opposite, and the escape hatch every other task points at depends on this being settled.

**Files:**
- Modify: `CLAUDE.md.template` — add the sync rules as their own section; correct the flow line (around line 15), the "re-export" line (around line 96) and the authoring line (around line 97)
- Modify: `.claude/skills/blueworx-admin-design/github.md` — the export contract
- Modify: `.claude/skills/blueworx-admin-design/readme.md` — only if it repeats the same claim

**Interfaces:**
- Consumes: the "Claude Design ↔ code sync rules" section of the spec — copy it verbatim, it is Luke's own wording.
- Produces: nothing code depends on.

**Note for the implementer:** editing anything under `.claude/skills/blueworx-admin-design/` changes the tree hash, and `check-design-system-sync.mjs` compares every plugin's copy against it byte for byte. Every plugin will fail that check until it re-pulls. That is the documented fix and the failure message prints the commands, but it means this task lands once, deliberately, and is not drip-fed across several PRs. Tell Luke when it merges.

- [ ] **Step 1: Add the sync rules to the template**

Copy the "Claude Design ↔ code sync rules" section out of the spec into `CLAUDE.md.template` as its own top-level section, verbatim, immediately after "Approved Tools & Styles". Do not paraphrase it — it is a mandatory rule set in Luke's own words.

- [ ] **Step 2: Correct the three lines that contradict it**

The flow line reads `Design System → Figma/Lovable/Claude Design → Claude Design (single source of truth) → handoff …`. Claude Design no longer holds that role. Rewrite the flow so code is the single source of truth and Claude Design is the mirror.

The "add it to the system first, **re-export**, commit, then build" line: under the new rules there is no re-export. The component is written in code in the foundation, committed, and pushed out to Claude Design afterwards. Correct it.

"Authoring happens in Claude Design; the committed folder is an export. Don't hand-edit it in a plugin repo — the change will be overwritten on the next sync." becomes: the committed folder in the foundation is the source and Claude Design mirrors it; don't hand-edit the copy in a plugin repo, because the sync check compares it against the foundation and re-pulling will overwrite it.

- [ ] **Step 3: Rewrite the export contract**

`.claude/skills/blueworx-admin-design/github.md` describes a design → code export: "Whole folder, every time… It replaces the committed folder wholesale." That is precisely what the sync rules forbid. Rewrite it as a code → design contract. Keep the parts still true — `SKILL.md` and `styles.css` at the folder root, no minification, no build step, LF, self-contained, no path pointing outside the folder — and replace the direction with:

- the committed folder is the source; Claude Design mirrors it
- pushes go code → design, one component at a time, never a wholesale replace
- nothing is deleted in the design project unless Luke names the exact files
- design → code only for a component that does not exist in code yet, and only when Luke asks

Leave "Last sync", "Screen map" and "Sync history" as the historical record they are.

- [ ] **Step 4: Check the readme for the same claim**

Grep `.claude/skills/blueworx-admin-design/readme.md` for "export", "Claude Design", "authoring" and "source of truth". Correct only lines that contradict the sync rules. Leave the design content alone — that readme is the design system's own documentation, not a process document.

- [ ] **Step 5: Verify nothing else in the skill folder moved**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: PASS — the sync check's own tests are unaffected by a content change.

Run: `git diff --stat main -- .claude/skills/blueworx-admin-design/`
Expected: `github.md` only, plus `readme.md` if Step 4 found something. Anything else in that folder means something unintended was touched, and that folder is byte-compared in every consumer repo.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md.template .claude/skills/blueworx-admin-design/github.md .claude/skills/blueworx-admin-design/readme.md
git commit -m "Make code the source of truth for the design system"
```

---

## Final verification

- [ ] Run the whole suite: `node --test scripts/lib/*.test.mjs` — expect PASS, no skips.
- [ ] Syntax-check every script the way Foundation CI does: `for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f"; done` — expect no output.
- [ ] Prove the check is a no-op on a repo that has not adopted the design system: from a temp git repo with no `.claude/skills/blueworx-admin-design/`, run the check with `BASE_REF` set — expect the "no blueworx-admin-design" skip line and exit 0.
- [ ] Confirm the hook does not interfere with ordinary editing in a live session.
- [ ] Open the pull request. The foundation has no `CHANGELOG.md`, so there is no changelog entry to write — do not invent one.
