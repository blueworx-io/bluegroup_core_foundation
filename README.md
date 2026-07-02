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

## What's here

- [`CLAUDE.md.template`](CLAUDE.md.template) — condensed global rules every project
  copies in as its own `CLAUDE.md`.

The reusable CI guardrail workflows (standalone / headless / WordPress), the shared
check scripts, the `approved-deps.json` starter, the shared Claude Code settings
(`.claude/settings.json`), and the PR/issue templates are part of the foundation
build and are documented here as they land.
