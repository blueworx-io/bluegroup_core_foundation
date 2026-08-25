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
curl -L -o puc.zip https://github.com/YahnisElsts/plugin-update-checker/archive/refs/tags/v5.7.zip
unzip -q puc.zip && rm puc.zip
mv plugin-update-checker-5.7 plugin-update-checker
git add plugin-update-checker && git commit -m "chore: vendor plugin-update-checker v5.7"
```

Committed deliberately: no Composer step, no build dependency, and the zip the
release workflow produces is self-contained. Upgrading the library is a manual
swap of that folder — check for a new tag when you touch a plugin.

### 2. Wire it into the main plugin file

Copy [`templates/plugin-update-checker-bootstrap.php`](../templates/plugin-update-checker-bootstrap.php)
into the plugin's main `.php` file, below the plugin header, and replace `<repo>`
and `<slug>`. `<slug>` must equal the plugin's folder name — the same string also
has to match the `plugin_slug` workflow input in step 3. Those two places (plus
the site's installed directory name) all disagreeing is the exact failure mode
in the troubleshooting section below, and nothing in the pipeline checks that
they agree, so it's worth double-checking by eye.

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
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/release-wordpress.yml@v1
    with:
      plugin_slug: my-plugin
      foundation_ref: v1
    permissions:
      contents: write
```

`permissions: contents: write` is required — a reusable workflow cannot widen the
permissions its caller gives it, so without this the publish step fails with 403.

Inputs, all optional except as noted:

| Input | Default | Purpose |
|-------|---------|---------|
| `plugin_slug` | inferred from the main plugin file | Folder name inside the zip. **Prefer omitting this** — it must be identical to the plugin's folder name on the site and to the third argument of `buildUpdateChecker()` in the bootstrap, and letting it derive from the main plugin file removes one of the three places that string has to be kept in sync by hand. Only set it explicitly if the plugin's folder name doesn't match its main file's basename. |
| `node_version` | `20` | Only used when a `package.json` exists |
| `build_command` | `npm run build` | Skipped when there is no `package.json` |
| `exclude_paths` | none | Extra rsync patterns to keep out of the zip |
| `foundation_ref` | `main` | Ref this repo's scripts come from — pin it alongside your CI's |

The zip already excludes `.git`, `.github`, `.foundation` (the foundation's own
scripts, checked out only to run the release build), `.claude`, `node_modules`,
`tests`, `test-results`, `playwright-report`, `docs`, `playwright.config.*`,
`package.json`, `package-lock.json`, `approved-deps.json`, `.editorconfig`,
`.gitignore`, `.gitattributes`, `phpcs.xml`, `phpcs.xml.dist`, `.phpcs.xml`,
`.eslintrc*`, `eslint.config.*`, and any `*.zip`. Use `exclude_paths` only for
something project-specific.

Build output **is** included — the workflow stages outside the repo (into a temp
directory, not a `dist/` next to your working tree), so a plugin that builds its
assets to a top-level `dist/` ships those assets like any other file in the repo.

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
3. A clean `<slug>/` tree is staged and zipped as `<slug>-<version>.zip`, and the
   archive is verified to nest exactly one level with the main plugin file
   present. The version is in the filename only — the folder inside stays
   `<slug>/`, because WordPress installs to that folder name and a versioned one
   would install a second copy of the plugin on every update.
4. A GitHub Release is created for the tag with the zip attached. The body is
   the `CHANGELOG.md` section for that version, matched by heading (`## 1.2.0`
   or `## [1.2.0] ...`); if no section for the version is found, GitHub's
   auto-generated notes are used instead.
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
whose folder is named `<repo>-<version>` (GitHub drops the tag's leading `v`,
e.g. `plugin-update-checker-5.7` for tag `v5.7`).

**The update ships dev files.** `enableReleaseAssets()` is missing — same cause
as above.

**The release build fails on the tag check.** Intended. The header and the tag
disagree. Fix the header on `main`, then delete and re-push the tag:

```bash
git tag -d v1.2.0 && git push origin :refs/tags/v1.2.0
```

**`gh release create` fails with 403.** The caller workflow is missing
`permissions: contents: write`.
