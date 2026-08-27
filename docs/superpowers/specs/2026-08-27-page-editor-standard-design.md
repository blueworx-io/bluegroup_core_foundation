# Page editor standard — design

**Date:** 2026-08-27
**Status:** approved, not yet built

## The problem

Every plugin that lets a site owner edit content builds its own editing screen. The
`blueworx-admin-design` system already guarantees those screens use the same colours, type and
controls — the sync check proves the plugin carries the system, and the adherence check proves
the screens use it. Neither says anything about **shape**.

So two plugins can both pass every guardrail and still disagree about where the save button
lives, whether tabs save independently, what a dirty screen looks like, whether an invalid
field blocks the whole save, and where WordPress's own post settings appear. The editing
*experience* drifts even while the styling holds.

Separately, nothing today stops a plugin inventing its own storage for content that ought to be
a WordPress post — losing revisions, capabilities, REST and everything else core gives away.

## What we're building

Two things, and one rule.

1. **A page editor library** — the shell and the behaviour of a custom editor screen, built once
   in this repo and vendored into each plugin. A plugin declares its screen as data; the library
   renders and runs it. Plugins choose their own tabs, panels and fields; they do not choose the
   skeleton, the save model, the states or the control vocabulary.
2. **The controls the design system lacks**, added to `styles.css` so the closed vocabulary is
   complete.
3. **The post type rule** — record-like content is a registered WordPress post type. Not a
   convention in a document: the library refuses to run a record editor whose post type nobody
   registered.

The source is the Claude Design handoff *BlueWorx page editor system*. Its two example screens
(Sports, Club Pages) are reference only. Nothing in them ships.

## 1. Design system additions

### 1.1 New controls

Seven controls, added to `styles.css` under the `bw-` prefix. The handoff ships them as `pe-*`;
they are renamed on the way in so there is one vocabulary and the existing checker — which
learns its class list by reading `styles.css` — picks them up with no change.

| Handoff | Ships as | What it is |
|---|---|---|
| `pe-rte` | `bw-richtext` (+ `__bar`, `__btn`, `__sep`) | Rich text shell. Bold, italic, link, list, image. Nothing else |
| `pe-tokens` | `bw-tokens` | Free-text list. Enter commits, `bw-chip__x` removes |
| `pe-scrolllist` | `bw-scrolllist` | Capped checkbox list — scrolls at 168px, never grows the panel |
| `pe-conditional` | `bw-conditional` | Dependent fields: 2px brand rule, sunken, with the dependency stated |
| `pe-title-input` | `bw-titleinput` | The large title field at the top of a record |
| `pe-permalink` | `bw-permalink` | The slug row beneath it |
| `pe-fieldnote` | `bw-fieldnote` | 12px muted note with an icon |

The handoff's `pe-collapse` / `pe-chev` are **not** added: `bw-accordion` already does that job.
Everything else in `page-editor-chrome.css` is the prototype's fake wp-admin chrome and is
dropped — WordPress supplies the menu and admin bar.

### 1.2 One change to an existing rule

The handoff's panel eyebrow is a small muted label; ours is brand-coloured. The handoff wins:
`.bw-card__eyebrow` becomes 10px, semibold, `.11em` tracking, `--bw-text-muted`, with
`.bw-card__title` at 18px and `.bw-card__titles` gap 3px. Rationale: in a screen of stacked
panels a coloured eyebrow above every panel title reads as a second heading and competes with
the page header. It is a label.

The handoff's number-input and page-header wrapping overrides are folded in at the same time.

### 1.3 Consequence

Editing `styles.css` means every plugin's design system sync check fails until it re-pulls. This
is expected and already has an escape hatch (`DESIGN_SYSTEM_SYNC=warn`) for a plugin that cannot
absorb it mid-feature. It is the reason this lands first and alone.

## 2. The library

### 2.1 Shape and distribution

There is no shared runtime package — two of our plugins on one site can be at different
versions. So the library is distributed the way everything else already is: **copied, committed
and hash-checked.**

| Ships from | Copied to | What it is |
|---|---|---|
| `.claude/skills/blueworx-admin-design/editor/php/` | `blueworx-page-editor/` | The PHP library, vendored as a folder |
| `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js` | `assets/blueworx-page-editor.js` | The built browser file |

The PHP is version-namespaced (`Blueworx\PageEditor\v1\…`) with a highest-version-wins factory,
following the same pattern as the vendored plugin update checker, so two plugins at different
versions coexist.

The JavaScript is written against the React that WordPress already registers (`wp.element`,
`wp.apiFetch`), so a plugin adds no npm dependency and no build configuration — the
approved-dependency list stays empty.

It is **plain JavaScript with no build step at all**: element creation goes through a short
`h()` alias for `wp.element.createElement` rather than JSX. This repo has no `package.json`, no
dependencies and no bundler, and adding all three to compile one file would be a worse trade
than writing `h('div', …)`. The file is committed as it ships, `node --check` covers it in the
existing syntax pass, and its pure logic is exported for `node --test` at the bottom behind a
`typeof module` guard so the same file runs in both places.

### 2.2 What a plugin writes

One screen definition, as a PHP array, passed to the library at `admin_menu` time:

- **Screen** — menu placement, capability, eyebrow, title, one-line lede, and where it stores.
- **Tabs** — one per area of the record. Optional: with one to three panels, no tabs.
- **Panels** — eyebrow, title, one-sentence note, and whether the panel carries a Shown/Hidden
  switch.
