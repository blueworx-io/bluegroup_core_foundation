# Starter Prompt — WordPress Plugin

The Starter Prompt for WordPress plugin projects. Create the empty repo, open it
in Claude Code, and paste everything below the line.

It is written to be self-contained: following it produces a repo that passes
`ci-wordpress.yml` on its first pull request, with no further reading required.
The reference docs it points at are for depth, not for completeness.

> **The standing rule this prompt exists to carry:** no page builders. A
> WordPress site of ours is built **as a plugin, in code** — never straight into
> WordPress core, never as a loose theme, never in Elementor or its equivalents.

---

Set this repo up as a BlueWorx WordPress plugin project.

Work on a branch and open a pull request at the end — the shared CI guardrails must
pass before it merges, exactly like any other change. Ask me for the plugin's display
name and slug before you start if I have not already given them.

## 1. Carry in the shared rules

Copy these from `blueworx-io/bluegroup_core_foundation` into this repo:

```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/CLAUDE.md.template
curl -o approved-deps.json https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/templates/approved-deps.json
mkdir -p .github/ISSUE_TEMPLATE .claude
curl -o .github/PULL_REQUEST_TEMPLATE.md https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.github/PULL_REQUEST_TEMPLATE.md
curl -o .github/ISSUE_TEMPLATE/task.md https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.github/ISSUE_TEMPLATE/task.md
curl -o .claude/settings.json https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.claude/settings.json
```

The hook below stops a session writing an admin screen that isn't built from the design
system, and it goes quiet on a machine with no foundation checkout beside the project.

```bash
mkdir -p .claude/hooks
curl -o .claude/hooks/admin-ui-adherence.mjs https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.claude/hooks/admin-ui-adherence.mjs
```

Then pull in the shared admin design system, which is a Claude Code skill folder rather
than a single file:

```bash
mkdir -p .claude/skills
git clone -q --depth 1 --branch v1 \
  https://github.com/blueworx-io/bluegroup_core_foundation.git /tmp/bw-foundation
cp -R /tmp/bw-foundation/.claude/skills/blueworx-admin-design .claude/skills/
rm -rf /tmp/bw-foundation
```

`v1` has to be the same ref as `foundation_ref` in this project’s CI workflow. CI
compares the committed folder against that ref, so pulling `main` instead installs
files newer than the baseline it compares to and fails the design system check.

Taking a later design system is therefore a deliberate step, not a re-run: move the
`@ref` and `foundation_ref` in `.github/workflows/ci.yml` and the `--branch` here
together, in one pull request.

`CLAUDE.md` is the condensed global rules, carried into the repo so the guardrails
hold regardless of whose machine opens it. Do not edit it to suit this project.

## 2. Plugin skeleton

- The **main plugin file** is `<slug>.php` in the repo root — depth 2 at most, and the
  root is what everything else assumes. It must carry a `Plugin Name:` header and a
  `Version:` header. CI finds the plugin by looking for `Plugin Name:`.
- Define a version constant in the same file and keep it equal to the header. One
  version, three places: the header, the constant, and `package.json`.
- `uninstall.php` that removes the plugin's own options and tables, nothing else.
- Code lives in `includes/`, front-end assets in `assets/`. Namespace or prefix every
  global function, class, option and hook with the plugin's own prefix — a plugin
  shares one PHP process with every other plugin on the site.
- Escape on output, sanitise on input, nonce every form and admin-post action, and
  capability-check every admin screen and REST route.
