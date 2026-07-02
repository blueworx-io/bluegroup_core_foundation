# CI Guardrails Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared CI guardrails — three reusable GitHub Actions workflows, five generic check scripts, the approved-deps starter, PR/issue templates, and the saved setup prompt — per the approved design spec.

**Architecture:** Check logic lives in small pure functions (`scripts/lib/`) that are unit-tested with the built-in `node:test` runner (zero dependencies). Thin CLI wrappers (`scripts/check-*.mjs`) gather inputs from git/the filesystem and call the pure cores, exiting non-zero with a clear message on failure. Three reusable `workflow_call` workflows orchestrate install/lint/build → checks → Playwright, doing a second `actions/checkout` of this (public) repo into `.foundation/` to run the shared scripts.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test`/`node:assert`, GitHub Actions reusable workflows, `shivammathur/setup-php` for the WordPress lane.

## Global Constraints

- Scripts are **zero-dependency** Node ESM; run via `node scripts/<name>.mjs`. Tests use only `node:test` + `node:assert`.
- Version source of truth: `package.json` `version` (standalone/headless); the **plugin header** version for WordPress (`VERSION_SOURCE=plugin-header`), cross-checked against `package.json` when present.
- Base-branch comparisons use `git show origin/<base>:<file>` and `git diff --name-only origin/<base>...HEAD`. Missing base / no `BASE_REF` ⇒ graceful pass (first build).
- Repo is **public**: reusable workflows check out `blueworx-io/bluegroup_core_foundation` into `.foundation/` with the default `GITHUB_TOKEN` (no PAT).
- Every check script exits `0` on pass, `1` on fail, printing a single actionable message.
- Node default version `20`; all commands overridable via `workflow_call` inputs.

---

## File Structure

```
scripts/
  lib/
    semver.mjs        # compareSemver / parseSemver — pure, tested
    checks.mjs        # versionBumped / changelogUpdated / approvedDeps / pluginVersionSync / pluginZip — pure, tested
    io.mjs            # git + fs helpers (thin, not unit-tested)
    semver.test.mjs   # node:test
    checks.test.mjs   # node:test
  check-version-bump.mjs
  check-changelog.mjs
  check-approved-deps.mjs
  check-plugin-version-sync.mjs
  check-plugin-zip.mjs
templates/
  approved-deps.json
.github/
  workflows/
    ci-standalone.yml
    ci-headless.yml
    ci-wordpress.yml
  PULL_REQUEST_TEMPLATE.md
  ISSUE_TEMPLATE/
    task.md
docs/
  setup-prompt.md
