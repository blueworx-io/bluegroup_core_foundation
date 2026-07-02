# BlueGroup Core Foundation — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending spec review

## Purpose

Create a single shared repository (`blueworx-io/bluegroup_core_foundation`) that holds our
development guardrails so every other project points at it instead of re-implementing the
same CI rules. The foundation provides:

1. Three reusable CI guardrail workflows (standalone, headless, WordPress).
2. Five generic, reusable check scripts the workflows call.
3. A starter `approved-deps.json` allow-list format for other repos to copy.
4. Shared PR and issue templates.
5. A Claude Code permissions settings file that auto-approves routine work.
6. A README explaining the repo and how to consume the workflows.
7. Reference docs saved into the repo (the setup prompt; Team Guidelines live in ClickUp).

## Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Consumption model | GitHub Actions **reusable workflows** (`workflow_call`) | Consumers add a ~10-line caller; least duplication. |
| Check script language | **Node.js ESM (`.mjs`)**, zero dependencies | Native JSON parsing, cross-platform, no extra tooling. |
| Repo visibility | **Public** | Reusable workflow can `actions/checkout` this repo for scripts using the default token — no PAT/secret. |
| Version source of truth | **`package.json` `version`** | For WordPress also cross-checked against the plugin header. |
| Standalone vs headless | **Two separate files** | Headless is its own project type (Netlify deploy + API backend). Netlify preview will become a required check unique to headless. Splitting now avoids splitting later. |

## Repository layout

```
.github/
  workflows/
    ci-standalone.yml     # reusable (workflow_call)
    ci-headless.yml       # reusable (workflow_call)
    ci-wordpress.yml      # reusable (workflow_call)
  PULL_REQUEST_TEMPLATE.md
  ISSUE_TEMPLATE/
    task.md
scripts/
  check-version-bump.mjs
  check-changelog.mjs
  check-approved-deps.mjs
  check-plugin-version-sync.mjs
  check-plugin-zip.mjs
templates/
  approved-deps.json      # empty allow-list starter to copy
.claude/
  settings.json           # auto-approve permissions
docs/
  setup-prompt.md         # this setup prompt, saved verbatim
README.md
```

## Consumption model

Reusable workflows live here. A consumer repo adds one small caller workflow:

```yaml
# consumer repo: .github/workflows/ci.yml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-standalone.yml@main
    with:
      node_version: '20'
```