- **Admin screens come from the shared `blueworx-admin-design` system**, not from
  hand-written markup. It is a Claude Code skill committed in `bluegroup_core_foundation`
  at `.claude/skills/blueworx-admin-design/`; copy that folder to the same path in this
  repo (step 1 above) and invoke the skill before writing any settings page, tab, table,
  notice or form. Also copy its `styles.css` to `assets/blueworx-admin-design.css`,
  its `fonts/` to `assets/fonts/` — those exact paths, since the stylesheet
  loads the webfonts from beside itself — and its
  `assets/icons/lucide-icons.js` to `assets/blueworx-admin-icons.js`. Enqueue the
  stylesheet on the plugin’s admin pages, and the icon file as a script module on
  any screen rendered as PHP rather than React, or every `data-lucide` element on
  it renders empty; nothing is loaded from a shared package at runtime.
  CI compares those copies against the foundation
  on every pull request and fails the run if either has drifted, so keep them
  verbatim: no minifying, no local tweaks. CI and the hook also refuse a
  colour, size, font or shadow written by hand, a hand-drawn icon, an inline
  style, WordPress core's own admin classes, a second admin stylesheet, or a
  `bw-` class the system doesn't define. If a pattern is missing, add it to
  the design system rather than inventing a one-off here. This governs
  wp-admin only — the plugin's front-end design stays its own.
- **Any screen where somebody edits content is a page editor screen.** Copy the design system's
  `editor/php/` to `blueworx-page-editor/` and `editor/blueworx-page-editor.js` to
  `assets/blueworx-page-editor.js`, require the loader
  (`blueworx-page-editor/blueworx-page-editor.php`) from the main plugin file, and register the
  screen as a field schema — tabs, panels, fields, which capability each needs, and whether it stores
  to a post type or to options. Do not write the markup, the save handler, the dirty tracking or the
  JavaScript: the library owns all of it, so every plugin's editor behaves the same way. Anything
  record-like must be a registered post type; the library will not open a record editor without one.
  CI hash-checks both copies and warns on a hand-written editor screen.

## 3. Versioning files

- `package.json` — name matching the slug, `version` **identical to the plugin
  header**, and real `lint` / `build` / `test` scripts. CI fails on a mismatch.
- `CHANGELOG.md` — Keep a Changelog format, semver. CI fails any pull request that
  does not touch it, including CI-only ones.
- Start at `0.1.0`.

## 4. PHP tooling

- `composer.json` with `squizlabs/php_codesniffer` and `wp-coding-standards/wpcs` as
  dev dependencies.
- `phpcs.xml.dist` using the `WordPress` standard, scoped to the plugin's own PHP and
  excluding `vendor/`, `node_modules/` and the test harness directory. CI runs PHPCS
  whenever this file exists — so it exists from day one, and the tree is clean before
  the first PR rather than after.
- If you add PHPUnit, `phpunit.xml.dist` is enough for CI to pick it up. Unit tests run
  without a WordPress runtime; anything needing a real site belongs in Playwright.

## 5. Testing — the local WordPress harness

Tests run against a **disposable real WordPress the run provisions itself** (PHP +
SQLite, no Docker, no hosting). Never against a hosted staging site.

- `playwright.config.js` reads `PLAYWRIGHT_BASE_URL` for `baseURL`, and pins
  `workers: 1` — the specs mutate site-wide state, so parallel workers against one
  site make one spec's "off" another spec's "on".
- Keep the json reporter: `--reporter=list,json`. CI reads it to prove tests ran.
- Write at least one spec that **actually asserts something** on a real page. A suite
  that skips itself exits 0, so CI fails any run that executes zero tests. This gate
  exists because a placeholder URL once let a whole suite skip while reporting green
  for months — do not start the project already inside that failure.
- Add `.wp-test/` to `.gitignore`.

Locally:

```bash
node ../bluegroup_core_foundation/scripts/wp-test-env.mjs up --plugin .
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw \
  npx playwright test --workers=1
```

Full guide: `docs/wordpress-test-harness.md` in the foundation.

## 6. CI caller workflow

`.github/workflows/ci.yml`, and nothing more — the rules live in the foundation:

```yaml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-wordpress.yml@v1
    with:
      plugin_slug: <slug>
      use_local_wordpress: true
      foundation_ref: v1
    secrets: inherit
```

