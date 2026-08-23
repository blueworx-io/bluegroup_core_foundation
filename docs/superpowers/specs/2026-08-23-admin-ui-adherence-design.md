# Admin UI adherence — design

**Date:** 2026-08-23
**Status:** approved, not yet built

## The problem

Every BlueWorx plugin's admin screens are supposed to come from the shared
`blueworx-admin-design` system. Today three things push in that direction and none of them
holds:

- `CLAUDE.md.template` tells Claude to invoke the skill before touching an admin screen.
  Model-driven — it fires on judgement, not on a guarantee.
- `check-design-system-sync.mjs` fails a PR whose *copy* of the system has drifted. It proves
  the plugin carries the right files. It says nothing about whether the screens use them.
- `_adherence.oxlintrc.json` ships inside the skill folder and is wired to nothing.

So a session can copy the system in, pass every check, and still hand-write a settings page
from scratch. That is exactly what we need to stop.

## What we're building

A deterministic adherence check, run in two places: at edit time inside a Claude Code session,
and again on the pull request. Same rules, same code, same message both times.

### 1. The check

`scripts/check-admin-ui-adherence.mjs` (CLI, does the I/O) over a pure
`adminUiAdherence()` in `scripts/lib/checks.mjs` — the shape every other guardrail in this repo
already uses, returning `{ ok, problems, message }` and unit-tested without touching disk.

**Scope: files the pull request changed.** New and changed admin screens must be on the system.
An existing screen is left alone until someone touches it, so no plugin needs a migration
before this can be turned on.

**Which changed files count as admin UI** — decided by content, not by folder name, so a plugin
that lays itself out differently can't slip past:

- a PHP file that registers or renders an admin page (`add_menu_page`, `add_submenu_page`,
  `add_options_page`, `add_settings_*`, a render callback, or admin markup in a template)
- a `.jsx` / `.tsx` file that imports from the design system, or is enqueued on an admin screen
- a CSS file the plugin enqueues on an admin screen (found by tracing the enqueue call)

**What fails:**

| Rule | Why |
|---|---|
| A colour, size, font or shadow written by hand | Everything visual is a token in `styles.css` |
| A `style="…"` attribute in admin markup | Same reason, harder to spot |
| A hand-written `<svg>` | Icons come from `assets/icons/lucide-icons.js` or `lucide-react` |
| WordPress core admin classes used as the design — `button-primary`, `form-table`, `notice notice-*`, `wp-list-table`, `postbox` | These are the shapes the system exists to replace |
| An admin stylesheet other than the copied `assets/blueworx-admin-design.css`. One thin plugin stylesheet is allowed, holding only the four full-bleed chrome overrides the system readme documents | A second stylesheet is a second design system |
| Admin markup with no `bw-` class anywhere in it | Catches a screen built from scratch — see the caveat below |

**Where the rules come from.** The valid `bw-` class names, the token names and the component
names are read at run time out of the system the plugin already carries — `styles.css` and
`_ds_manifest.json`. Nothing is hand-copied into the check, so when the design system gains a
component the check accepts it on the next sync without an edit here.

**Failure output** names the file, the line, what's wrong and which component to use instead —
the same way the sync check prints its fix commands.

**No local escape hatch.** If a screen needs a pattern the system doesn't have, the pattern goes
into the foundation's system first, gets re-pulled, and then the screen is built. That is what
`CLAUDE.md.template` already says; this makes it true.

### 2. Wiring it into CI

A step in `.github/workflows/ci-wordpress.yml` immediately after the design system sync step,
with an `admin_ui_adherence` input (`error` default / `warn` / `off`) mirroring
`design_system_sync`, and the same warning in its description about what a plugin left on `warn`
is quietly shipping.

A plugin that has not adopted the design system at all passes, exactly as the sync check does —
otherwise this would break every repo the day it lands.

### 3. The session hook

A `PreToolUse` hook on `Write` and `Edit` in the foundation's `.claude/settings.json`, which each
project copies at setup. It runs the same check against the *pending* file content and blocks the
edit with the same message. CI stays as the backstop; the session stops being where the problem
starts.

The script lives in the foundation, so the hook resolves it from a sibling checkout
(`../bluegroup_core_foundation/scripts/…`, the path the test harness already uses) or the
in-repo `.foundation` directory, and **exits silently if it finds neither**. A machine without a
foundation checkout must not have its editing broken by a missing guardrail.

`CLAUDE.md.template` currently states there are deliberately no hooks, on the grounds that the
skill triggers fire on the *kind* of change, which a hook can't detect. That reasoning still holds
for the skills. It does not hold here: "this file renders an admin screen and contains a raw hex
colour" is a file-content fact, which is precisely what a hook can decide. The doc gets updated
rather than contradicted.

### 4. Docs

- `CLAUDE.md.template`: admin-screen adherence moves out of the model-driven list into the
  enforced Hard Guardrails, and the "no hooks" paragraph is corrected.
- `docs/starter-prompt-wordpress-plugin.md`: says the check exists and what it refuses.
- `README.md`: the new script listed with the others.
- Changelog entry.

## Testing

Unit tests in `scripts/lib/checks.test.mjs` against the pure function — one per rule, plus:
a plugin that hasn't adopted the system passes; a changed file that isn't admin UI is ignored;
an untouched non-conforming file is ignored; a conforming screen passes clean.

Nothing here needs a WordPress runtime, so it all runs in Foundation CI's existing
`node --test` step.

## Known weakness

The "no `bw-` class anywhere" rule is the only fuzzy one. It is what catches a from-scratch
screen, and it is also the one that will misfire on a small partial or a fragment of markup that
legitimately carries no class. It ships as a warning inside an otherwise-failing check, and gets
promoted to a failure once it has run on a real plugin without crying wolf.

## Out of scope

Front-end output. This governs wp-admin only; each project's public design stays its own.
