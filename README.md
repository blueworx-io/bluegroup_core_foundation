# bluegroup_core_foundation

The shared **foundation** for our projects — the one place our development
guardrails live, so every other project points here instead of repeating the
rules per repo.

Each project is its own standalone repo and points at this foundation for shared
CI guardrails, permissions, and skills. Only the *process* is shared — not the
design, with one exception: **WordPress plugin admin screens**, which all come from the
shared `blueworx-admin-design` system committed here at
[`.claude/skills/blueworx-admin-design/`](.claude/skills/blueworx-admin-design/).

## Starter Prompt

New projects are set up by pasting the matching **Starter Prompt** (standalone /
WordPress plugin / headless) into Claude Code — there are no starter template
repos to clone from.

As part of that setup, **every new project copies
[`CLAUDE.md.template`](CLAUDE.md.template) into its own repo root as `CLAUDE.md`.**
This carries the condensed global rules into the project itself, so the guardrails
stay consistent regardless of whose machine the project is opened on — rather than
relying on each person's personal `~/.claude/CLAUDE.md`.

```bash
# from a new project's repo root
curl -o CLAUDE.md \
  https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/CLAUDE.md.template
```

All three are saved here, and each is self-contained — paste the matching one into
Claude Code in the new, empty repo and the result passes its CI workflow on the first
pull request:

- [`docs/starter-prompt-standalone.md`](docs/starter-prompt-standalone.md)
- [`docs/starter-prompt-wordpress-plugin.md`](docs/starter-prompt-wordpress-plugin.md)
- headless — the initial setup, then the framework prompt below

For **headless** projects there is a saved follow-on prompt,
[`docs/starter-prompt-headless-framework.md`](docs/starter-prompt-headless-framework.md),
that scaffolds the standard framework — Next.js (App Router) + TypeScript — on top
of the initial setup.

> **Skills note:** the approved skills load automatically from the shared Claude
> Code settings, with one exception — **graphify** is a per-machine Python CLI.
> Install it once per machine with `uv tool install graphifyy && graphify install`.
> The CLI installs to `~/.local/bin` (Windows: `%USERPROFILE%\.local\bin`), which
> may not be on PATH — if `graphify` isn't found, add that directory to PATH rather
> than reinstalling. The template's **Skill Usage Policy** section then tells Claude
> Code *when and how* to fire each skill automatically, so nobody has to remember to
> invoke them.

## Using the CI guardrails

Instead of repeating the rules per repo, a project adds one small caller workflow
that points at the reusable workflow for its type. On every pull request the shared
workflow installs + lints, builds, checks the version bump, checks the changelog,
checks dependencies against the project's `approved-deps.json`, checks a WordPress
plugin's copy of the shared admin design system is current, runs PHPCS and
PHPUnit when their configs are present, and runs Playwright.

**Standalone**

```yaml
# .github/workflows/ci.yml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-standalone.yml@v1
    with:
      foundation_ref: v1
```

**Headless**

```yaml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-headless.yml@v1
    with:
      foundation_ref: v1
```

> **The Netlify deploy preview is a required check on headless projects**, and it is
> the only thing that makes headless different from standalone. The workflow waits
> for Netlify's `deploy-preview` commit status on the PR head, fails if it failed or
> never arrived, then fails again if the preview URL doesn't answer — a green status
> on a site that 404s behind deploy protection is not a preview anyone can review.
> Connect the repo to Netlify, or set `require_netlify_preview: false` and say in the
> caller workflow why this project has no preview.

**WordPress plugin** (Playwright runs against a disposable WordPress the run
provisions itself — PHP + SQLite, no Docker, no hosting):

```yaml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-wordpress.yml@v1
    with:
      plugin_slug: my-plugin
      use_local_wordpress: true
      foundation_ref: v1
    secrets: inherit
```

> **This is the default for new plugin projects.** See
> [`docs/wordpress-test-harness.md`](docs/wordpress-test-harness.md) for how to run
> the same instance locally, and add `.wp-test/` to the project's `.gitignore`.
>
> The alternative — `preview_url: https://staging.example.com` against a hosted
> staging site — is still supported, but it is how CI came to report green while
> running zero tests: a placeholder URL makes every spec skip itself. If you use
> it, point it at something real and pass `WP_ADMIN_USER` / `WP_ADMIN_PASS`.

