# WordPress Plugin Auto-Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add to this foundation repo everything a WordPress plugin project needs to auto-update from GitHub Releases — a reusable release workflow, a tag/version guardrail, a paste-in update-checker bootstrap, and the docs.

**Architecture:** A plugin repo adds a ~10-line `release.yml` that calls the foundation's reusable `release-wordpress.yml` on a `v*` tag push. That workflow verifies the tag matches the plugin header, builds a clean zip, asserts the zip's shape, and publishes it as a GitHub Release asset. Inside the plugin, a vendored Plugin Update Checker (PUC) v5 points at the repo, reads the Release asset, and authenticates with a token defined in each site's `wp-config.php`.

**Tech Stack:** GitHub Actions (reusable workflows), Node.js ESM check scripts with `node:test`, PHP 8.2, yahnis-elsts/plugin-update-checker v5, `zip`/`unzip` and `gh` (all preinstalled on `ubuntu-latest`).

**Spec:** `docs/superpowers/specs/2026-07-21-wordpress-auto-updates-design.md`

## Global Constraints

- Check scripts are **Node.js ESM (`.mjs`), zero dependencies**. Pure logic goes in `scripts/lib/checks.mjs` and returns `{ ok: boolean, message: string }`; I/O stays in the CLI wrapper or `scripts/lib/io.mjs`.
- Tests use the built-in runner: `node --test scripts/lib/*.test.mjs`. `foundation-ci.yml` already runs this and `node --check` over every script — no workflow change is needed to cover new scripts.
- New reusable workflows follow `ci-wordpress.yml`'s conventions: a leading comment block showing the caller snippet, `foundation_ref` input defaulting to `main`, foundation checked out into `.foundation`, scripts invoked as `node "$GITHUB_WORKSPACE/.foundation/scripts/<name>.mjs"`.
- Plugin repos are **private**; this foundation repo is **public**.
- Token constant name is exactly `BLUEWORX_PLUGIN_UPDATE_TOKEN`.
- Zips built in CI use `zip -r` (GNU tar on Ubuntu cannot write zip). The `bsdtar` rule in `CLAUDE.md.template` governs hand-built Windows zips and must not be changed.
- Every zip entry must begin `<slug>/` with forward slashes, nested one level.
- Work on branch `wordpress-auto-updates`, already created. Commit after each task.

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/lib/checks.mjs` | **Modify** — add pure `releaseTag()` |
| `scripts/lib/checks.test.mjs` | **Modify** — unit tests for `releaseTag()` |
| `scripts/check-release-tag.mjs` | **Create** — CLI wrapper: env + fs → `releaseTag()` → exit code |
| `scripts/plugin-info.mjs` | **Create** — resolves plugin file + slug, prints `key=value` for `$GITHUB_OUTPUT` |
| `.github/workflows/release-wordpress.yml` | **Create** — reusable release workflow |
| `templates/plugin-update-checker-bootstrap.php` | **Create** — paste-in PUC wiring |
| `docs/wordpress-auto-updates.md` | **Create** — the standard, setup, release checklist, troubleshooting |
| `README.md` | **Modify** — releases section |
| `CLAUDE.md.template` | **Modify** — Deployment section: releases supersede manual zips |
| `docs/setup-prompt.md` | **Modify** — record the requirement |

`plugin-info.mjs` is an addition to the spec's file list. The workflow needs the slug and main-file basename in shell before it can stage or verify anything, and doing that with an inline `node -e` dynamic import would be unreadable and untestable. It is pure resolution logic with no check semantics, so it stays separate from `check-release-tag.mjs`.

---

### Task 1: `releaseTag()` check — core, tests, and CLI

**Files:**
- Modify: `scripts/lib/checks.mjs` (append after `pluginZip`, before `testsExecuted`)
- Modify: `scripts/lib/checks.test.mjs` (extend import block; append tests)
- Create: `scripts/check-release-tag.mjs`

**Interfaces:**
- Consumes: `parseSemver`, `compareSemver` from `./semver.mjs` (already imported in `checks.mjs` — you must add `parseSemver` to that import); `findPluginMainFile`, `parsePhpHeaderVersion` from `./lib/io.mjs`.
- Produces: `releaseTag({ tag, headerVersion, pluginFile }) -> { ok, message }`. Task 2 shells out to `scripts/check-release-tag.mjs` with env `RELEASE_TAG` and optional `PLUGIN_FILE`.

- [ ] **Step 1: Write the failing tests**

Add `releaseTag` to the existing import list at the top of `scripts/lib/checks.test.mjs`:

```js
import {
  versionBumped,
  changelogUpdated,
  approvedDeps,
  pluginVersionSync,
  pluginZip,
  releaseTag,
  testsExecuted,
} from './checks.mjs';
```

Append to the end of `scripts/lib/checks.test.mjs`:

```js
test('releaseTag: passes when the tag matches the header, with or without a leading v', () => {
  const args = { headerVersion: '1.2.0', pluginFile: 'my-plugin.php' };
  assert.equal(releaseTag({ ...args, tag: 'v1.2.0' }).ok, true);
  assert.equal(releaseTag({ ...args, tag: '1.2.0' }).ok, true);
});