- **Fields** — kind, label, help, required, the capability it needs, and what it depends on.

Nothing else. No markup, no save handler, no JavaScript, no enqueues.

`kind` is a **closed list** — the controls in `styles.css` and no others. An unknown kind is a
hard error at registration, not a silent fallback. If a plugin needs a control we don't have,
the answer is the standing one: add it to the design system here first.

### 2.3 What the library does

- Registers the admin page, enqueues what the screen needs — the design system stylesheet, the
  icon module and its own built JavaScript — and applies the full-bleed chrome overrides to that
  screen only.
- Derives the tab and panel counts from the data. Nothing is hardcoded; an empty group reads
  "empty", never "0".
- Appends the **Publish & settings** tab automatically, last, when the screen stores to a post —
  status, visibility, date, author, slug (with the no-redirect warning), excerpt, revisions,
  comments, trash; taxonomies, tags, featured image; parent, template, menu order. The plugin
  does not write these and cannot reorder them.
- Serves the record and the schema to the browser as one payload, and takes the whole record
  back on save.

### 2.4 Storage, and the post type rule

Two stores, declared per screen:

- `post` — a record. Values are post meta on a **registered post type**. This is the default and
  the expected case.
- `option` — one fixed set of site content or plugin configuration, via the options API.

At registration the library checks a `post` screen's post type is registered. If it is not, the
screen does not load and says exactly that, naming the post type. A static check cannot tell a
real post type from a plausible string, so this is enforced where it can be — at run time, on
the first attempt to use it.

### 2.5 Saving

One save bar per screen, whatever tab is showing, because the tabs are views of one record.

The browser sends the whole record. The library then, in order: re-checks the screen capability;
drops any field whose own capability the user lacks; sanitises each remaining value by its field
kind; runs the plugin's optional validate callback; and only then writes.

**A validation failure writes nothing at all.** It returns field-level errors keyed to the field, which
the screen renders as `bw-field__error` under each one, plus a danger notice at the top saying
nothing was saved and a button that moves to the first problem.

A write that fails part-way through is a different case, and the library does not pretend otherwise:
post meta has no transaction, so it stops at the first genuine failure and tells the site owner that
some changes may have been saved and to reload. The guarantee it does make, and tests, is that
nothing invalid is ever written.

Capability filtering happens on the way **out** as well as in: a field the user cannot change is
never sent to the browser, so it cannot be re-enabled by editing the page. Where it matters that
the field exists, it is sent locked with a line naming who can change it.

### 2.6 States

The nine states in the handoff are the library's, not the plugin's: clean, dirty, invalid,
saved, empty, loading, section hidden, conditional, read-only. A plugin cannot render a tenth.

## 3. Enforcement

### 3.1 Adherence

The rules live in `scripts/lib/admin-ui.mjs`, which both CI and the Claude Code hook read, so one
change covers edit time and pull request time.

New rule: **a plugin may not hand-write editor markup.** Markup carrying both `bw-tabs` and
`bw-savebar`, outside the vendored library, fails — that combination is an editor screen, and
editor screens come from the library.

The seven new controls need no work here. The checker builds its vocabulary by reading
`styles.css`, so adding them there is enough.

**This one rule ships warning-only for one release.** Existing settings screens may already use
those two classes legitimately, and this repo cannot see those repos to know. Turn it to a
failure once one release has shown what it actually catches. Every other rule blocks from day
one.

### 3.2 Sync

`check-design-system-sync.mjs` gains the two new copied paths — `blueworx-page-editor/` and
`assets/blueworx-page-editor.js` — hashed against the foundation exactly as the stylesheet,
fonts and icons already are. Same failure, same fix message.

### 3.3 The written standard

`CLAUDE.md.template` and `docs/starter-prompt-wordpress-plugin.md` gain the rule in the section
that already covers admin screens: custom editors come from the page editor library, records are
post types, and the control list is closed.

## 4. Testing

- **Adherence rules** — unit tests beside the existing ones for `admin-ui.mjs`: an editor screen
  built by hand fails; one rendered by the library passes; a settings screen using a save bar
  without tabs is untouched.
- **The PHP library** — PHPUnit: an unknown field kind is rejected at registration; a `post`
  screen with an unregistered post type refuses to load; values are sanitised per kind; fields
  above the user's capability are stripped both ways; a validation failure writes nothing.
- **End to end** — one example screen in the local WordPress harness, driven by Playwright:
  change a field and the save bar wakes; switch tab and the dirty state survives; save invalid
  and see the field error, the notice, and no write; save valid and see the screen go clean.
  That example is also the worked reference plugins copy from.

## 5. Order of work

1. Design system: the seven controls and the eyebrow change. Lands alone, so plugins re-pull
   once and cleanly.
2. The PHP library and its build step, with the JavaScript.
3. The example screen and the end-to-end test.
4. Enforcement: the sync paths, then the adherence rule in warning mode.
5. The written standard in the template and the starter prompt.

## 6. Out of scope

- Migrating any existing plugin screen. Nothing changes until someone touches it.
- The handoff's example screens. Reference only.
- Front-end output. This governs wp-admin.
- Block editor integration. A custom editor screen is not a block editor and does not pretend
  to be one.

## 7. Claude Design ↔ code

The seven controls are brand-new components being pulled design → code, which the standing rules
allow when Luke asks for it explicitly. He has. After this lands they are code-owned, and the
mirror runs code → design from then on.