> **`secrets: inherit` is not optional in practice.** Tests that sign in to wp-admin
> need `WP_ADMIN_USER` and `WP_ADMIN_PASS` as repo secrets. Without them those specs
> skip themselves and the run reports green having asserted nothing. Pass them
> explicitly instead if you prefer:
>
> ```yaml
>     secrets:
>       WP_ADMIN_USER: ${{ secrets.WP_ADMIN_USER }}
>       WP_ADMIN_PASS: ${{ secrets.WP_ADMIN_PASS }}
> ```
>
> The same trap applies to `preview_url`: point it at a real instance. Specs that
> guard on a placeholder URL skip too.

All inputs have sensible defaults (`node_version`, `lint_command`, `build_command`,
`test_command`, `foundation_ref`; WordPress adds `php_version`, `preview_url`,
`plugin_slug`, `wp_login_path`, `changelog_dir`). Override only what a project
needs.

> **Set `foundation_ref` to match the `@ref` you called with.** The `@ref` picks the
> workflow; `foundation_ref` picks the check scripts the workflow checks out. They
> default apart — `foundation_ref` defaults to `main` — so calling `@v1` without it
> runs the v1 workflow against whatever is on `main` today.

> **What ships in a plugin zip is decided in one place**, `scripts/plugin-zip-excludes.txt`.
> Every PR stages the tree the release would zip and fails if anything that must never
> reach a live site survives — a `preview/` harness that bootstraps its own `ABSPATH`,
> test specs, `composer.json`, `CLAUDE.md`, keys. Project-specific additions go in the
> `exclude_paths` input; set it identically on the CI and release callers, or the check
> and the build disagree about what ships.

> **If you override `test_command`, keep the json reporter.** Every workflow fails
> the build when a Playwright run executes zero tests — `npx playwright test` exits
> 0 when everything skips, so without that gate a suite that skips itself reports
> green having asserted nothing. The check reads the json reporter's output, so a
> custom command needs `--reporter=list,json` (or equivalent) or it will fail
> asking for it.
>
> WordPress projects have a temporary escape hatch, `allow_zero_tests: true`,
> which downgrades that failure to a warning for a project that has no working
> test host yet. It is not a fix — a project setting it is not being tested — so
> it should always have an open issue against it and be removed once real tests
> run.

### The changelog check accepts two shapes

A PR passes the changelog guardrail by **either** editing `CHANGELOG.md` — the
original rule, and still the default for a project that does nothing — **or** by
adding a file under a fragment directory, `changelog.d/` by default.

Fragments exist because the first shape has a cost that grows with the number of
open branches. Every entry goes at the top of one shared file, so any two live
branches change the same lines and every merge hits the same conflict. It is
trivial to resolve and easy to resolve wrongly, which is how it earns its keep as
a source of bugs. A file per branch cannot conflict; a release step folds the
pending fragments into `CHANGELOG.md` on the default branch, where nothing is
running in parallel.

A project opts in by creating the directory — there is no workflow change,
because `changelog_dir` already defaults to `changelog.d`. A project without that
directory can never match the second shape, so nothing about its CI changes. Set
`changelog_dir` only to use a different name, or `''` to turn the second shape
off entirely.

The directory's own `README.md` is excluded: documenting the format is not a
changelog entry.

**Opting in means adding the assembly workflow too.** The check above only
*accepts* fragments; something has to clear them, or the directory grows forever
and `CHANGELOG.md` never moves. That is `assemble-changelog.yml`, reusable like
the CI workflows:

```yaml
# .github/workflows/changelog.yml
name: Assemble changelog
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  assemble:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/assemble-changelog.yml@v1
    with:
      version_source: plugin-header   # WordPress plugins; omit for package.json
      foundation_ref: v1
    permissions:
      contents: write
```

It folds the pending fragments into `CHANGELOG.md` under the current version,
deletes them, and commits to the default branch. `version_source` must match
whatever the project's version bump check uses, or the two disagree about which
version an entry belongs to.

> **Branch protection blocks this job.** It commits straight to the default
> branch, so a ruleset requiring pull requests rejects the push and the job
> fails saying so. Add the GitHub Actions bot to the ruleset's bypass list.
> Opening an assembly PR instead does not work: it changes the changelog and
> bumps no version, so the version bump guardrail fails it every time.