test('releaseTag: fails when the tag and header disagree', () => {
  const result = releaseTag({ tag: 'v1.2.0', headerVersion: '1.1.0', pluginFile: 'my-plugin.php' });
  assert.equal(result.ok, false);
  assert.match(result.message, /1\.2\.0/);
  assert.match(result.message, /1\.1\.0/);
});

test('releaseTag: fails when the plugin file or Version header is missing', () => {
  assert.equal(releaseTag({ tag: 'v1.2.0', headerVersion: '1.2.0', pluginFile: null }).ok, false);
  assert.equal(releaseTag({ tag: 'v1.2.0', headerVersion: null, pluginFile: 'my-plugin.php' }).ok, false);
});

test('releaseTag: fails on a non-semver tag or header', () => {
  assert.equal(releaseTag({ tag: 'release-2', headerVersion: '1.2.0', pluginFile: 'my-plugin.php' }).ok, false);
  assert.equal(releaseTag({ tag: 'v1.2.0', headerVersion: '1.2', pluginFile: 'my-plugin.php' }).ok, false);
});

test('releaseTag: fails when no tag was supplied', () => {
  assert.equal(releaseTag({ tag: '', headerVersion: '1.2.0', pluginFile: 'my-plugin.php' }).ok, false);
});

test('releaseTag: matches prerelease tags exactly', () => {
  const args = { headerVersion: '1.2.0-beta.1', pluginFile: 'my-plugin.php' };
  assert.equal(releaseTag({ ...args, tag: 'v1.2.0-beta.1' }).ok, true);
  assert.equal(releaseTag({ ...args, tag: 'v1.2.0' }).ok, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test scripts/lib/checks.test.mjs
```

Expected: FAIL — `SyntaxError: The requested module './checks.mjs' does not provide an export named 'releaseTag'`.

- [ ] **Step 3: Implement `releaseTag()`**

In `scripts/lib/checks.mjs`, widen the existing semver import:

```js
import { compareSemver, parseSemver } from './semver.mjs';
```

Then insert this function after `pluginZip` and before the `testsExecuted` comment block:

```js
// A tag whose version disagrees with the plugin header publishes a Release that
// looks healthy but is never offered to sites: the update checker compares the
// header inside the released zip against the installed version, sees no
// difference, and reports "up to date" forever. Fail loudly here instead.
export function releaseTag({ tag, headerVersion, pluginFile }) {
  if (!pluginFile) {
    return { ok: false, message: 'No plugin main file (with "Plugin Name:") found — cannot verify the release tag.' };
  }
  if (!tag) {
    return { ok: false, message: 'No release tag supplied (RELEASE_TAG is empty).' };
  }
  if (!headerVersion) {
    return {
      ok: false,
      message: `No "Version:" header found in ${pluginFile}. Add one — the update checker reads it to decide whether a site is out of date.`,
    };
  }
  if (!parseSemver(tag)) {
    return { ok: false, message: `Release tag "${tag}" is not valid semver. Tag releases as v1.2.3.` };
  }
  if (!parseSemver(headerVersion)) {
    return { ok: false, message: `Version header "${headerVersion}" in ${pluginFile} is not valid semver.` };
  }
  if (compareSemver(tag, headerVersion) !== 0) {
    return {
      ok: false,
      message:
        `Release tag ${tag} does not match the plugin header version ${headerVersion} in ${pluginFile}.\n` +
        '  Sites compare the header inside the released zip against what they have installed, so a\n' +
        '  mismatch publishes a Release that is never offered as an update. Fix one and re-tag.',
    };
  }
  return { ok: true, message: `Release tag ${tag} matches the plugin header version in ${pluginFile}.` };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test scripts/lib/checks.test.mjs
```

Expected: PASS — all tests, `fail 0`.

- [ ] **Step 5: Write the CLI wrapper**

Create `scripts/check-release-tag.mjs`:

```js
#!/usr/bin/env node
// Fails if the pushed release tag doesn't match the plugin header's Version:.
// RELEASE_TAG is the tag (e.g. v1.2.0). PLUGIN_FILE optionally overrides detection.

import { readFileSync } from 'node:fs';
import { findPluginMainFile, parsePhpHeaderVersion } from './lib/io.mjs';
import { releaseTag } from './lib/checks.mjs';

const tag = process.env.RELEASE_TAG || '';
const pluginFile = process.env.PLUGIN_FILE || findPluginMainFile('.');

let headerVersion = null;
if (pluginFile) {
  try {
    headerVersion = parsePhpHeaderVersion(readFileSync(pluginFile, 'utf8'));
  } catch {
    headerVersion = null;
  }
}

const result = releaseTag({ tag, headerVersion, pluginFile });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
```

- [ ] **Step 6: Verify the script syntax-checks and behaves**

```bash
node --check scripts/check-release-tag.mjs
RELEASE_TAG=v9.9.9 node scripts/check-release-tag.mjs; echo "exit=$?"
```

Expected: `node --check` silent. The run prints `No plugin main file (with "Plugin Name:") found — cannot verify the release tag.` and `exit=1` — correct, since this repo contains no plugin.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/checks.mjs scripts/lib/checks.test.mjs scripts/check-release-tag.mjs
git commit -m "feat: add release tag vs plugin header version check"
```

---

### Task 2: `plugin-info.mjs` resolver

**Files:**
- Create: `scripts/plugin-info.mjs`

**Interfaces:**
- Consumes: `findPluginMainFile` from `./lib/io.mjs`.
- Produces: a script printing exactly two lines, `plugin_file=<repo-relative path>` and `slug=<slug>`, for appending to `$GITHUB_OUTPUT`. Env `PLUGIN_SLUG` overrides the derived slug. Exits 1 when no plugin file is found. Task 3 reads `steps.info.outputs.slug` and `steps.info.outputs.plugin_file`.

- [ ] **Step 1: Write the script**

Create `scripts/plugin-info.mjs`:

```js
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
```

- [ ] **Step 2: Verify it syntax-checks and fails cleanly here**

```bash
node --check scripts/plugin-info.mjs
node scripts/plugin-info.mjs; echo "exit=$?"
```

Expected: `node --check` silent; the run prints the "No plugin main file" error and `exit=1` (this repo has no plugin).

- [ ] **Step 3: Verify it resolves against a fixture**

```bash
mkdir -p /tmp/pi && printf '<?php\n/**\n * Plugin Name: Demo\n * Version: 1.2.0\n */\n' > /tmp/pi/demo-plugin.php
(cd /tmp/pi && node "$OLDPWD/scripts/plugin-info.mjs")
(cd /tmp/pi && PLUGIN_SLUG=custom-slug node "$OLDPWD/scripts/plugin-info.mjs")
```

Expected, in order:

```
plugin_file=demo-plugin.php
slug=demo-plugin
plugin_file=demo-plugin.php
slug=custom-slug
```

Then confirm the tag check agrees with the same fixture:

```bash
(cd /tmp/pi && RELEASE_TAG=v1.2.0 node "$OLDPWD/scripts/check-release-tag.mjs"); echo "exit=$?"
(cd /tmp/pi && RELEASE_TAG=v1.3.0 node "$OLDPWD/scripts/check-release-tag.mjs"); echo "exit=$?"
```

Expected: first prints `Release tag v1.2.0 matches...` with `exit=0`; second prints the mismatch message with `exit=1`.

- [ ] **Step 4: Clean up the fixture and commit**

```bash
rm -rf /tmp/pi
git add scripts/plugin-info.mjs
git commit -m "feat: add plugin-info resolver for release workflow"
```

---

### Task 3: Reusable release workflow

**Files:**
- Create: `.github/workflows/release-wordpress.yml`

**Interfaces:**
- Consumes: `scripts/plugin-info.mjs` and `scripts/check-release-tag.mjs` from Tasks 1–2, via `.foundation/`.
- Produces: a `workflow_call` workflow with inputs `plugin_slug`, `node_version`, `build_command`, `exclude_paths`, `foundation_ref`. Task 5's README snippet and Task 4's docs must match these names exactly.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release-wordpress.yml`:

```yaml
name: Release (WordPress)

# Reusable release workflow for WordPress plugin projects. Pushing a version tag
# builds a clean plugin zip and publishes it as a GitHub Release asset, which is
# what the plugin's update checker installs from.
#
#   # .github/workflows/release.yml
#   name: Release
#   on:
#     push:
#       tags: ['v*']
#   jobs:
#     release:
#       uses: blueworx-io/bluegroup_core_foundation/.github/workflows/release-wordpress.yml@main
#       with:
#         plugin_slug: my-plugin
#       permissions:
#         contents: write
#
# `permissions: contents: write` belongs in the caller — a reusable workflow
# cannot widen the permissions it is given. Without it, publishing 403s.
#
on:
  workflow_call:
    inputs:
      plugin_slug:
        description: Plugin slug — the folder name inside the zip. Inferred from the main plugin file if empty.
        type: string
        default: ''
      node_version:
        description: Node.js version (only used if the plugin has a package.json).
        type: string
        default: '20'
      build_command:
        description: Command to build assets (skipped if no package.json).
        type: string
        default: npm run build
      exclude_paths:
        description: >-
          Extra paths to leave out of the zip, one per line, as rsync patterns
          (a leading / anchors to the repo root). Added to the defaults.
        type: string
        default: ''
      foundation_ref:
        description: Ref of the foundation repo to pull the shared check scripts from.
        type: string
        default: main

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout tagged commit
        uses: actions/checkout@v4

      - name: Checkout foundation (shared check scripts)
        uses: actions/checkout@v4
        with:
          repository: blueworx-io/bluegroup_core_foundation
          ref: ${{ inputs.foundation_ref }}
          path: .foundation

      - name: Resolve plugin file and slug
        id: info
        env:
          PLUGIN_SLUG: ${{ inputs.plugin_slug }}
        run: node "$GITHUB_WORKSPACE/.foundation/scripts/plugin-info.mjs" >> "$GITHUB_OUTPUT"

      # The guardrail that matters most: a tag that disagrees with the header
      # publishes a Release no site is ever offered.
      - name: Release tag matches plugin header
        env:
          RELEASE_TAG: ${{ github.ref_name }}
          PLUGIN_FILE: ${{ steps.info.outputs.plugin_file }}
        run: node "$GITHUB_WORKSPACE/.foundation/scripts/check-release-tag.mjs"

      - name: Setup Node
        if: hashFiles('package.json') != ''
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node_version }}

      - name: Install and build (if package.json)
        run: |
          if [ -f package.json ]; then
            if [ -f package-lock.json ]; then npm ci; else npm install; fi
            ${{ inputs.build_command }}
          else
            echo "No package.json — skipping install and build."
          fi

      # Staged with rsync so the exclude list is declarative and the zip only
      # ever contains what shipped through it.
      - name: Stage clean plugin tree
        env:
          SLUG: ${{ steps.info.outputs.slug }}
          EXTRA_EXCLUDES: ${{ inputs.exclude_paths }}
        run: |
          set -euo pipefail
          cat > /tmp/plugin-excludes.txt <<'EOF'
          /.git
          /.github
          /.foundation
          /.claude
          /node_modules
          /dist
          /tests
          /test-results
          /playwright-report
          /docs
          /playwright.config.*
          /package.json
          /package-lock.json
          /approved-deps.json
          /.editorconfig
          /.gitignore
          /.gitattributes
          /phpcs.xml
          /phpcs.xml.dist
          /.phpcs.xml
          /.eslintrc*
          /eslint.config.*
          *.zip
          EOF
          if [ -n "$EXTRA_EXCLUDES" ]; then
            printf '%s\n' "$EXTRA_EXCLUDES" >> /tmp/plugin-excludes.txt
          fi
          echo "Excluding:"
          sed 's/^/  /' /tmp/plugin-excludes.txt
          mkdir -p "dist/$SLUG"
          rsync -a --exclude-from=/tmp/plugin-excludes.txt ./ "dist/$SLUG/"
          echo "Staged tree:"
          find "dist/$SLUG" -maxdepth 1 -mindepth 1 | sed 's/^/  /'

      # GNU tar on Ubuntu cannot write zip format, so this uses zip(1). Entries
      # come out with forward slashes, which is what WordPress needs.
      - name: Build zip
        env:
          SLUG: ${{ steps.info.outputs.slug }}
        run: |
          set -euo pipefail
          cd dist
          zip -r -q "../$SLUG.zip" "$SLUG"
          cd ..
          ls -lh "$SLUG.zip"

      - name: Verify zip shape
        env:
          SLUG: ${{ steps.info.outputs.slug }}
          PLUGIN_FILE: ${{ steps.info.outputs.plugin_file }}
        run: |
          set -euo pipefail
          unzip -l "$SLUG.zip"
          entries=$(unzip -Z1 "$SLUG.zip")
          stray=$(printf '%s\n' "$entries" | grep -v "^$SLUG/" || true)
          if [ -n "$stray" ]; then
            echo "::error title=Malformed plugin zip::Entries outside $SLUG/ — the archive must nest exactly one level:"
            printf '%s\n' "$stray" | sed 's/^/  /'
            exit 1
          fi
          main_entry="$SLUG/$(basename "$PLUGIN_FILE")"
          if ! printf '%s\n' "$entries" | grep -qx "$main_entry"; then
            echo "::error title=Malformed plugin zip::Main plugin file $main_entry is missing from the archive."
            exit 1
          fi
          echo "Zip verified: every entry under $SLUG/, main file $main_entry present."

      - name: Extract changelog section for this version
        id: notes
        env:
          TAG: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          version="${TAG#v}"
          if [ -f CHANGELOG.md ]; then
            awk -v v="$version" '
              index($0, "## ") == 1 && index($0, v) > 0 { flag = 1; next }
              flag && index($0, "## ") == 1 { exit }
              flag { print }
            ' CHANGELOG.md > /tmp/release-notes.md
          else
            : > /tmp/release-notes.md
          fi
          if [ -s /tmp/release-notes.md ]; then
            echo "found=true" >> "$GITHUB_OUTPUT"
            echo "Release notes taken from CHANGELOG.md:"
            sed 's/^/  /' /tmp/release-notes.md
          else
            echo "found=false" >> "$GITHUB_OUTPUT"
            echo "No CHANGELOG.md section for $version — falling back to generated notes."
          fi

      - name: Publish GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ github.ref_name }}
          SLUG: ${{ steps.info.outputs.slug }}
          NOTES_FOUND: ${{ steps.notes.outputs.found }}
        run: |
          set -euo pipefail
          if [ "$NOTES_FOUND" = "true" ]; then
            gh release create "$TAG" "$SLUG.zip" --title "$TAG" --notes-file /tmp/release-notes.md
          else
            gh release create "$TAG" "$SLUG.zip" --title "$TAG" --generate-notes
          fi
          echo "Published $TAG with $SLUG.zip attached."
