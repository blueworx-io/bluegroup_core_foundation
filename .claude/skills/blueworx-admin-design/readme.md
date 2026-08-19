# BlueWorx Admin Design System

The house standard for **WordPress plugin back-end UI** at BlueWorx. Every BlueWorx plugin —
and every plugin we tell someone else how to build — should produce admin screens that look
like they came from the same shop: one accent, one type pairing, one control size, one panel.

This is not a website design system. It is for everything that lives behind `wp-admin`:
settings screens, list tables, setup wizards, dashboards, tools pages, modals and notices.

## Context

BlueWorx (blueworx-io) builds WordPress sites **as plugins, in code** — never in a page
builder, never as a loose theme. Each client project is its own repo pointing at a shared
foundation repo for CI guardrails. The consequence for design: a client's site has a
BlueWorx-built admin area, and today each project styles that area from scratch. This design
system is the shared answer.

The brief also named **SureCart** (https://surecart.com/) as the reference for how a plugin
should treat wp-admin: a plugin's screens are a designed product surface, not a WordPress
options form. We took the *approach* — full-bleed screens, real page headers, card panels,
a sticky save bar, restrained colour — and expressed it in BlueWorx's own brand. No SureCart
markup, tokens or assets were copied, and their component library was not reachable.

### Sources this system was built from

| Source | What was taken |
|---|---|
| `github.com/blueworx-io/bluegroup_project_blueworx` | Brand palette (`assets/css/public.css` `:root`), Sora + Inter woff2 files, `assets/img/logo.png` |
| BlueWorx internal plugin admin CSS | The real admin patterns: `admin-setup.css`, `admin-content.css` — page header, tabs, section nav, panel cards, toggles, sticky save bar, role chips |
| `github.com/blueworx-io/bluegroup_core_foundation` | Tone of voice and the plugin conventions in `README.md`, `docs/recipe-book.md`, `docs/starter-prompt-wordpress-plugin.md` |
| `github.com/lucide-icons/lucide` (ISC) | The icon set. Geometry copied verbatim, icon by icon, into `assets/icons/lucide-icons.js` |
| WordPress core admin | Host chrome values and the notice hues (`--wp-admin-*`, success/warning/danger/info) |
| https://surecart.com/ | Directional reference only, as described above |

**No Figma file, and no local codebase, was provided.** Everything here is read from the
repositories above.

---

## Content fundamentals

The voice comes straight from the foundation repo, which is written the way we want plugin
UI to read: plain, direct, and honest about limits.

- **Person.** Address the site owner as **you**. Never "we". Never "the user".
  → "You have unsaved changes." · "Nothing is charged while test mode is on."
- **Case.** Sentence case everywhere — buttons, titles, table headers, menu items.
  The *only* uppercase is the 11px label/eyebrow style. Never title-case a button.
- **Length.** A label is 1–3 words. Help text is one sentence. A notice is one sentence
  plus, if needed, one about what to do next.
- **Say what it does, not what it is.** "Members can sign in as soon as you connect a
  payment provider" beats "Payment provider integration status: incomplete".
- **State the cost plainly.** The foundation's recipes say what they *don't* solve; UI copy
  does the same. → "Removes every plan, member record and setting this plugin created. Your
  WordPress users are left alone."
- **Buttons are verbs.** "Save changes", "Publish members area", "Choose CSV", "Check for
  updates". Not "Submit", "OK", "Confirm".
- **Errors name the fix.** "That key is not recognised." → then how to get a valid one.
  Never "Invalid input".
- **No exclamation marks. No emoji.** Not in labels, not in notices, not in empty states.
  Iconography is Lucide, and it is functional.
- **Numbers are specific.** "318 members, 4 plans and 27 scheduled renewals will be removed."
- **British English** — organise, colour, licence (noun) — matching the existing repos.

Vibe: a well-run workshop. Confident, quiet, faintly dry. The screen never celebrates itself.

---

## Visual foundations

**Colour.** One accent: BlueWorx indigo `#4F46E5` (`--bw-brand`), deepening to `#4338CA` on
hover, with `#EEEDFC` as its wash. Text is ink `#0A0C29` over muted `#5B5D74`. Surfaces are
white panels on a `#F7F8FC` canvas with `#ECEDF3` hairlines. Status colours are **WordPress
core's own** notice hues — a plugin that invents its own red reads as a foreign object inside
wp-admin. `--wp-admin-*` holds the host chrome values (`#1D2327` menu, `#F0F0F1` body,
`#2271B1` WP blue); use them only when recreating or abutting wp-admin itself, never as brand
colour. Two background colours per screen, maximum: canvas and paper.

**Type.** Sora for anything titular or numeric — page titles (28/1.15/600), panel titles
(16/600), figures (tabular numerals). Inter for everything else — 13px body (the WordPress
admin body size, so a plugin screen never looks oversized next to a core screen), 14px inside
inputs, 12px help text, 11px uppercase labels at `.08em` and eyebrows at `.14em`. Monospace
(`ui-monospace` stack, never a webfont) for keys, shortcodes and IDs.

**Spacing and layout.** 2px-based scale. 24px is the page gutter, the panel padding, and the
distance the header indents — keep them equal so everything lines up down the left edge. 20px
between stacked panels, 18px between fields, 34px control height. Text columns cap at 60ch.
Screens are **full-bleed**: a BlueWorx plugin screen fills `#wpcontent` edge to edge, drops
WordPress's `.wrap` margin and hides `#wpfooter`; the header, the panels and the save bar all
share the same gutter. Settings screens with more than four sections get a 220px left pill
nav; below that, stack the panels.

**Backgrounds.** Flat. No images, no gradients, no textures, no patterns, no full-bleed
photography. The only non-flat surface in the system is the 8px progress track.

**Cards.** White, 1px `#ECEDF3` border, 12px radius, `0 1px 2px rgb(10 12 41 / .05)` shadow.
Header row with an optional uppercase eyebrow above a Sora title, hairline under the header,
24px body, optional footer bar on the sunken grey. `flush` removes body padding so a table
meets the card edges. Nested/secondary panels use the sunken variant, not a second shadow.

**Corners.** 4/6/8px on controls (8px is the default, and section-nav items use it too),
12px on panels and modals, pill for badges, chips and the progress track. Nothing is fully
square except table cells.

**Shadows.** Borders separate; shadow only means "floating". Four steps: card, raised
(dropdowns), overlay (modals), and the sticky bar's upward `0 -8px 20px -14px rgb(0 0 0/.35)`.
Never a heavy border and a heavy shadow on the same element. No inner shadows anywhere.

**Transparency and blur.** Almost none. The modal scrim is `rgb(10 12 41 / .45)`; nothing
else is translucent, and nothing is blurred. Admin screens are read, not admired.

**Animation.** 120ms for hover tints, 200ms for control colour and the switch thumb, 300ms
for a progress bar's width. Plain `ease`. Nothing bounces, nothing slides in, nothing
animates on page load — an admin screen appears, it does not arrive. Row actions fade in on
hover (opacity only).

**Hover / press / focus / disabled.** Hover on a solid button deepens the fill
(`#4F46E5` → `#4338CA`); hover on an outline control tints to `#F5F6FB` and darkens the
border; hover on a ghost control gains the tint and full-strength ink. Press reuses the hover
fill — nothing shrinks, nothing lifts. Focus is always a 2px `#4F46E5` outline at 1px offset
(2px on switches and pills); the outline is never removed. Disabled is 50% opacity plus
`cursor: not-allowed`, never a colour change.

**Imagery.** There is none, by design. Where a real product screenshot or a client logo is
needed, it is the client's own asset dropped into a MediaField. The system ships one image:
the BlueWorx logo.

---

## Iconography

**Lucide — the set BlueWorx sites already use — self-hosted as inline SVG.** Icons are not a
font here: each one is real Lucide geometry, copied verbatim from `lucide-icons/lucide`
(ISC) into `assets/icons/lucide-icons.js`, one entry per icon the system uses. Stroke 2,
24×24 box, `currentColor`, round caps — the `lucide-react` defaults, so a screen mocked here
and the same screen built with `lucide-react` are the same drawing.

- **React:** `<Icon name="settings" size={18} />` — kebab-case Lucide names
  (`lucide-react`'s `<CircleCheck />` is `"circle-check"`). `strokeWidth` is a prop; the
  default is 2.
- **Plain HTML:** `<i class="bw-icon" data-lucide="settings"></i>`, with
  `assets/icons/lucide-icons.js` loaded as a module. It upgrades every `[data-lucide]`
  element in place and watches for new ones, so server-rendered PHP markup works too.
- **Production React app:** import from `lucide-react` directly and skip both — the names
  are identical, and this file exists only so the design system's own previews and
  non-React plugin screens have the same icons.
- Sizes: 14px in small controls, 16px inline with 13px text, 18px in buttons and menu rows,
  20–28px in empty states. `.bw-icon` is a 16px box by default; `.bw-icon--14/18/20/22/28`
  resize it. Colour is `currentColor` unless it is carrying status.
- Common set: `settings users plug shopping-cart chart-column refresh-cw trash-2 pencil
  ellipsis eye circle-check triangle-alert info x search upload download plus arrow-right
  chevron-down mail lock funnel archive calendar megaphone external-link grip-vertical`.
- **Never** hand-draw an SVG for something Lucide already has, never use emoji as an icon,
  never use unicode arrows or bullets as glyphs. If a screen needs an icon that is not in
  `lucide-icons.js` yet, copy its geometry in from the Lucide repo and note it here rather
  than approximating with a near-miss.
- The old Dashicons names (`admin-settings`, `yes-alt`, `plus-alt2`, `trash`, …) still
  resolve, through the alias map in `lucide-icons.js`, so half-migrated plugin code keeps
  rendering. New code uses Lucide names.

---

## Components

React primitives, one directory per concern — everything needed to build a WordPress plugin
back-end page. Each has `<Name>.jsx`, `<Name>.d.ts` and `<Name>.prompt.md`; each directory
has card HTML showing its states. **Open `components/index.html` for the live inventory.**

**`components/core/`** — actions, status and identity
`Button` · `IconButton` · `Icon` · `Badge` · `Chip` · `Avatar` (+ `Person`) · `Tooltip`

**`components/forms/`** — every control a settings screen needs
`Field` · `FormRow` · `Input` · `Textarea` · `Select` · `Checkbox` · `Radio` (+ `RadioGroup`) ·
`Switch` · `ColorField` · `CopyField` · `RangeField` · `MediaField` · `UploadField` · `Repeater`

**`components/layout/`** — the furniture of a screen
`PageHeader` · `Card` · `SettingsCard` · `SectionNav` · `Tabs` · `Toolbar` · `Accordion` · `Drawer` ·
`Divider` · `ScreenLayout` · `SaveBar`

**`components/navigation/`** — wayfinding and overflow
`Breadcrumbs` · `Pagination` · `Stepper` · `DropdownMenu` · `RowActions`

**`components/feedback/`** — what the screen says back
`Notice` · `Modal` · `Toast` (+ `ToastStack`) · `ProgressBar` · `Spinner` · `Skeleton` ·
`EmptyState` · `HelpTip`

**`components/data/`** — records and figures
`DataTable` · `StatCard` · `BulkActions` · `DescriptionList` · `ActivityLog`

Styling lives in `.css` files beside each group (`core.css`, `forms.css` + `forms-extra.css`,
`layout.css` + `layout-extra.css`, `navigation.css`, `feedback.css` + `feedback-extra.css`,
`data.css` + `data-extra.css`), all imported by `styles.css`, all built on the tokens. A plugin
that cannot ship React can use the classes alone: `.bw-btn.bw-btn--primary`, `.bw-card`,
`.bw-table`, `.bw-formrow`, and so on.

### Which control for which job

| Job | Use |
|---|---|
| Two-column form | `Field` inside `.bw-fields` |
| Long settings list, WordPress `.form-table` shape | `FormRow` |
| One settings group with its own Save | `SettingsCard` |
| Many groups sharing one Save | `Card` + a single `SaveBar` |
| Decision the user must make now | `Modal` |
| Inspect a record without leaving the list | `Drawer` |
| Something already worked, with an undo | `Toast` |
| Something the user must read | `Notice` |
| A panel's first load | `Skeleton` |
| A control that is busy | `Spinner` |
| Steps with an order | `Stepper` |
| Views of one screen | `Tabs` |
| More than four settings sections | `SectionNav` |
| Optional or advanced settings | `Accordion` |

### Intentional additions

No component library was provided, so the inventory above was authored from the patterns
found in the real BlueWorx admin CSS (header, tabs, section nav, panels, fields, toggles,
media picker, chips, tables, save bar) plus the pieces any plugin screen needs.

- **`Icon`** — a thin wrapper over the Lucide set so no screen hand-rolls an SVG.
- **`StatCard` / `DataTable` / `BulkActions` / `Pagination` / `RowActions`** — together these
  replace `WP_List_Table`, which every plugin otherwise inherits unstyled.
- **`FormRow` / `SettingsCard`** — the `.form-table` shape WordPress developers already know,
  restyled, and the panel that wraps one settings group with its own Save. Between them a
  settings screen is assembled without hand-rolling either shape.
- **`Modal` / `Drawer` / `DropdownMenu` / `Toast`** — not present in the source CSS. Plugins
  need confirmations, detail views, overflow menus and undo; the alternatives (`confirm()`,
  a full page load, a permanent notice) are worse.
- **`Skeleton` / `Spinner` / `HelpTip` / `Tooltip`** — WordPress ships `.spinner` and
  `.wp-help-tip` equivalents; these are the BlueWorx versions so screens stop borrowing core's.
- **`ColorField` / `CopyField` / `RangeField` / `UploadField` / `Repeater`** — the five
  controls a real plugin settings page always ends up hand-rolling.

---

## UI kits

- **`ui_kits/plugin_admin/`** — a click-through BlueWorx plugin inside real WordPress chrome:
  overview, members list, settings, tools. Open `index.html`.
- **`ui_kits/setup_wizard/`** — the first-run setup screen: four steps, progress, sticky save
  bar. Open `index.html`.

Both use a generic sample plugin. All names, records and figures are invented.

---

## Index

| Path | What it is |
|---|---|
| `styles.css` | The whole stylesheet, in one self-contained file: fonts, tokens, components, base. No `@import`, no build step. Copy it verbatim. |
| `components/index.html` | Live inventory of all 53 components with a working sample of each |
| `components/` | `core/`, `forms/`, `layout/`, `navigation/`, `feedback/`, `data/` — jsx + d.ts + prompt.md + cards |
| `ui_kits/plugin_admin/` | Four-screen plugin recreation + `wp-chrome.css` (the WordPress host chrome) |
| `ui_kits/setup_wizard/` | Four-step first-run wizard |
| `guidelines/` | 16 foundation specimen cards (Colors, Type, Spacing, Brand) |
| `fonts/` | Sora 400/600/700, Inter 400/500/600 — `styles.css` loads them from here |
| `assets/img/logo.png` | The BlueWorx logo — the only image in the system |
| `assets/icons/lucide-icons.js` | The Lucide icon set, self-hosted as inline SVG |
| `templates/` | Starting-point templates consuming projects can copy |
| `SKILL.md` | Agent Skills front matter, for use in Claude Code |

### Using it in a plugin

```php
// styles.css is copied verbatim from the skill folder to assets/blueworx-admin-design.css.
wp_enqueue_style( 'bw-admin', PLUGIN_URL . 'assets/blueworx-admin-design.css', [], BW_VERSION );
// Only for screens rendered as PHP/HTML rather than React — a React screen uses lucide-react.
wp_enqueue_script_module( 'bw-icons', PLUGIN_URL . 'assets/icons/lucide-icons.js', [], BW_VERSION );
```

```html
<div class="wrap bw-wrap"><div class="bw-admin bw-page"> … </div></div>
```

Then drop WordPress's chrome padding on that screen only, exactly as Example Plugin does:

```css
.wrap.bw-wrap { margin: 0; }
body.toplevel_page_<slug> #wpcontent { padding-left: 0; }
body.toplevel_page_<slug> #wpbody-content { padding-bottom: 0; }
body.toplevel_page_<slug> #wpfooter { display: none; }
```