## Versioning

The foundation is tagged, and **projects pin to a tag rather than tracking `main`.**
On `@main` every change to a reusable workflow lands in every project's CI the moment
it merges, with no way to stage it.

Two kinds of tag, following the GitHub Actions convention:

- **`v1`** — a *moving* major tag. It is force-moved forward to the newest
  backward-compatible release. This is what projects pin to: they pick up fixes and
  compatible additions without a PR per repo.
- **`v1.0.0`, `v1.1.0`, …** — *immutable* release tags. Cut once, never moved. Pin to
  one of these when a project needs an exact, frozen snapshot (debugging a CI change,
  or a repo that must not move on its own).

A breaking change — removing or renaming a workflow input, changing a check's pass
condition so a previously-green project fails, or a rename that changes how a caller
must invoke a workflow — gets a new major (`v2` / `v2.0.0`) instead. `v1` is never
moved onto it.

### Cutting a release

From an up-to-date `main`:

```bash
git tag -a v1.1.0 -m "v1.1.0"          # immutable release tag
git push origin v1.1.0

git tag -f -a v1 -m "v1 -> v1.1.0"     # move the major tag forward
git push -f origin v1
```

Force-pushing `v1` is deliberate and is the only tag that is ever force-pushed.
Because it moves, it is a convenience, not a reproducibility guarantee — pin an
immutable `v1.x.y` when you need the run to be repeatable.

### Updating a project

Projects normally need no action: `@v1` follows compatible releases. A project moves
deliberately only for a major bump — change both the `@ref` and `foundation_ref` in
its caller workflow (`@v1` → `@v2`, `foundation_ref: v2`) and let its own CI prove
the new major is green before merging.

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
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/release-wordpress.yml@v1
    with:
      plugin_slug: my-plugin
      foundation_ref: v1
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

## What each project copies in

- [`CLAUDE.md.template`](CLAUDE.md.template) → the project's `CLAUDE.md`
- [`templates/approved-deps.json`](templates/approved-deps.json) → the project's
  `approved-deps.json` (then fill in its allowed dependencies)
- [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) and
  [`.github/ISSUE_TEMPLATE/task.md`](.github/ISSUE_TEMPLATE/task.md)
- [`.claude/settings.json`](.claude/settings.json) — shared permissions + approved-skill
  enablement
- WordPress plugins only:
  [`templates/plugin-update-checker-bootstrap.php`](templates/plugin-update-checker-bootstrap.php)
  → pasted into the plugin's main file (see
  [`docs/wordpress-auto-updates.md`](docs/wordpress-auto-updates.md))

## What's here

- `.github/workflows/` — the three reusable guardrail workflows (`ci-*.yml`), the reusable
  WordPress release workflow (`release-wordpress.yml`), the reusable changelog assembly
  workflow (`assemble-changelog.yml`), plus this repo's own
  `foundation-ci.yml` (runs the check-script tests on every PR; required by branch
  protection)
- `scripts/` — the generic check scripts the workflows call (version bump, changelog,
  approved deps, plugin version-sync, design system sync, admin UI adherence, plugin zip,
  plugin zip content, tests-actually-ran, release-tag match, Netlify preview) plus their
  tested cores in `scripts/lib/`, the
  `plugin-info` resolver, `stage-plugin-tree.sh` + `plugin-zip-excludes.txt` (what ships
  in a plugin zip, in one place), and `wp-test-env.mjs`, the local WordPress harness
- `templates/` — `approved-deps.json` (the empty allow-list starter) and
  `plugin-update-checker-bootstrap.php` (paste-in auto-update wiring for plugins)
- `.github/` PR + issue templates
- `.claude/settings.json` — shared Claude Code permissions and approved skills
- `CLAUDE.md.template` — condensed global rules every project carries as its `CLAUDE.md`
- `docs/` — the [Recipe Book](docs/recipe-book.md) (the standard approach to problems
  we keep solving), the design spec, implementation plan, the local WordPress test
  harness guide, and the saved prompts (setup, standalone starter, WordPress plugin
  starter, headless framework starter)

_The Team Guidelines doc (the other reference) lives in ClickUp._