```

- [ ] **Step 2: Validate the YAML parses**

```bash
node -e "const{readFileSync}=require('fs');const s=readFileSync('.github/workflows/release-wordpress.yml','utf8');if(/\t/.test(s))throw new Error('tab character in YAML');console.log('read OK,',s.split('\n').length,'lines')"
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release-wordpress.yml')); print('YAML parses')"
```

Expected: `read OK, <n> lines` then `YAML parses`. If `python` is unavailable, `python3` — and if neither is, skip this step and rely on Step 3.

- [ ] **Step 3: Dry-run the staging and zip logic locally**

This is the part most likely to be wrong, so exercise it outside CI:

```bash
mkdir -p /tmp/relx/my-plugin/{includes,tests,node_modules} && cd /tmp/relx/my-plugin
printf '<?php\n/**\n * Plugin Name: My Plugin\n * Version: 1.2.0\n */\n' > my-plugin.php
echo "x" > includes/thing.php && echo "x" > tests/spec.js && echo "x" > node_modules/junk.js
echo '{"name":"my-plugin"}' > package.json && echo "old" > my-plugin-old.zip
printf '/.git\n/node_modules\n/tests\n/package.json\n*.zip\n' > /tmp/ex.txt
mkdir -p dist/my-plugin && rsync -a --exclude-from=/tmp/ex.txt ./ dist/my-plugin/
(cd dist && zip -r -q ../my-plugin.zip my-plugin)
unzip -Z1 my-plugin.zip
```

Expected output — exactly these entries, nothing from `tests/`, `node_modules/`, no `package.json`, no nested zip:

```
my-plugin/
my-plugin/my-plugin.php
my-plugin/includes/
my-plugin/includes/thing.php
```

Confirm the stray-entry guard would pass and the main-file assertion holds:

```bash
unzip -Z1 my-plugin.zip | grep -v "^my-plugin/" || echo "no stray entries — good"
unzip -Z1 my-plugin.zip | grep -qx "my-plugin/my-plugin.php" && echo "main file present — good"
cd / && rm -rf /tmp/relx /tmp/ex.txt
```

Expected: `no stray entries — good` then `main file present — good`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-wordpress.yml
git commit -m "feat: add reusable WordPress plugin release workflow"
```