Because a reusable workflow does **not** automatically have its own repo checked out (the
runner starts with the *caller's* code), each reusable workflow performs a second
`actions/checkout` of this foundation repo into `.foundation/` to access the shared scripts.
Since the repo is public, the default `GITHUB_TOKEN` suffices — no PAT required.

The scripts version is controlled by a `foundation_ref` input (default `main`); the README
recommends pinning both the `uses:` ref and `foundation_ref` to the same tag for
reproducibility.

## Reusable workflow behaviour

### Shared across all three

Every workflow, on `pull_request`, runs these steps in order:

1. **Checkout** consumer repo with `fetch-depth: 0`; fetch the base branch. Then checkout the
   foundation repo into `.foundation/` at `foundation_ref`.
2. **Setup Node** (`node_version` input, default `20`).
3. **Install** — `npm ci` when a lockfile exists, else `npm install`.
4. **Lint** — `lint_command` input (default `npm run lint`).
5. **Build** — `build_command` input (default `npm run build`).
6. **Version bump check** — `node .foundation/scripts/check-version-bump.mjs`.
7. **Changelog check** — `node .foundation/scripts/check-changelog.mjs`.
8. **Approved-deps check** — `node .foundation/scripts/check-approved-deps.mjs`.
9. **Playwright** — `npx playwright install --with-deps` then `test_command`
   (default `npx playwright test`).

Common `workflow_call` inputs (all optional except where noted):
`node_version`, `working_directory`, `lint_command`, `build_command`, `test_command`,
`foundation_ref`.

### ci-standalone.yml

- Playwright runs against the **local build**. The project's Playwright `webServer` config is
  expected to serve the build. No extra inputs beyond the shared set.

### ci-headless.yml

- Same shape as standalone (build + Playwright against the local build / local API server).
- Distinct file because headless is its own project type (Netlify deploy, API backend).
- Contains a clearly-marked **extension point** for the Netlify-preview required check that
  will be headless-only. Not implemented now; documented so it has an obvious home.

### ci-wordpress.yml

Shared steps **1–8** apply (install/lint, build, version bump, changelog, approved-deps),
**plus**:

- **PHP setup** via `shivammathur/setup-php` (`php_version` input, default `8.2`).
- **PHP syntax check** — `php -l` across all `*.php` files; fail on any parse error.
- **PHPCS** — run **only if** a phpcs config exists (`phpcs.xml`, `phpcs.xml.dist`, or
  `.phpcs.xml`); otherwise skipped.
- **Plugin version sync** — `node .foundation/scripts/check-plugin-version-sync.mjs`.
- **Plugin zip check** — `node .foundation/scripts/check-plugin-zip.mjs`.
- **Playwright** runs against `preview_url` (required input) — passed to the tests as
  `PLAYWRIGHT_BASE_URL` and `BASE_URL`. **No** WordPress/DB is spun up in CI.

WordPress-only inputs: `preview_url` (**required**), `plugin_slug` (optional; inferred if
empty), `php_version` (default `8.2`).

## Check scripts — generic contracts

All scripts are standalone `.mjs`, zero dependencies, configured by environment variables,
and exit non-zero with a clear, actionable message on failure. Nothing is hardcoded to a
specific project. Base-branch comparisons use `git show origin/<base>:<file>` and
`git diff --name-only origin/<base>...HEAD`.

### check-version-bump.mjs
- **Env:** `BASE_REF` (base branch), `PKG_PATH` (default `package.json`).
- Reads current version from `PKG_PATH`; reads base version via
  `git show origin/$BASE_REF:$PKG_PATH`.
- Fails unless current version is a **strictly greater** semver than base.
- If the base file does not exist (first build / new project), **passes** (nothing to compare).
- Includes a small self-contained semver comparator (no dependency).

### check-changelog.mjs
- **Env:** `BASE_REF`, `CHANGELOG_PATH` (default `CHANGELOG.md`).
- Uses `git diff --name-only origin/$BASE_REF...HEAD`; fails if `CHANGELOG_PATH` is not among
  the changed files. (Since a version bump is always required, the changelog must always move
  with it.)
- First build (no base): require the changelog file to exist.

### check-approved-deps.mjs
- **Env:** `PKG_PATH` (default `package.json`), `APPROVED_DEPS_PATH` (default
  `approved-deps.json`).
- Loads `dependencies` + `devDependencies` from `package.json` and the corresponding
  allow-lists from `approved-deps.json`.
- Fails, listing offenders, if any dependency name is **not present** in the matching
  allow-list. Membership is by name (supports both object `{name: range}` and array `[name]`
  allow-list forms).

### check-plugin-version-sync.mjs (WordPress)
- Locates the main plugin file (the `*.php` containing a `Plugin Name:` header) and reads its
  `Version:` header.
- If `package.json` exists, fails when the two versions differ. If no `package.json`, passes.

### check-plugin-zip.mjs (WordPress)
- **Env:** `PLUGIN_SLUG` (optional; inferred from the main plugin file/directory if empty).
- Globs the repo for `<slug>*.zip`. Fails if **more than one** matches (only the current
  version's zip should be present). Zero matches is allowed.

## approved-deps.json starter

```json
{
  "dependencies": {},
  "devDependencies": {}
}
```

Empty allow-list. Copied into a consumer repo's root and filled in per project. With an empty
list, any declared dependency fails the check — this is intentional: it forces each project to
explicitly approve its dependencies.

## Templates

### Pull request template (`.github/PULL_REQUEST_TEMPLATE.md`)
- **What this PR does** — summary.
- **First build or change?** — mark which.
- **Checklist:** correct branch used · version bumped · CHANGELOG updated · dependencies
  approved (in `approved-deps.json`) · lint + build passing locally · plugin zip rebuilt
  (if a WordPress plugin) · Netlify preview checked (if headless / relevant).

### Issue template (`.github/ISSUE_TEMPLATE/task.md`)
- **Goal** · **Scope** · **Out of scope** · **Acceptance criteria** · **Project type**
  (standalone / headless / WordPress plugin).

## Claude Code permissions (`.claude/settings.json`)

`permissions.allow` covers routine, already-approved actions so a session never stops to ask:

- **Git:** status, diff, log, add, commit, branch, checkout, switch, restore, fetch, pull,
  push, merge, stash, rev-parse, show.
- **Build/lint/test:** `npm ci`, `npm install`, `npm run build`, `npm run lint`,
  `npm run test`, `npm test`, `npx playwright`, `node`.
- **Approved connectors:** the Playwright MCP tools (and a documented place to add more).

No `defaultMode` override — anything outside the allow-list still prompts. This one file both
governs work in the foundation repo and serves as the copy-me template for other repos.

## Docs

- `docs/setup-prompt.md` — this setup prompt, saved verbatim, so the system is documented in
  the one place it lives.
- **Team Guidelines** — canonical copy lives in ClickUp; the README links out to it rather
  than duplicating it here.

## README

Explains what the repo is and shows the minimal caller snippets for each of the three
workflow types, the `foundation_ref` pinning recommendation, the list of files a consumer copies
(`approved-deps.json`, PR/issue templates, `.claude/settings.json`), and a pointer to the
Team Guidelines in ClickUp.

## Out of scope

- Spinning up WordPress + a database in CI (WordPress tests run against a staging/preview URL).
- Publishing the scripts as an npm package or composite action.
- Implementing the headless Netlify-preview required check now (extension point only).
- A self-CI pipeline for the foundation repo itself (may be added later).

## Testing / verification

- Node scripts are validated with `node --check` and exercised against small fixture
  scenarios (bumped vs not bumped, changelog present vs missing, approved vs unapproved dep,
  matching vs mismatched plugin version, one vs many zips).
- Workflow YAML is validated for syntax; the reusable-workflow interface (inputs/defaults) is
  reviewed against the caller snippets in the README.
