# WordPress Plugin Auto-Updates via GitHub Releases — Design

**Date:** 2026-07-21
**Status:** Approved (design), pending spec review

## Purpose

Every WordPress plugin we build must auto-update on live sites when a new release is
published on GitHub — no manual zip uploads. The mechanism is standardised **here in the
foundation** so each plugin repo adopts it with a short caller workflow and a paste-in
bootstrap, exactly as it already adopts `ci-wordpress.yml`.

This repo contains no plugin, so nothing is "applied" to a plugin here. The deliverables
are the reusable pieces plus the docs that tell a plugin project how to wire them up.

## Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Update library | **yahnis-elsts/plugin-update-checker (PUC) v5**, vendored and committed into each plugin repo at `plugin-update-checker/` | No build step, no Composer in every plugin, works on any host, zip is self-contained. Cost: manual library upgrades. |
| Update source | **GitHub Release asset** (the built zip), via PUC's `enableReleaseAssets()` | GitHub's auto-generated source tarball has the wrong top-level folder name and ships dev files. Without this call, updates install to a wrongly-named folder and deactivate the plugin. |
| Release trigger | **Push of a `v*` tag** to the plugin repo | Tag is the single human action; everything downstream is automatic. |
| Release workflow shape | **Reusable workflow** (`workflow_call`) in the foundation: `.github/workflows/release-wordpress.yml` | Matches the existing `ci-*.yml` consumption model; consumers add ~10 lines. |
| Repo visibility | Plugin repos are **private**; the foundation stays **public** | A private caller can still `uses:` a public reusable workflow. Sites therefore need a token to fetch updates. |
| Token placement | `BLUEWORX_PLUGIN_UPDATE_TOKEN` constant in each site's `wp-config.php`, applied via `setAuthentication()` | Outside the plugin and outside the repo. Guarded so the same code works untouched if a repo is ever public. |
| Tag/header agreement | Enforced in CI by a new check script, `check-release-tag.mjs` | See below — this is the failure mode most worth a guardrail. |
| Zip construction in CI | **`zip -r`** on the Ubuntu runner | GNU `tar` cannot write zip format. The `bsdtar` rule in `CLAUDE.md.template` governs hand-built zips on Windows and is unchanged. |

### Why the tag/header check earns its place

If a plugin is tagged `v1.2.0` while its header still reads `Version: 1.1.0`, the release
publishes and looks completely healthy. But PUC compares the *header inside the released
zip* against the installed version, finds them equal, and reports "no update available"
forever. Sites silently stop updating with no error anywhere. Failing the release build on
a mismatch turns a silent, invisible failure into a loud one.

## Deliverables

```
.github/workflows/
  release-wordpress.yml            # NEW — reusable release workflow
scripts/
  check-release-tag.mjs            # NEW — tag vs plugin-header version
  lib/
    checks.mjs                     # EXTEND — pure releaseTag() core
    checks.test.mjs                # EXTEND — cases for it
templates/
  plugin-update-checker-bootstrap.php   # NEW — paste-in wiring
docs/
  wordpress-auto-updates.md        # NEW — the standard + release checklist
README.md                          # EXTEND — release section
CLAUDE.md.template                 # EXTEND — rule for plugin projects
docs/setup-prompt.md               # EXTEND — reference from WordPress setup
```

### 1. `release-wordpress.yml`

Caller, in the plugin repo:

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

Inputs, all defaulted except where noted, mirroring `ci-wordpress.yml` conventions:

| Input | Default | Purpose |
|-------|---------|---------|
| `plugin_slug` | `''` | Zip folder name. Inferred from the main plugin file when empty. |
| `node_version` | `'20'` | Only used when a `package.json` exists. |
| `build_command` | `npm run build` | Skipped when there is no `package.json`. |
| `exclude_paths` | `''` | Newline-separated extra paths to leave out of the zip. |
| `foundation_ref` | `main` | Ref this repo's check scripts come from. |

Job steps:

1. Checkout the tagged commit; checkout the foundation at `foundation_ref` into `.foundation`.
2. Resolve the main plugin file and slug (reusing `findPluginMainFile` semantics).
3. **Tag check** — `node .foundation/scripts/check-release-tag.mjs`, with `RELEASE_TAG` from
   `github.ref_name`. Fails the release on a mismatch.
4. Setup Node and run `build_command` when a `package.json` exists.
5. Stage `dist/<slug>/` — a copy of the tree minus the default exclude list plus
   `exclude_paths`: `.git`, `.github`, `.foundation`, `node_modules`, `dist`, `tests`,
   `test-results`, `playwright-report`, `docs`, `.claude`, `playwright.config.*`,
   `package*.json`, `*.zip`, `approved-deps.json`, `.editorconfig`, `.gitignore`,
   `.gitattributes`, `phpcs.xml*`, `.eslintrc*`, `eslint.config.*`.