---

### Task 4: Update-checker bootstrap template

**Files:**
- Create: `templates/plugin-update-checker-bootstrap.php`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a template with `<repo>` and `<slug>` placeholders that Task 5's docs instruct the reader to substitute. The token constant is `BLUEWORX_PLUGIN_UPDATE_TOKEN`.

- [ ] **Step 1: Write the template**

Create `templates/plugin-update-checker-bootstrap.php`:

```php
<?php
/**
 * Plugin Update Checker bootstrap — copy this block into the plugin's main file,
 * below the plugin header, and replace <repo> and <slug>.
 *
 * Prerequisites:
 *   1. Vendor the library into the plugin at plugin-update-checker/ and commit it
 *      (see docs/wordpress-auto-updates.md in the foundation).
 *   2. The plugin has a valid "Version:" header. It is the only thing a site
 *      compares against, so it must be bumped for every release.
 *   3. The repo publishes releases via the foundation's release-wordpress.yml.
 *
 * Do not commit this file into a plugin as-is — it is a snippet to paste, not a
 * file to include.
 */

require_once plugin_dir_path( __FILE__ ) . 'plugin-update-checker/plugin-update-checker.php';

use YahnisElsts\PluginUpdateChecker\v5\PucFactory;

$blueworx_update_checker = PucFactory::buildUpdateChecker(
	'https://github.com/blueworx-io/<repo>/',
	__FILE__,
	'<slug>' // Must equal the plugin's folder name. Omit it and WordPress can
	         // install the update alongside the original as a second copy.
);

/*
 * Our plugin repos are private, so the site needs a token to see releases at all.
 * It lives in wp-config.php — never in the plugin, never in the repo:
 *
 *     define( 'BLUEWORX_PLUGIN_UPDATE_TOKEN', 'github_pat_...' );
 *
 * Guarded, so the same code works unchanged if a repo is ever made public.
 */
if ( defined( 'BLUEWORX_PLUGIN_UPDATE_TOKEN' ) && BLUEWORX_PLUGIN_UPDATE_TOKEN ) {
	$blueworx_update_checker->setAuthentication( BLUEWORX_PLUGIN_UPDATE_TOKEN );
}

/*
 * Install the zip attached to the Release, not GitHub's auto-generated source
 * tarball. The tarball is named <repo>-<tag>, so without this the update
 * extracts to the wrong folder — WordPress treats it as a different plugin and
 * the original deactivates — and it ships every dev file in the repo.
 */
$blueworx_update_checker->getVcsApi()->enableReleaseAssets();
```

