# Page editor standard — decisions taken during the build

**Date:** 2026-08-28
**Branch:** `page-editor-standard`
**Plan:** [2026-08-27-page-editor-standard.md](2026-08-27-page-editor-standard.md)
**Spec:** [2026-08-27-page-editor-standard-design.md](../specs/2026-08-27-page-editor-standard-design.md)

Every decision made without asking, so they can be reviewed and undone. Nothing here was approved in
advance. The ones most worth a second opinion are first.

---

## The ones that changed the shape of the thing

**Records write to the post, not just to post meta.** The plan had a record editor storing everything
as post meta. That would have written the status, the slug, the excerpt, the author and the menu
order into meta keys where they do nothing — the post would not publish and the slug would not
change. Those fields now go through one `wp_update_post()` call, tags through the taxonomy API, and
the featured image through the thumbnail functions. Without this the whole "records are post types"
premise was decorative. *If wrong:* a real scope addition mid-plan, and six more WordPress functions
to stand in for during tests.

**A validation failure writes nothing; a write failure admits it might have.** The spec promised that
a failed save writes nothing at all. Post meta has no transaction, so that cannot be true of a write
that fails part-way. The library now stops at the first genuine failure and says plainly that some
changes may have been saved. The guarantee that stands, and is tested, is that nothing invalid is
ever written. *If wrong:* the error message admits uncertainty where a tidier lie would read better.

**The example plugin's copy of the library is generated, not committed.** It was a full duplicate with
nothing keeping it in step. The failure would have been silent — someone fixes the library, the tests
keep passing against the stale copy, and it certifies code that is no longer what ships. A staging
script now writes it before the tests run. *If wrong:* the suite needs one documented step before it
runs.

**The rich text toolbar was rebuilt.** As designed it called `execCommand` against a plain textarea,
which does nothing — clicking a button blurred the field and lost the selection. It now wraps the
selection in the same HTML that `wp_kses_post` already keeps. *If wrong:* a plainer editor than a
contenteditable one, in exchange for behaviour that is deterministic and testable.

**No build step, anywhere.** The spec said the browser file would be built here and shipped built.
This repo has no `package.json`, no dependencies and no bundler, and adding all three to compile one
file was the worse trade. It is plain JavaScript using a short alias instead of JSX. *If wrong:* the
file is slightly more verbose to read.

---

## Security decisions

**The record is authorised, not just the screen.** The REST layer passed the record id through with
only a number check, so anyone who could open one editor could overwrite an unrelated post. The id
must now resolve to a post of that screen's own type, and the user must pass `edit_post` for that
specific record. An id of 0 is refused rather than treated as a blank record.

**The refusal does not say which failure it was.** "That record could not be found" covers both a
missing record and one belonging to another post type, so the endpoint cannot be used to probe what
exists. This deliberately breaks the copy rule that an error should name its fix.

**Capability filtering runs in two directions, not one.** A locked field now arrives with its value so
it can be displayed, and is still refused on the way back in. They had shared one function, so a
read-only field arrived empty.

**A locked field's condition is read from the record, not the request.** Otherwise a crafted request
could claim a field it may not write was switched off, and skip a required field's validation.

**The publish capability comes from the post type**, not the generic `publish_posts` — which was both
too strict for a custom type with its own capabilities and too loose for a plain author.

**`copytext` is display-only.** It rendered read-only but was writable by a crafted request.

---

## Things the plan got wrong, corrected

- The field list was closed at the top level but not inside a repeater, so a sub-field could name any
  control it liked.
- Tab and panel ids were not checked for duplicates, though field ids were.
- A `depends_on` naming a field that does not exist silently switched validation off. Now rejected at
  registration, and failing safe if one reaches the validator anyway.
- The panel Shown/Hidden switch wrote a value the server discarded — it saved "successfully" and
  reverted on reload. It is now a real field.
- The settings tab was added to what the browser saw but not to what was read or saved, so changing
  the status or slug did nothing.
- A schema typo threw on `plugins_loaded` and took the whole site down, front end included. It now
  degrades to a message on the screen.
- Slugs were mangled: "Under 12s Team" became `under12steam` instead of `under-12s-team`.
- The vendored library used a CSS class the design system does not define, so any plugin adopting it
  would have failed the adherence check on a file it is forbidden to edit.
- Panels had no left gutter, so they sat flush against the window edge while everything else lined up.
- The REST path was built by string surgery on a URL, which breaks on a site using plain permalinks.
- The asset URL assumed this repo's directory depth and overshot the plugin root in a real plugin.
- The icon fallback for older WordPress bailed on exactly the versions it existed for.

---

## Where the tests were lying

The suite was green while four related bugs sat in the same seam, because the test stubs agreed with
our code rather than with WordPress. Making the stubs faithful — post meta stores strings, `false`
becomes an empty string, `update_post_meta` returns false when nothing changed — exposed all four:
a panel switch that reverted on reload, a no-op check comparing across types, "never saved" being
confused with "saved empty", and defaults bypassing the type cast.

Values are now cast back to their field's own type on read, and fields carry a declared default.

**The single most useful test added** renders every field kind and asserts a control comes back. The
PHP and JavaScript halves agree only by convention, and that test is what pins them together.

---

## Style and copy

- Panel eyebrows are grey labels, not brand-coloured second headings.
- The design system's switch could not be clicked at all — its input had no hit area. This affects
  every plugin using a switch, not only the editor.
- `--bw-size-h3` moved 16px to 18px. All four things using it are section titles.
- Registration-time exceptions are read by developers, so they need not address the reader as "you".
  Everything a site owner sees does.

---

## What I chose not to fix

Recorded so nobody has to rediscover them:

- A screen that fails registration shows its error as a new top-level menu item rather than under its
  intended parent.
- Catching every error around schema validation will also report a bug inside the library as the site
  owner's mistake.
- A GET refusal returns 200 with a `problem` field while a POST refusal returns 422.
- An explicitly declared `null` default is rejected as mistyped rather than treated as absent.
- The options store never removes values for fields a screen no longer declares.
- The repeater's keyboard test proves Tab reaches "Move up" but not the add and remove buttons.
- Roughly eleven other minor findings, each recorded at the time and none affecting behaviour.

---

## What will break in other repos

Every plugin carrying the design system fails its sync check on the next CI run, because the skill
folder now holds the editor and `styles.css` changed. That is expected, `DESIGN_SYSTEM_SYNC=warn`
still defers it, and the printed fix is copy-pasteable and pinned to the compared ref.

The new rule refusing a hand-written editor screen was written as a **warning** for one release,
because an existing settings screen might legitimately use tabs and a save bar together. Every
plugin repo carrying the design system was then swept and none does, so the rule ships as a
failure like the rest.