6. `zip -r ../<slug>.zip <slug>` from inside `dist/`.
7. **Verify the archive** — `unzip -l` output must show every entry beginning `<slug>/`,
   and must contain `<slug>/<slug>.php`. Fails otherwise.
8. Publish a GitHub Release for the tag with the zip attached as an asset, using the
   matching section of `CHANGELOG.md` as the body when one can be extracted, falling back
   to auto-generated notes.

`permissions: contents: write` is declared by the caller (a reusable workflow cannot widen
its own permissions), and the README snippet shows it — omitting it is the most likely
first-run failure.

### 2. `check-release-tag.mjs`

CLI wrapper in the established style: gather inputs via `lib/io.mjs`, delegate to a pure
function in `lib/checks.mjs`, print `result.message`, exit `result.ok ? 0 : 1`.

- Reads `RELEASE_TAG` from env (`v1.2.0`), and `PLUGIN_FILE` optionally overriding detection.
- Uses `findPluginMainFile` + `parsePhpHeaderVersion`, then `parseSemver` on both sides.
- Passes only when tag and header parse as valid semver and are equal.
- Fails, with a message naming both values, when: no plugin file is found; no `Version:`
  header; either value is not valid semver; or they differ.

Pure core `releaseTag({ tag, headerVersion, pluginFile })` is unit-tested in
`checks.test.mjs` alongside the existing cores — `foundation-ci.yml` already runs that
suite on every PR, so the new cases are covered automatically.

### 3. `templates/plugin-update-checker-bootstrap.php`

Paste-in block for the plugin's main file, below the header. Documented, and deliberately
explicit about the three things that break silently if omitted:

```php
require_once plugin_dir_path( __FILE__ ) . 'plugin-update-checker/plugin-update-checker.php';

use YahnisElsts\PluginUpdateChecker\v5\PucFactory;

$blueworx_update_checker = PucFactory::buildUpdateChecker(
    'https://github.com/blueworx-io/<repo>/',
    __FILE__,
    '<slug>'   // must match the plugin folder name, or WordPress installs a duplicate
);

// Private repo: token lives in wp-config.php, never in the plugin or the repo.
if ( defined( 'BLUEWORX_PLUGIN_UPDATE_TOKEN' ) && BLUEWORX_PLUGIN_UPDATE_TOKEN ) {
    $blueworx_update_checker->setAuthentication( BLUEWORX_PLUGIN_UPDATE_TOKEN );
}

// Use the built zip attached to the Release, not GitHub's source tarball.
$blueworx_update_checker->getVcsApi()->enableReleaseAssets();
```

The template carries `<repo>` / `<slug>` placeholders and a comment stating both must be
substituted; `docs/wordpress-auto-updates.md` repeats that as a checklist item.

### 4. `docs/wordpress-auto-updates.md`

The standard itself:

- One-time plugin setup: vendor PUC into `plugin-update-checker/`, paste the bootstrap,
  add `.github/workflows/release.yml`, confirm the `Version:` header is present and valid.
- Per-site setup: add `define( 'BLUEWORX_PLUGIN_UPDATE_TOKEN', '...' );` to `wp-config.php`
  above the "stop editing" line. Fine-grained PAT, read-only Contents on the plugin repos.
  Note that the token is what makes a private repo's releases reachable — without it the
  site shows no updates and logs nothing obvious.
- Release checklist (also reproduced in the README):
  1. Bump the `Version:` header (and `package.json` if present — CI already enforces they match).
  2. Update `CHANGELOG.md`.
  3. Merge to `main`.
  4. `git tag v1.2.0 && git push origin v1.2.0`.
  5. Automatic from here: build, zip, verify, publish Release with the asset; sites see the
     update within ~12h, or immediately via Dashboard → Updates → Check again.
- Troubleshooting: no update showing (token/tag/header), update installs to a duplicate
  folder (missing slug arg), update contains dev files (missing `enableReleaseAssets`).

## Out of scope

- Composer-based distribution of PUC, or the foundation vendoring a copy of the library.
- Automating the version bump or tag creation — bumping stays a deliberate human step.
- Releasing anything other than WordPress plugins (standalone/headless keep manual zips).
- Rollback tooling; reverting means tagging a higher version with the previous code.
- WordPress.org / SVN publishing.

## Testing / verification

- `releaseTag()` unit tests in `checks.test.mjs`: equal, mismatched, `v`-prefixed vs bare,
  non-semver tag, missing header, missing plugin file.
- `node --check` on the new script; YAML syntax validated for the new workflow.
- The zip-shape assertion is exercised in-workflow (step 7) on every real release, so a
  malformed archive can never reach a Release asset.
- End-to-end verification happens on the first real plugin adoption: tag a patch release
  and confirm a live site offers and installs it.