- [ ] **Step 2: Verify the PHP parses**

```bash
php -l templates/plugin-update-checker-bootstrap.php
```

Expected: `No syntax errors detected in templates/plugin-update-checker-bootstrap.php`.

If PHP is not installed locally, skip this — `ci-wordpress.yml`'s PHP syntax step covers `*.php` in consumer repos, and `foundation-ci.yml` does not lint PHP. Note it in the commit message if skipped.

- [ ] **Step 3: Commit**

```bash
git add templates/plugin-update-checker-bootstrap.php
git commit -m "feat: add plugin update checker bootstrap template"
```

---

### Task 5: The standard doc

**Files:**
- Create: `docs/wordpress-auto-updates.md`

**Interfaces:**
- Consumes: input names from Task 3, the constant and placeholders from Task 4.
- Produces: the canonical doc that Task 6's README and `CLAUDE.md.template` link to.

- [ ] **Step 1: Write the doc**

Create `docs/wordpress-auto-updates.md`:

````markdown
# WordPress plugin auto-updates

Every plugin we build updates itself on live sites when a release is published on
GitHub. Nobody uploads a zip to update a plugin.

A tagged commit triggers the foundation's release workflow, which builds a clean
zip and attaches it to a GitHub Release. Each site runs the Plugin Update Checker
(PUC), which watches the repo's releases and installs that asset like any
wordpress.org update.