README.md               # extend with caller usage
```

---

### Task 1: semver core + tests

**Files:** Create `scripts/lib/semver.mjs`, `scripts/lib/semver.test.mjs`.

**Produces:** `parseSemver(v) -> {major,minor,patch,pre}|null`; `compareSemver(a,b) -> -1|0|1` (throws on invalid input).

- [ ] Write `semver.test.mjs`: `compareSemver('1.2.3','1.2.2')===1`, equal ⇒ `0`, `'1.2.3'`<`'2.0.0'` ⇒ `-1`, release > prerelease (`'1.2.3'` vs `'1.2.3-rc.1'` ⇒ `1`), `'1.2.3-rc.1'`<`'1.2.3-rc.2'` ⇒ `-1`, leading `v` tolerated, invalid input throws.
- [ ] Implement `semver.mjs` (numeric major/minor/patch compare; SemVer prerelease rule: a version with no prerelease outranks one with; dotted identifier compare, numeric<non-numeric handled).
- [ ] Run: `node --test scripts/lib/semver.test.mjs` → PASS.
- [ ] Commit.

### Task 2: checks core + tests

**Files:** Create `scripts/lib/checks.mjs`, `scripts/lib/checks.test.mjs`. Consumes `compareSemver` from Task 1.

**Produces (all return `{ok:boolean, message:string}`, `approvedDeps` also `offenders:string[]`):**
- `versionBumped({current, base})` — `base==null` ⇒ ok (first build); ok iff `compareSemver(current,base)===1`.
- `changelogUpdated({changedFiles, changelogPath})` — ok iff `changedFiles.includes(changelogPath)`.
- `approvedDeps({pkg, approved})` — offenders = names in `pkg.dependencies`/`devDependencies` not in the matching allow-list; allow-list accepts object (`{name:range}`) or array (`[name]`).
- `pluginVersionSync({headerVersion, pkgVersion})` — `pkgVersion==null` ⇒ ok; ok iff equal.
- `pluginZip({zipFiles, slug})` — ok iff `zipFiles.length <= 1`.

- [ ] Write `checks.test.mjs` covering: bumped/not-bumped/first-build; changelog present/absent; approved deps with empty allow-list (offender), object allow-list (ok), array allow-list (ok); version-sync null/equal/mismatch; zip 0/1/2 files.
- [ ] Implement `checks.mjs`.
- [ ] Run: `node --test scripts/lib/checks.test.mjs` → PASS.
- [ ] Commit.

### Task 3: io helpers

**Files:** Create `scripts/lib/io.mjs`.

**Produces:** `readJson(path)|null`; `git(args)|null` (execFileSync, null on failure); `gitShowFile(ref,path)`; `gitChangedFiles(baseRef)|null`; `findPluginMainFile(cwd)` (first `*.php` containing `Plugin Name:`, depth ≤2, skipping `node_modules`/`.git`/`vendor`); `parsePhpHeaderVersion(content)`; `findZips(cwd,slug)`.

- [ ] Implement `io.mjs`. (Thin I/O; exercised by the smoke test in Task 4.)
- [ ] Commit.

### Task 4: five CLI check scripts + smoke test

**Files:** Create `scripts/check-version-bump.mjs`, `check-changelog.mjs`, `check-approved-deps.mjs`, `check-plugin-version-sync.mjs`, `check-plugin-zip.mjs`. Consume Tasks 1–3.

Each: read env (`BASE_REF`, `VERSION_SOURCE`, `PKG_PATH`, `CHANGELOG_PATH`, `APPROVED_DEPS_PATH`, `PLUGIN_SLUG`), gather via `io`, call the pure core, `console.log(message)`, `process.exit(ok?0:1)`. Missing `BASE_REF` or missing base file ⇒ exit 0 with a "skipped" message.

- [ ] Implement the five CLI wrappers.
- [ ] Smoke test in a throwaway temp git repo: unbumped version ⇒ exit 1; bumped + changelog touched ⇒ exit 0; unapproved dep ⇒ exit 1. Confirm exit codes.
- [ ] Commit.

### Task 5: approved-deps.json starter

**Files:** Create `templates/approved-deps.json` = `{ "dependencies": {}, "devDependencies": {} }`.

- [ ] Create the file. Commit.

### Task 6: three reusable workflows

**Files:** Create `.github/workflows/ci-standalone.yml`, `ci-headless.yml`, `ci-wordpress.yml`.

All: `on: workflow_call` with inputs (`node_version`=20, `lint_command`, `build_command`, `test_command`, `foundation_ref`=main; WP adds `php_version`=8.2, `preview_url` required, `plugin_slug`). Steps: checkout PR (`fetch-depth:0`) → checkout foundation into `.foundation/` → fetch base branch → setup-node → install (`npm ci` if lockfile else `npm install`) → lint → build → version-bump → changelog → approved-deps → `npx playwright install --with-deps` → Playwright.
- **standalone/headless:** Playwright against the local build.
- **headless:** identical + a commented Netlify-preview required-check extension point and a reserved `netlify_preview_url` input.
- **wordpress:** Node steps guarded on `package.json` presence; add `shivammathur/setup-php`, `php -l` across `*.php`, PHPCS only if `phpcs.xml`/`.dist`/`.phpcs.xml` exists, version-bump with `VERSION_SOURCE=plugin-header`, plugin-version-sync, plugin-zip; Playwright against `preview_url` (`PLAYWRIGHT_BASE_URL`/`BASE_URL`).

- [ ] Create the three YAML files. Commit.

### Task 7: PR + issue templates

**Files:** Create `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/task.md`.

- PR: what it does · first build vs change · checklist (branch, version bumped, changelog, deps approved, lint+build local, plugin zip rebuilt if WP, Netlify preview if relevant).
- Issue: goal · scope · out of scope · acceptance criteria · project type.

- [ ] Create both. Commit.

### Task 8: setup prompt doc

**Files:** Create `docs/setup-prompt.md` with the original setup prompt saved verbatim.

- [ ] Create the file. Commit.

### Task 9: README caller usage

**Files:** Modify `README.md`.

Add a "Using the CI guardrails" section: the three caller snippets, the `foundation_ref` pinning recommendation, and the list of files a consumer copies (`approved-deps.json`, PR/issue templates, `.claude/settings.json`). Keep existing content.

- [ ] Edit README. Commit.

### Task 10: verify + PR

- [ ] Run full test suite: `node --test scripts/lib/semver.test.mjs scripts/lib/checks.test.mjs` → all PASS.
- [ ] `node --check` each `scripts/*.mjs` and `scripts/lib/*.mjs`.
- [ ] Push branch, open PR to `main`.

## Self-Review

- **Spec coverage:** install+lint ✓ (workflows), build ✓, version bump ✓ (Task 1/2/4), changelog ✓, approved-deps ✓, Playwright local vs preview ✓, WP php -l/PHPCS ✓, WP header↔package version ✓ (plugin-version-sync), WP single-zip ✓. Approved-deps starter ✓, PR/issue templates ✓, README ✓, setup-prompt ✓.
- **Placeholders:** none — the Netlify preview block is an intentional, documented extension point per the spec (out of scope now).
- **Type consistency:** pure cores all return `{ok, message}`; CLIs branch on `res.ok`. `compareSemver` name consistent across semver/checks.