- `foundation_ref` must match the `@ref`. They default apart — `foundation_ref`
  defaults to `main` — so pinning only the first runs the v1 workflow against
  whatever is on the foundation's main branch today.
- `secrets: inherit` stays even on the local harness: specs that sign in to wp-admin
  need `WP_ADMIN_USER` / `WP_ADMIN_PASS`, and without them they skip themselves.
- Do **not** use `preview_url` for a new project, and do not set `allow_zero_tests`.

## 7. Releases and auto-updates

Plugins update themselves on live sites from GitHub Releases. Wire all three parts up
now, not later:

1. `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/release-wordpress.yml@v1
    with:
      plugin_slug: <slug>
      foundation_ref: v1
    permissions:
      contents: write
```

   `permissions: contents: write` is required — a reusable workflow cannot widen the
   permissions its caller gives it, and without it publishing fails with a 403.

2. Vendor the Plugin Update Checker and paste in
   `templates/plugin-update-checker-bootstrap.php` from the foundation.
3. Follow `docs/wordpress-auto-updates.md` for the per-site token and the release
   checklist.

**Tagging is a release decision, not a build step.** Never push a tag on your own
initiative.

## 8. The zip build script

Add `bin/build-zip.sh` (or `scripts/build-plugin.mjs`) that stages the deployable
plugin folder from an **explicit allowlist** and verifies the artifact it just built.

- Allowlist, not denylist: a new development directory should be excluded because
  nobody added it, rather than shipped because nobody remembered to exclude it.
- Name the artifact `<slug>-<version>.zip`, taking the version from the plugin header,
  so the file on disk says which build it is. The folder **inside** the archive stays
  `<slug>/` with no version — WordPress installs to that folder name, and versioning it
  would install a second copy of the plugin on every update.
- Verify the result, not the intent — list the built archive and assert every entry
  reads `<slug>/…` with forward slashes, nested exactly one level, with
  `<slug>/<slug>.php` directly inside.
- Never `Compress-Archive` on Windows: it writes backslash entries and WordPress then
  reports "Plugin file does not exist." on activate. Use bsdtar or `zip`.
- Expose it as `npm run build:zip` so nobody hand-assembles an artifact.
- `blueworx_labs_clubhouse`'s `bin/build-zip.sh` and
  `bluegroup_project_afristream`'s `scripts/build-plugin.mjs` are the two worked
  examples.

The shared CI also checks, on every PR, what *would* ship — anything the foundation's
exclude list misses is a CI failure rather than a discovery on a live site. Project
specific additions go in the `exclude_paths` input, set identically on the CI and
release callers.

Only ever one `<slug>*.zip` in the repo; CI fails on more.

## 9. approved-deps.json

List every dependency and devDependency this setup introduces, and **nothing beyond
them**. CI fails on anything declared in `package.json` that is not on the list. A new
dependency is a decision I make, not one the build makes.

## 10. Repo settings

- Branch protection on `main`: pull requests required, `guardrails` required to pass,
  no direct pushes.
- Default branch `main`.

## 11. Finish

Bump the version, update `CHANGELOG.md`, run the linter once and show me what it says,
then open the pull request. Do not merge it.

---

## Checklist — what the first PR must satisfy

| Check | What it wants |
|---|---|
| Lint | `npm run lint` passes |
| Build | `npm run build` passes |
| PHP syntax | every `.php` parses |
| PHPCS | clean against `phpcs.xml.dist` (WordPress standard) |
| Version bump | plugin header version above the base branch |
| Changelog | `CHANGELOG.md` touched in the PR |
| Approved deps | nothing in `package.json` missing from `approved-deps.json` |
| Version sync | plugin header version equals `package.json` version |
| Plugin zip | at most one `<slug>*.zip` in the repo |
| Zip content | nothing development-only would ship |
| Playwright | at least one test **executes** — skipped is not passed |