Our plugin repos are private, so each site needs a read-only token to see them.

## One-time setup, per plugin

### 1. Vendor the update checker

```bash
# from the plugin repo root
curl -L -o puc.zip https://github.com/YahnisElsts/plugin-update-checker/archive/refs/tags/v5.6.zip
unzip -q puc.zip && rm puc.zip
mv plugin-update-checker-5.6 plugin-update-checker
git add plugin-update-checker && git commit -m "chore: vendor plugin-update-checker v5.6"
```

Committed deliberately: no Composer step, no build dependency, and the zip the
release workflow produces is self-contained. Upgrading the library is a manual
swap of that folder — check for a new tag when you touch a plugin.

### 2. Wire it into the main plugin file

Copy [`templates/plugin-update-checker-bootstrap.php`](../templates/plugin-update-checker-bootstrap.php)
into the plugin's main `.php` file, below the plugin header, and replace `<repo>`
and `<slug>`. `<slug>` must equal the plugin's folder name.

Confirm the header carries a valid semver version:

```php
 * Version: 1.2.0
```

### 3. Add the release workflow

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/release-wordpress.yml@main
    with:
      plugin_slug: my-plugin
    permissions:
      contents: write
```

`permissions: contents: write` is required — a reusable workflow cannot widen the
permissions its caller gives it, so without this the publish step fails with 403.

Inputs, all optional except as noted:

| Input | Default | Purpose |
|-------|---------|---------|
| `plugin_slug` | inferred from the main plugin file | Folder name inside the zip |
| `node_version` | `20` | Only used when a `package.json` exists |
| `build_command` | `npm run build` | Skipped when there is no `package.json` |
| `exclude_paths` | none | Extra rsync patterns to keep out of the zip |
| `foundation_ref` | `main` | Ref this repo's scripts come from — pin it alongside your CI's |

The zip already excludes `.git`, `.github`, `.claude`, `node_modules`, `dist`,
`tests`, `test-results`, `playwright-report`, `docs`, Playwright/ESLint/PHPCS
config, `package*.json`, `approved-deps.json`, and any `*.zip`. Use
`exclude_paths` only for something project-specific.

## One-time setup, per site

Add the token to `wp-config.php`, above the `/* That's all, stop editing! */`
line:

```php
define( 'BLUEWORX_PLUGIN_UPDATE_TOKEN', 'github_pat_...' );
```

Use a **fine-grained personal access token** with **read-only Contents** access,
scoped to the plugin repos only. One token can serve every site.

Without it, a private repo's releases are invisible: the site reports the plugin
as up to date and logs nothing obvious. This is the first thing to check when
updates don't appear.

Rotating the token means editing `wp-config.php` on each site — keep a list of
where it's deployed.

## Shipping a release

What you do:

1. Bump the `Version:` header in the main plugin file. If the plugin has a
   `package.json`, bump it to match — CI fails the PR otherwise.
2. Add the version's section to `CHANGELOG.md`.
3. Open the PR, get it green, merge to `main`.
4. Tag and push:

   ```bash
   git checkout main && git pull
   git tag v1.2.0
   git push origin v1.2.0
   ```

What happens on its own, from the tag push:

1. The tag is checked against the plugin header — a mismatch fails the release
   before anything is published.
2. Assets build, if the plugin has a `package.json`.
3. A clean `<slug>/` tree is staged and zipped, and the archive is verified to
   nest exactly one level with the main plugin file present.
4. A GitHub Release is created for the tag with the zip attached, using the
   `CHANGELOG.md` section for that version as the body.
5. Sites pick the update up within about 12 hours, or immediately via
   **Dashboard → Updates → Check again**.

## Troubleshooting

**No update offered.** In order of likelihood: the site is missing
`BLUEWORX_PLUGIN_UPDATE_TOKEN` (or it has expired); the `Version:` header wasn't
bumped, so the released zip claims the version already installed; the Release has
no zip asset attached; WordPress is serving a cached response — force a check
from Dashboard → Updates.

**The update installs as a second copy, or deactivates the plugin.** The slug
passed to `buildUpdateChecker()` doesn't match the plugin's folder name, or
`enableReleaseAssets()` is missing so PUC is installing GitHub's source tarball,
whose folder is named `<repo>-<tag>`.

**The update ships dev files.** `enableReleaseAssets()` is missing — same cause
as above.

**The release build fails on the tag check.** Intended. The header and the tag
disagree. Fix the header on `main`, then delete and re-push the tag:

```bash
git tag -d v1.2.0 && git push origin :refs/tags/v1.2.0
```

**`gh release create` fails with 403.** The caller workflow is missing
`permissions: contents: write`.
````

- [ ] **Step 2: Verify the internal link resolves**

```bash
ls templates/plugin-update-checker-bootstrap.php && echo "link target exists"
```

Expected: the path listed, then `link target exists`.

- [ ] **Step 3: Commit**

```bash
git add docs/wordpress-auto-updates.md
git commit -m "docs: add the WordPress plugin auto-update standard"
```

---

### Task 6: Wire the standard into README, CLAUDE.md.template, and the setup prompt

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md.template`
- Modify: `docs/setup-prompt.md`

