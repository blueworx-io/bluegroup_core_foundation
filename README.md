# bluegroup_core_foundation

The shared **foundation** for our projects — the one place our development
guardrails live, so every other project points here instead of repeating the
rules per repo.

Each project is its own standalone repo and points at this foundation for shared
CI guardrails, permissions, and skills. Only the *process* is shared — not the
design.

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
checks dependencies against the project's `approved-deps.json`, and runs Playwright.

**Standalone**

```yaml
# .github/workflows/ci.yml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-standalone.yml@main
```

**Headless**

```yaml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-headless.yml@main
```

**WordPress plugin** (Playwright runs against a staging/preview URL — no WordPress or
database is spun up in CI):

```yaml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-wordpress.yml@main
    with:
      preview_url: https://staging.example.com
      plugin_slug: my-plugin
    secrets: inherit
```

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
`plugin_slug`, `wp_login_path`). Override only what a project needs.

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

> **Pin for reproducibility:** replace `@main` with a tag (e.g. `@v1`) and set the
> matching `foundation_ref: v1` so the workflow and the shared check scripts move
> together.

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
  WordPress release workflow (`release-wordpress.yml`), plus this repo's own
  `foundation-ci.yml` (runs the check-script tests on every PR; required by branch
  protection)
- `scripts/` — the generic check scripts the workflows call (version bump, changelog,
  approved deps, plugin version-sync, plugin zip, tests-actually-ran, release-tag match)
  plus the `plugin-info` resolver and their tested cores in `scripts/lib/`
- `templates/` — `approved-deps.json` (the empty allow-list starter) and
  `plugin-update-checker-bootstrap.php` (paste-in auto-update wiring for plugins)
- `.github/` PR + issue templates
- `.claude/settings.json` — shared Claude Code permissions and approved skills
- `CLAUDE.md.template` — condensed global rules every project carries as its `CLAUDE.md`
- `docs/` — the design spec, implementation plan, and the saved prompts (setup +
  headless framework starter)

_The Team Guidelines doc (the other reference) lives in ClickUp._
