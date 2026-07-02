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

> **Skills note:** the approved skills load automatically from the shared Claude
> Code settings, with one exception — **graphify** is a per-machine Python CLI.
> Install it once per machine with `uv tool install graphifyy && graphify install`.

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
```

All inputs have sensible defaults (`node_version`, `lint_command`, `build_command`,
`test_command`, `foundation_ref`; WordPress adds `php_version`, `preview_url`,
`plugin_slug`). Override only what a project needs.

> **Pin for reproducibility:** replace `@main` with a tag (e.g. `@v1`) and set the
> matching `foundation_ref: v1` so the workflow and the shared check scripts move
> together.

## What each project copies in

- [`CLAUDE.md.template`](CLAUDE.md.template) → the project's `CLAUDE.md`
- [`templates/approved-deps.json`](templates/approved-deps.json) → the project's
  `approved-deps.json` (then fill in its allowed dependencies)
- [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) and
  [`.github/ISSUE_TEMPLATE/task.md`](.github/ISSUE_TEMPLATE/task.md)
- [`.claude/settings.json`](.claude/settings.json) — shared permissions + approved-skill
  enablement

## What's here

- `.github/workflows/` — the three reusable guardrail workflows
- `scripts/` — the generic check scripts the workflows call (version bump, changelog,
  approved deps, plugin version-sync, plugin zip) plus their tested cores in `scripts/lib/`
- `templates/approved-deps.json` — the empty allow-list starter
- `.github/` PR + issue templates
- `.claude/settings.json` — shared Claude Code permissions and approved skills
- `CLAUDE.md.template` — condensed global rules every project carries as its `CLAUDE.md`
- `docs/` — the design spec, implementation plan, and the saved setup prompt

_The Team Guidelines doc (the other reference) lives in ClickUp._