**Interfaces:**
- Consumes: everything from Tasks 3–5. Input names and file paths quoted here must match them exactly.
- Produces: no code interface.

- [ ] **Step 1: Add the releases section to `README.md`**

Insert immediately before the `## What each project copies in` heading:

```markdown
## Releasing a WordPress plugin (auto-updates)

Plugins update themselves on live sites from GitHub Releases — no manual zip
uploads. A plugin repo adds one more caller workflow:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/release-wordpress.yml@main
    with:
      plugin_slug: my-plugin
    permissions:
      contents: write
```

> **`permissions: contents: write` is required.** A reusable workflow cannot widen
> the permissions its caller gives it, so without this the publish step fails with
> a 403.

Pushing a `v*` tag verifies the tag matches the plugin's `Version:` header, builds
a clean zip, checks the archive nests exactly one level, and publishes it as a
Release asset. Sites running the vendored Plugin Update Checker install it like
any other update.

Full setup — vendoring the library, the paste-in bootstrap, the per-site token,
and the release checklist — is in
[`docs/wordpress-auto-updates.md`](docs/wordpress-auto-updates.md).
```

- [ ] **Step 2: Update the "What's here" list in `README.md`**

Replace this bullet:

```markdown
- `.github/workflows/` — the three reusable guardrail workflows (`ci-*.yml`) plus this
  repo's own `foundation-ci.yml` (runs the check-script tests on every PR; required by
  branch protection)
```

with:

```markdown
- `.github/workflows/` — the three reusable guardrail workflows (`ci-*.yml`), the reusable
  WordPress release workflow (`release-wordpress.yml`), plus this repo's own
  `foundation-ci.yml` (runs the check-script tests on every PR; required by branch
  protection)
