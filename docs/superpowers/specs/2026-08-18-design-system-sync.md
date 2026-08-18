# Spec — Keeping the WordPress admin design system in sync

## Problem

Every BlueWorx WordPress plugin builds its own wp-admin screens, so each one
looks slightly different and each one gets designed again from scratch. A shared
admin design system (`blueworx-admin-design`, authored in Claude Design) fixes
the design half. It does not fix the *drift* half: once each plugin holds a copy,
the copies fall behind the system and each other, silently.

## What we are building

A PR-time guardrail in the shared WordPress CI workflow that fails a plugin's
pull request when its copy of the design system no longer matches the copy
committed in `bluegroup_core_foundation`.

## Key finding that shapes the design

`ci-wordpress.yml` already checks out the whole foundation repo into
`.foundation` before running the shared checks (see `ci-wordpress.yml:168-173`).
The canonical design system is therefore already on disk next to the plugin on
every CI run. The check is a local comparison of two directories — no network
fetch, no version file, no registry.

## The two copies, and why there are two

1. **`.claude/skills/blueworx-admin-design/`** — the Claude Code skill. This is
   guidance: tokens, component prompts, `styles.css`. It must be committed in
   each plugin so Claude Code reads the same patterns wherever the repo is
   opened. It never ships to a site — `/.claude` is already on the zip exclude
   list (`scripts/plugin-zip-excludes.txt`).
2. **`assets/blueworx-admin-design.css`** — the stylesheet the plugin actually
   enqueues on its admin pages. This *does* ship. There is deliberately no
   shared runtime package, because two BlueWorx plugins on one site can be at
   different versions and only one copy of shared PHP/CSS could win.

Both must match the foundation, and they drift independently — a plugin can pull
new guidance and forget the stylesheet, or hand-edit the shipped CSS.

## Requirements

- **R1.** Fail a plugin's PR when its skill folder differs from the foundation's.
- **R2.** Fail a plugin's PR when its shipped `assets/blueworx-admin-design.css`
  differs from the skill folder's `styles.css`.
- **R3.** Catch drift in both directions: a plugin behind the foundation, and a
  file hand-edited inside a plugin. A byte comparison does both.
- **R4.** A plugin that has not adopted the design system yet must still pass.
  Rolling this out cannot break every existing plugin on day one.
- **R5.** The failure message must name the differing files and print the exact
  commands that fix it. A guardrail that says only "out of sync" gets ignored.
- **R6.** Before the design system folder exists in the foundation, the check
  passes and says so. The check ships before the folder does.
- **R7.** A plugin mid-migration can downgrade the failure to a warning without
  editing the shared workflow.

## Behaviour table

| Foundation has skill | Plugin has skill | Shipped CSS | Result |
|---|---|---|---|
| No | — | — | Pass, "not published yet" (R6) |
| Yes | No | — | Pass, "not adopted" (R4) |
| Yes | Yes, identical | matches | Pass |
| Yes | Yes, identical | missing | Fail — adopted but not enqueued (R2) |
| Yes | Yes, identical | differs | Fail (R2) |
| Yes | Yes, differs | — | Fail, listing files (R1, R5) |

`design_system_sync: warn` turns every Fail above into a printed warning and a
zero exit. `off` skips the check entirely.

## Accepted consequence

Plugins call the foundation at a moving `v1` tag. So the moment a design system
change is committed to the foundation, the next PR in every *adopted* plugin
fails until it re-pulls. That is the intended sync pressure, and it is why R7
exists — the escape hatch is for a plugin that cannot absorb the update in the
middle of unrelated work.

## Out of scope

- **Claude Design → foundation stays manual.** Nothing can watch the Claude
  Design project. A human Syncs, commits the exported folder, and that commit is
  what the guardrail then propagates.
- Auto-fixing. CI does not commit to plugin repos.
- Minifying or building the shipped CSS. It is copied verbatim so it can be
  compared byte for byte.