```

Then replace this bullet:

```markdown
- `scripts/` — the generic check scripts the workflows call (version bump, changelog,
  approved deps, plugin version-sync, plugin zip, tests-actually-ran) plus their tested
  cores in `scripts/lib/`
```

with:

```markdown
- `scripts/` — the generic check scripts the workflows call (version bump, changelog,
  approved deps, plugin version-sync, plugin zip, tests-actually-ran, release-tag match)
  plus the `plugin-info` resolver and their tested cores in `scripts/lib/`
```

Then replace this bullet:

```markdown
- `templates/approved-deps.json` — the empty allow-list starter
```

with:

```markdown
- `templates/` — `approved-deps.json` (the empty allow-list starter) and
  `plugin-update-checker-bootstrap.php` (paste-in auto-update wiring for plugins)
```

- [ ] **Step 3: Verify the README edits landed**

```bash
grep -n "release-wordpress.yml" README.md
grep -n "plugin-update-checker-bootstrap" README.md
```

Expected: at least two hits for the first, one for the second.

- [ ] **Step 4: Update the Deployment section of `CLAUDE.md.template`**

The manual-zip recipe currently reads as the way a plugin ships. It is now the
initial-install path only. Replace this bullet:

```markdown
- WordPress plugin: bump the plugin version and update the changelog, then build the zip **one level up from the repo** at `<plugin-parent-dir>/<plugin-slug>.zip` — never inside the repo working tree. Remove any older `<slug>.zip` in that parent folder first. The zip is the deployment artifact, never copy individual files
```

with:

```markdown
- WordPress plugin: **updates ship as GitHub Releases, not zips.** Bump the plugin version, update the changelog, merge, then tag: `git tag v1.2.0 && git push origin v1.2.0`. CI verifies the tag matches the plugin header, builds the zip, and publishes the Release; sites running the vendored update checker install it themselves. A hand-built zip is only for a plugin's **first** install on a site, or a repo not yet on the release workflow
- When a hand-built zip is genuinely needed: build it **one level up from the repo** at `<plugin-parent-dir>/<plugin-slug>.zip` — never inside the repo working tree. Remove any older `<slug>.zip` in that parent folder first. The zip is the deployment artifact, never copy individual files
```

Leave every sub-bullet under it (the build-script rule, forward slashes, the
`Compress-Archive` ban, bsdtar, the verify step) exactly as it is — those still
govern hand-built zips.

- [ ] **Step 5: Verify the template edit landed**

```bash
grep -n "GitHub Releases, not zips" CLAUDE.md.template
grep -n "Compress-Archive" CLAUDE.md.template
```

Expected: one hit each — the second confirms the bsdtar rules survived the edit.

- [ ] **Step 6: Record the requirement in `docs/setup-prompt.md`**

Append to the end of the file:

```markdown
## Addendum — WordPress plugin auto-updates (2026-07-21)

Every WordPress plugin must auto-update on live sites when a release is published
on GitHub. The foundation provides the reusable `release-wordpress.yml`, the
`check-release-tag.mjs` guardrail, and the paste-in
`templates/plugin-update-checker-bootstrap.php`. A new plugin project wires all
three up as part of setup — see [`wordpress-auto-updates.md`](wordpress-auto-updates.md).
```

- [ ] **Step 7: Run the full check suite before committing**

```bash
node --test scripts/lib/*.test.mjs
for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f"; done && echo "all scripts parse"
```

Expected: `fail 0` from the test run, then `all scripts parse`. This is what `foundation-ci.yml` will run on the PR.

- [ ] **Step 8: Commit**

```bash
git add README.md CLAUDE.md.template docs/setup-prompt.md
git commit -m "docs: wire the auto-update standard into README, template, and setup prompt"
```

---

## Verification before opening the PR

- [ ] `node --test scripts/lib/*.test.mjs` — `fail 0`
- [ ] `for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f"; done` — silent
- [ ] `git log --oneline main..HEAD` — six commits, one per task
- [ ] `git status` — clean; no `/tmp` fixtures or stray zips committed
- [ ] The workflow's inputs (`plugin_slug`, `node_version`, `build_command`, `exclude_paths`, `foundation_ref`) read identically in `release-wordpress.yml`, `README.md`, and `docs/wordpress-auto-updates.md`

**Not verifiable in this repo:** the release workflow itself never runs here — there is no plugin and no `v*` tag. Its first real execution is the first plugin adoption. Say so plainly when handing this over; do not describe the release path as tested. The staging/zip dry-run in Task 3 Step 3 is the closest local proxy, and it covers the exclude list and archive shape but not the tag check, the build step, or publishing.
