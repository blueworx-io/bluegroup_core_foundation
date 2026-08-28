# Page Editor Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every BlueWorx plugin the same custom editor screen — one shell, one save model, one closed set of controls — by shipping a vendored page editor library from this repo and enforcing its use.

**Architecture:** A plugin declares its screen as a PHP array. A vendored PHP library validates that array, registers the admin page, filters by capability, sanitises and saves, and exposes the record over REST. A single plain-JavaScript file, written against the React WordPress already registers, draws the screen and runs its behaviour. Both are distributed the way `styles.css` already is — copied, committed, hash-checked — because two of our plugins on one site can be at different versions.

**Tech Stack:** PHP 7.4+ (WordPress), plain ES2018 JavaScript against `wp.element` / `wp.apiFetch` (no build step, no bundler, no npm dependency), Node's built-in test runner for JS and check-script tests, PHPUnit for the PHP library, Playwright against the local WordPress harness.

**Spec:** [`docs/superpowers/specs/2026-08-27-page-editor-standard-design.md`](../specs/2026-08-27-page-editor-standard-design.md)

## Global Constraints

- **No npm dependencies anywhere.** `templates/approved-deps.json` is empty by design and stays empty. The browser file uses `h = wp.element.createElement`, never JSX.
- **No build step in this repo.** Every shipped file is committed exactly as it is served.
- **Everything visual is a token.** New CSS uses `var(--bw-…)`; a one-off pixel value is allowed only where the existing `styles.css` already does it (e.g. `.bw-colorfield__preset{width:22px}`).
- **One vocabulary.** New classes take the `bw-` prefix. No `pe-` prefix ships.
- **Version namespace:** `Blueworx\PageEditor\v1\…`, highest-loaded-version-wins, following `templates/plugin-update-checker-bootstrap.php`.
- **Copy, never edit.** Files a plugin copies are hash-compared against this repo; the fix is always to re-pull.
- **Copy rules for every string the library prints:** British English, sentence case (the only uppercase is the 10–11px eyebrow), address the user as "you", labels 1–3 words, help text one sentence, buttons are verbs, errors name the fix. No exclamation marks, no emoji.
- **Existing test commands:** `node --test scripts/lib/*.test.mjs .claude/hooks/*.test.mjs` and `for f in scripts/*.mjs scripts/lib/*.mjs .claude/hooks/*.mjs; do node --check "$f"; done`.
- **Commit style:** one plain line saying what changed. No conventional-commit prefixes — this repo does not use them (see `git log`).

---

## File Structure

**Stage A — design system** (`.claude/skills/blueworx-admin-design/`)

- `styles.css` — modified. Three new tokens, one changed token, the panel-head correction, seven new controls.
- `readme.md` — modified. Documents the new controls and the editor skeleton.

**Stage B — the PHP library** (`.claude/skills/blueworx-admin-design/editor/php/`)

- `blueworx-page-editor.php` — loader and version registry. The only file a plugin requires.
- `v1/Editor.php` — the facade. `Editor::register()` and nothing else public.
- `v1/Schema.php` — validates a screen definition; owns the closed field-kind list.
- `v1/Capabilities.php` — filters a schema and a value set by what the current user may do.
- `v1/Sanitise.php` — one sanitiser per field kind.
- `v1/Validate.php` — required/format checks, returning field-keyed errors.
- `v1/Store.php` — `PostStore` and `OptionStore` behind one interface.
- `v1/Settings.php` — builds the auto-appended "Publish & settings" tab.
- `v1/Rest.php` — the two REST routes.
- `v1/Screen.php` — admin page registration, enqueues, full-bleed chrome, bootstrap payload.

**Stage C — the browser runtime** (`.claude/skills/blueworx-admin-design/editor/`)

- `blueworx-page-editor.js` — one file. Pure logic at the top (exported for tests), view below, bootstrap last behind a `window.wp` guard.

**Stage D — proof**

- `.wp-test/example-plugin/` — the worked example screen.
- `.wp-test/tests/page-editor.spec.js` — the Playwright pass.

**Stage E — enforcement and docs**

- `scripts/lib/checks.mjs` — modified. `designSystemSync()` learns the two new copied paths.
- `scripts/lib/admin-ui.mjs` — modified. One new rule.
- `scripts/lib/admin-ui.test.mjs`, `scripts/lib/checks.test.mjs` — modified.
- `scripts/lib/page-editor.test.mjs` — created. Tests the browser file's pure logic.
- `.github/workflows/foundation-ci.yml` — modified. A PHP job.
- `.github/workflows/ci-wordpress.yml` — modified. The two new sync paths.
- `CLAUDE.md.template`, `docs/starter-prompt-wordpress-plugin.md` — modified.
- `composer.json`, `phpunit.xml.dist`, `tests/php/` — created, for the library's own tests.

---

# Stage A — Design system

Lands and merges on its own. Every plugin re-pulls once, cleanly, before anything else exists.

### Task 1: Panel heads read as labels, not second headings

The handoff's panel eyebrow is a small muted label; ours is brand-coloured and competes with the page header. The handoff wins.

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/styles.css`

**Interfaces:**
- Produces: tokens `--bw-size-2xs` (10px), `--bw-track-panel` (.11em), `--bw-track-tight` (-.01em); `--bw-size-h3` changes 16px → 18px.

- [ ] **Step 1: Add the three new tokens**

Find the type scale block (search for `--bw-size-xs:11px;`) and add `--bw-size-2xs` directly above it:

```css
  --bw-size-2xs:10px;
  --bw-size-xs:11px;
```

Find `--bw-track-eyebrow:.14em;` and add two tracking tokens beneath it:

```css
  --bw-track-panel:.11em;
  --bw-track-tight:-.01em;
```

- [ ] **Step 2: Widen the panel-title size token**

`--bw-size-h3` has exactly four consumers — `.bw-card__title`, `.bw-accordion__title`, `.bw-progress__pct`, `.bw-empty__title` — and all four are section titles, so the token moves rather than a new one being added. Change:

```css
  --bw-size-h3:16px;
```

to:

```css
  --bw-size-h3:18px;
```

- [ ] **Step 3: Restyle the panel head**

Replace the `.bw-card__eyebrow` rule:

```css
.bw-card__eyebrow{font-size:var(--bw-size-xs);letter-spacing:var(--bw-track-label);text-transform:uppercase;color:var(--bw-text-accent);margin:0;font-weight:var(--bw-weight-semibold)}
```

with:

```css
.bw-card__eyebrow{font-size:var(--bw-size-2xs);letter-spacing:var(--bw-track-panel);text-transform:uppercase;color:var(--bw-text-muted);margin:0;font-weight:var(--bw-weight-semibold)}
```

Add `letter-spacing` to `.bw-card__title`:

```css
.bw-card__title{font-family:var(--bw-font-display);font-size:var(--bw-size-h3);font-weight:var(--bw-weight-semibold);letter-spacing:var(--bw-track-tight);margin:0;color:var(--bw-text-heading)}
```

Find `.bw-card__titles` and set its gap to `var(--bw-space-1)`. The handoff says 3px; 2px is the nearest step on the spacing scale and the scale exists so values snap to it.

- [ ] **Step 4: Fold in the number-input and page-header corrections**

Append to the form-controls section — a number field with a unit needs room for the unit, and must not carry the phantom indent an icon field leaves behind:

```css
.bw-input[type="number"]::-webkit-inner-spin-button,
.bw-input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.bw-input[type="number"]{appearance:textfield}
.bw-inputwrap:has(.bw-inputwrap__affix) .bw-input{padding-right:76px}
.bw-inputwrap .bw-input{padding-left:var(--bw-space-6)}
.bw-inputwrap .bw-inputwrap__icon ~ .bw-input{padding-left:34px}
```

Replace the `.bw-pagehead` and `.bw-pagehead__actions` rules so a long title wraps instead of clipping:

```css
.bw-pagehead{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;row-gap:var(--bw-space-7);gap:var(--bw-space-9);padding:var(--bw-space-10) var(--bw-pad) var(--bw-space-8);border-bottom:1px solid var(--bw-border);background:var(--bw-surface-card)}
.bw-pagehead__titles{display:flex;flex-direction:column;min-width:0;flex:1 1 420px}
.bw-pagehead__actions{display:flex;align-items:center;gap:var(--bw-space-5);flex:0 1 auto;flex-wrap:wrap;row-gap:var(--bw-space-5);justify-content:flex-end;margin-left:auto}
```

- [ ] **Step 5: Verify nothing else moved**

Run:

```bash
grep -c 'bw-size-h3' .claude/skills/blueworx-admin-design/styles.css
```

Expected: `5` — the definition plus its four consumers. If it is higher, a fifth consumer exists that was not considered; check it is a section title before continuing.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/blueworx-admin-design/styles.css
git commit -m "Make panel eyebrows read as labels rather than second headings"
```

---

### Task 2: The seven controls the system was missing

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/styles.css`

**Interfaces:**
- Produces: classes `bw-richtext` (`__bar`, `__btn`, `__sep`), `bw-tokens` (`__input`), `bw-scrolllist`, `bw-conditional`, `bw-titleinput`, `bw-permalink`, `bw-fieldnote`. Stage B and C reference these names exactly.

- [ ] **Step 1: Append the new controls to the form-controls section**

The handoff ships these as `pe-*` with hand-written colours and sizes. They are renamed to `bw-*` and put on tokens on the way in. `bw-accordion` already covers the handoff's `pe-collapse` / `pe-chev`, so those are deliberately not added.

```css
/* --- Components — editor controls -------------------------------------------- */
/* Rich text, tokens, capped lists, dependent fields, record title and slug */

.bw-richtext{border:1px solid var(--bw-border-field);border-radius:var(--bw-radius-md);overflow:hidden;background:var(--bw-surface-card)}
.bw-richtext__bar{display:flex;align-items:center;gap:var(--bw-space-1);padding:var(--bw-space-3);background:var(--bw-surface-sunken);border-bottom:1px solid var(--bw-border)}
.bw-richtext__btn{display:inline-flex;align-items:center;justify-content:center;width:var(--bw-control-h-sm);height:var(--bw-control-h-sm);border:0;border-radius:var(--bw-radius-sm);background:none;color:var(--bw-text-muted);cursor:pointer;font-family:var(--bw-font-body);font-size:var(--bw-size-body);font-weight:var(--bw-weight-semibold)}
.bw-richtext__btn:hover{background:var(--bw-surface-card);color:var(--bw-text-body)}
.bw-richtext__btn.is-active{background:var(--bw-surface-accent);color:var(--bw-text-accent)}
.bw-richtext__sep{width:1px;height:18px;background:var(--bw-border);margin:0 var(--bw-space-2)}
.bw-richtext .bw-textarea{border:0;border-radius:0;min-height:120px}
.bw-richtext .bw-textarea:focus{outline:0}

.bw-tokens{display:flex;flex-wrap:wrap;gap:var(--bw-space-3);align-items:center;padding:var(--bw-space-3);border:1px solid var(--bw-border-field);border-radius:var(--bw-radius-md);background:var(--bw-surface-card)}
.bw-tokens__input{flex:1 1 90px;min-width:90px;border:0;outline:0;padding:var(--bw-space-2) var(--bw-space-3);font-family:var(--bw-font-body);font-size:var(--bw-size-body);color:var(--bw-text-body);background:none}

.bw-scrolllist{max-height:168px;overflow-y:auto;display:flex;flex-direction:column;gap:var(--bw-space-5);padding:var(--bw-space-5) var(--bw-space-6);border:1px solid var(--bw-border-field);border-radius:var(--bw-radius-md);background:var(--bw-surface-card)}

.bw-conditional{border-left:2px solid var(--bw-border-accent);background:var(--bw-surface-sunken);border-radius:0 var(--bw-radius-md) var(--bw-radius-md) 0;padding:var(--bw-space-7) var(--bw-space-8)}

.bw-titleinput{width:100%;font-family:var(--bw-font-display);font-weight:var(--bw-weight-semibold);font-size:24px;line-height:var(--bw-lh-heading);color:var(--bw-text-heading);background:var(--bw-surface-card);border:1px solid var(--bw-border);border-radius:var(--bw-radius-lg);padding:var(--bw-space-7) var(--bw-space-8)}
.bw-titleinput::placeholder{color:var(--bw-text-faint)}
.bw-titleinput:focus{outline:2px solid var(--bw-brand);outline-offset:1px;border-color:var(--bw-brand)}

.bw-permalink{display:flex;align-items:center;flex-wrap:wrap;gap:var(--bw-space-3);margin-top:var(--bw-space-5);font-size:var(--bw-size-sm);color:var(--bw-text-muted)}
.bw-permalink code{font-family:var(--bw-font-mono);font-size:var(--bw-size-sm);color:var(--bw-text-body)}

.bw-fieldnote{display:flex;align-items:flex-start;gap:var(--bw-space-4);font-size:var(--bw-size-sm);color:var(--bw-text-muted)}
```

- [ ] **Step 2: Verify the checker will accept them**

The adherence checker learns its class list by reading this file, so the new classes need no registration anywhere. Prove it:

```bash
node -e "
const { vocabulary } = await import('./scripts/lib/design-system.mjs');
const { readFileSync } = await import('node:fs');
const v = vocabulary({ css: readFileSync('.claude/skills/blueworx-admin-design/styles.css','utf8'), manifest: null, markup: '' });
for (const c of ['bw-richtext','bw-tokens','bw-scrolllist','bw-conditional','bw-titleinput','bw-permalink','bw-fieldnote']) {
  if (!v.classes.has(c)) { console.error('MISSING', c); process.exit(1); }
}
console.log('all seven recognised');
" --input-type=module
```

Expected: `all seven recognised`.

- [ ] **Step 3: Confirm the old prefix did not leak in**

Run:

```bash
grep -c 'pe-' .claude/skills/blueworx-admin-design/styles.css
```

Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/blueworx-admin-design/styles.css
git commit -m "Add the seven editor controls the design system was missing"
```

---

### Task 3: Document the editor skeleton in the skill

The skill is what a session reads before building a screen. Without this, the rules exist only in a spec nobody opens.

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/readme.md`

- [ ] **Step 1: Add a "Custom editor screens" section**

Append to `readme.md`:

```markdown
## Custom editor screens

Any screen where a site owner edits a record or a set of page content is built by the
**page editor library** (`editor/` in this skill), never by hand. The library owns the shape;
the plugin owns only what goes in it.

**The skeleton, always in this order:** page header (`bw-pagehead`) → tabs (`bw-tabs`, optional)
→ panels (`bw-card`, stacked full width) → save bar (`bw-savebar`, sticky, one per screen).

**Rules that are not negotiable**

- No second navigation column. The only left-hand nav is WordPress's own admin menu.
- One save bar per screen, whatever the tab. Tabs are views of one record; nothing saves on its own.
- One to three field groups: no tabs. Several areas: a tab each. More than about five panels in a
  tab: split the tab. WordPress's own settings: their own tab, last.
- Optional or expert settings go in a closed `bw-accordion`. Required fields are never hidden.
- Tab and panel counts come from the data. An empty group reads "empty", never "0".
- Records are WordPress post types. The library refuses to run a record editor whose post type
  nobody registered.

**Editor controls**

| Job | Class |
|---|---|
| Rich text — bold, italic, link, list, image, nothing else | `bw-richtext` |
| Free-text list or tags | `bw-tokens` with `bw-chip` |
| Long taxonomy list, capped so it never grows the panel | `bw-scrolllist` |
| Fields that only exist while a condition holds | `bw-conditional` |
| The record's title, and the slug beneath it | `bw-titleinput`, `bw-permalink` |
| A small muted note with an icon | `bw-fieldnote` |
| A collapsible group | `bw-accordion` (not a new control) |
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/blueworx-admin-design/readme.md
git commit -m "Document the editor skeleton and its controls in the design skill"
```

**Stage A is a complete, shippable change.** Open the pull request here. Plugins re-pull once against the merged foundation before Stage B begins.

---

# Stage B — The PHP library

### Task 4: PHP test harness in this repo

The library needs tests, and this repo has never run PHP. That comes first, or every task after it is untested.

**Files:**
- Create: `composer.json`
- Create: `phpunit.xml.dist`
- Create: `tests/php/bootstrap.php`
- Create: `tests/php/WordPressStubs.php`
- Modify: `.github/workflows/foundation-ci.yml`
- Create: `.claude/skills/blueworx-admin-design/editor/php/blueworx-page-editor.php`
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Editor.php`
- Test: `tests/php/EditorTest.php`

**Interfaces:**
- Produces: `Blueworx\PageEditor\v1\Editor::register(array $screen): void`; `Blueworx\PageEditor\Registry::latest(): string`. Every later task adds to `Editor` or to a class it calls.

- [ ] **Step 1: Write the failing test**

Create `tests/php/EditorTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class EditorTest extends TestCase {
	public function test_a_screen_with_no_slug_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'needs a slug' );
		Editor::register( [] );
	}
}
```

- [ ] **Step 2: Add the tooling**

Create `composer.json`:

```json
{
  "name": "blueworx/core-foundation",
  "description": "Shared guardrails and the page editor library.",
  "type": "project",
  "license": "proprietary",
  "require": { "php": ">=7.4" },
  "require-dev": { "phpunit/phpunit": "^9.6" },
  "autoload": {
    "classmap": [
      ".claude/skills/blueworx-admin-design/editor/php/Registry.php",
      ".claude/skills/blueworx-admin-design/editor/php/v1/"
    ]
  },
  "autoload-dev": { "psr-4": { "Blueworx\\PageEditor\\Tests\\": "tests/php/" } },
  "config": { "optimize-autoloader": true }
}
```

Create `phpunit.xml.dist`:

```xml
<?xml version="1.0"?>
<phpunit bootstrap="tests/php/bootstrap.php" colors="true" failOnWarning="true" failOnRisky="true">
  <testsuites>
    <testsuite name="page-editor">
      <directory>tests/php</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

Create `tests/php/bootstrap.php`:

```php
<?php
require __DIR__ . '/../../vendor/autoload.php';
require __DIR__ . '/WordPressStubs.php';
```

- [ ] **Step 3: Stub the WordPress functions the library calls**

The library is tested without a WordPress install, so the handful of core functions it uses are stubbed. Create `tests/php/WordPressStubs.php`:

```php
<?php
/**
 * The WordPress functions the page editor library calls, stubbed so its logic
 * can be tested without an install. Each stub reads from a global the test sets,
 * so a test says what the world looks like rather than mocking a call.
 */

$GLOBALS['bwpe_stub'] = [
	'post_types'   => [],
	'capabilities' => [],
	'meta'         => [],
	'options'      => [],
];

function bwpe_stub_reset(): void {
	$GLOBALS['bwpe_stub'] = [ 'post_types' => [], 'capabilities' => [], 'meta' => [], 'options' => [] ];
}

if ( ! function_exists( 'post_type_exists' ) ) {
	function post_type_exists( $type ) {
		return in_array( $type, $GLOBALS['bwpe_stub']['post_types'], true );
	}
}
if ( ! function_exists( 'current_user_can' ) ) {
	function current_user_can( $cap ) {
		return in_array( $cap, $GLOBALS['bwpe_stub']['capabilities'], true );
	}
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	function sanitize_text_field( $value ) {
		return trim( preg_replace( '/[\r\n\t]+|<[^>]*>/', '', (string) $value ) );
	}
}
if ( ! function_exists( 'sanitize_key' ) ) {
	function sanitize_key( $value ) {
		return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $value ) );
	}
}
if ( ! function_exists( 'esc_url_raw' ) ) {
	function esc_url_raw( $value ) {
		return filter_var( (string) $value, FILTER_VALIDATE_URL ) ? (string) $value : '';
	}
}
if ( ! function_exists( 'sanitize_email' ) ) {
	function sanitize_email( $value ) {
		return filter_var( (string) $value, FILTER_VALIDATE_EMAIL ) ? (string) $value : '';
	}
}
if ( ! function_exists( 'wp_kses_post' ) ) {
	function wp_kses_post( $value ) {
		return strip_tags( (string) $value, '<p><br><strong><em><a><ul><ol><li><img>' );
	}
}
if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = null ) { return $text; }
}
if ( ! function_exists( 'get_post_meta' ) ) {
	function get_post_meta( $id, $key, $single = false ) {
		return $GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] ?? '';
	}
}
if ( ! function_exists( 'update_post_meta' ) ) {
	function update_post_meta( $id, $key, $value ) {
		$GLOBALS['bwpe_stub']['meta'][ $id ][ $key ] = $value;
		return true;
	}
}
if ( ! function_exists( 'get_option' ) ) {
	function get_option( $name, $default = false ) {
		return $GLOBALS['bwpe_stub']['options'][ $name ] ?? $default;
	}
}
if ( ! function_exists( 'update_option' ) ) {
	function update_option( $name, $value ) {
		$GLOBALS['bwpe_stub']['options'][ $name ] = $value;
		return true;
	}
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
composer install --no-interaction && vendor/bin/phpunit
```

Expected: FAIL — `Class "Blueworx\PageEditor\v1\Editor" not found`.

- [ ] **Step 5: Write the loader and the facade**

Create `.claude/skills/blueworx-admin-design/editor/php/blueworx-page-editor.php`. This is the only file a plugin requires. Two of our plugins on one site may each carry their own copy at different versions, so the highest version registered wins — the same pattern the vendored plugin update checker uses:

```php
<?php
/**
 * BlueWorx page editor — loader.
 *
 * A plugin requires this one file. Several plugins on a site may each carry
 * their own copy; every copy registers its version here and the highest wins,
 * so the newest library on the site serves all of them.
 *
 * Do not edit this folder in a plugin. It is compared against the foundation on
 * every pull request; the fix for a difference is always to re-pull.
 */

if ( ! defined( 'ABSPATH' ) && ! defined( 'BWPE_TESTING' ) ) {
	exit;
}

if ( ! class_exists( 'Blueworx\PageEditor\Registry', false ) ) {
	require_once __DIR__ . '/Registry.php';
}

\Blueworx\PageEditor\Registry::add( '1.0.0', __DIR__ . '/v1' );

add_action( 'plugins_loaded', [ '\Blueworx\PageEditor\Registry', 'load' ], 0 );
```

Create `.claude/skills/blueworx-admin-design/editor/php/Registry.php`:

```php
<?php
namespace Blueworx\PageEditor;

/**
 * Which copy of the library actually runs. Every copy on the site announces
 * itself; the highest version is the one loaded, once.
 */
final class Registry {

	/** @var array<string,string> version => directory */
	private static $copies = [];

	/** @var bool */
	private static $loaded = false;

	public static function add( string $version, string $dir ): void {
		self::$copies[ $version ] = $dir;
	}

	public static function latest(): string {
		$versions = array_keys( self::$copies );
		usort( $versions, 'version_compare' );
		return (string) end( $versions );
	}

	public static function load(): void {
		if ( self::$loaded ) {
			return;
		}
		self::$loaded = true;
		$dir = self::$copies[ self::latest() ];
		foreach ( [ 'Schema', 'Capabilities', 'Sanitise', 'Validate', 'Store', 'Settings', 'Rest', 'Screen', 'Editor' ] as $class ) {
			require_once $dir . '/' . $class . '.php';
		}
	}
}
```

Create `.claude/skills/blueworx-admin-design/editor/php/v1/Editor.php` with only what this task's test needs:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * The whole public surface of the library. A plugin calls register() with its
 * screen definition and does nothing else.
 */
final class Editor {

	/** @var array<string,array> slug => screen definition */
	private static $screens = [];

	public static function register( array $screen ): void {
		$screen = Schema::validate( $screen );
		self::$screens[ $screen['slug'] ] = $screen;
	}

	/** @return array<string,array> */
	public static function all(): array {
		return self::$screens;
	}

	public static function get( string $slug ): ?array {
		return self::$screens[ $slug ] ?? null;
	}

	public static function reset(): void {
		self::$screens = [];
	}
}
```

Create `.claude/skills/blueworx-admin-design/editor/php/v1/Schema.php` with only the slug rule for now:

```php
<?php
namespace Blueworx\PageEditor\v1;

use InvalidArgumentException;

/**
 * A screen definition is data, so every mistake in it is caught here, loudly,
 * at registration — never as a silently missing field on a live screen.
 */
final class Schema {

	public static function validate( array $screen ): array {
		if ( empty( $screen['slug'] ) || ! is_string( $screen['slug'] ) ) {
			throw new InvalidArgumentException( 'This editor screen needs a slug.' );
		}
		return $screen;
	}
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
vendor/bin/phpunit
```

Expected: PASS, 1 test.

- [ ] **Step 7: Add a PHP job to Foundation CI**

In `.github/workflows/foundation-ci.yml`, add a job alongside the existing Node one:

```yaml
  php:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '7.4'
          coverage: none

      - name: Install PHP dependencies
        run: composer install --no-interaction --no-progress

      - name: Syntax-check the library
        run: find .claude/skills/blueworx-admin-design/editor/php -name '*.php' -print0 | xargs -0 -n1 php -l

      - name: PHPUnit
        run: vendor/bin/phpunit
```

Add `/vendor/` to `.gitignore`, and commit `composer.lock`.

- [ ] **Step 8: Commit**

```bash
git add composer.json composer.lock phpunit.xml.dist tests/php .gitignore \
  .claude/skills/blueworx-admin-design/editor .github/workflows/foundation-ci.yml
git commit -m "Start the page editor library, with PHP tests running in CI"
```

---

### Task 5: The closed field list

A plugin cannot invent a control. An unknown kind fails at registration, where someone is looking, rather than rendering as nothing on a live screen.

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/php/v1/Schema.php`
- Test: `tests/php/SchemaTest.php`

**Interfaces:**
- Consumes: `Schema::validate()` from Task 4.
- Produces: `Schema::KINDS` (array of strings); `Schema::validate()` returns the normalised screen with defaults filled — `tabs`, `capability` (default `manage_options`), `store` (default `post`).

- [ ] **Step 1: Write the failing tests**

Create `tests/php/SchemaTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;

final class SchemaTest extends TestCase {

	private function screen( array $field ): array {
		return [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [ $field ] ],
				] ],
			],
		];
	}

	public function test_a_known_kind_is_accepted(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$this->assertSame( 'text', $screen['tabs'][0]['panels'][0]['fields'][0]['kind'] );
	}

	public function test_an_unknown_kind_is_rejected_by_name(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'carousel' );
		Schema::validate( $this->screen( [ 'id' => 'x', 'kind' => 'carousel', 'label' => 'X' ] ) );
	}

	public function test_defaults_are_filled_in(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$this->assertSame( 'post', $screen['store'] );
		$this->assertSame( 'manage_options', $screen['capability'] );
		$this->assertFalse( $screen['tabs'][0]['panels'][0]['hideable'] );
	}

	public function test_a_field_without_a_label_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'needs a label' );
		Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text' ] ) );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter SchemaTest`
Expected: FAIL — the unknown kind is accepted and no defaults are filled.

- [ ] **Step 3: Implement the full schema**

Replace `v1/Schema.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

use InvalidArgumentException;

/**
 * A screen definition is data, so every mistake in it is caught here, loudly,
 * at registration — never as a silently missing field on a live screen.
 *
 * KINDS is closed on purpose. It is the design system's control list; a plugin
 * that needs something else adds it to the design system first.
 */
final class Schema {

	const KINDS = [
		'text', 'textarea', 'richtext', 'number', 'range', 'colour', 'date', 'datetime',
		'copytext', 'select', 'radio', 'checkboxes', 'toggle', 'tokens', 'scrolllist',
		'media', 'file', 'repeater', 'record', 'facts', 'table', 'title', 'slug',
	];

	const CHOICE_KINDS = [ 'select', 'radio', 'checkboxes', 'scrolllist', 'record' ];

	public static function validate( array $screen ): array {
		if ( empty( $screen['slug'] ) || ! is_string( $screen['slug'] ) ) {
			throw new InvalidArgumentException( 'This editor screen needs a slug.' );
		}
		if ( empty( $screen['title'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen needs a title.', $screen['slug'] ) );
		}

		$screen['store']      = $screen['store'] ?? 'post';
		$screen['capability'] = $screen['capability'] ?? 'manage_options';
		$screen['eyebrow']    = $screen['eyebrow'] ?? '';
		$screen['lede']       = $screen['lede'] ?? '';
		$screen['tabs']       = $screen['tabs'] ?? [];

		if ( ! in_array( $screen['store'], [ 'post', 'option' ], true ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores to "%s". It must store to "post" or "option".', $screen['slug'], $screen['store'] ) );
		}
		if ( 'post' === $screen['store'] && empty( $screen['post_type'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores a record, so it needs a post_type.', $screen['slug'] ) );
		}
		if ( 'option' === $screen['store'] && empty( $screen['option_name'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen stores to options, so it needs an option_name.', $screen['slug'] ) );
		}

		$seen = [];
		foreach ( $screen['tabs'] as $t => $tab ) {
			$screen['tabs'][ $t ] = self::tab( $tab, $screen['slug'], $seen );
		}

		return $screen;
	}

	private static function tab( array $tab, string $slug, array &$seen ): array {
		if ( empty( $tab['id'] ) || empty( $tab['label'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every tab on the "%s" editor screen needs an id and a label.', $slug ) );
		}
		$tab['panels'] = $tab['panels'] ?? [];
		foreach ( $tab['panels'] as $p => $panel ) {
			$tab['panels'][ $p ] = self::panel( $panel, $slug, $seen );
		}
		return $tab;
	}

	private static function panel( array $panel, string $slug, array &$seen ): array {
		if ( empty( $panel['id'] ) || empty( $panel['title'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every panel on the "%s" editor screen needs an id and a title.', $slug ) );
		}
		$panel['eyebrow']  = $panel['eyebrow'] ?? '';
		$panel['note']     = $panel['note'] ?? '';
		$panel['hideable'] = (bool) ( $panel['hideable'] ?? false );
		$panel['fields']   = $panel['fields'] ?? [];
		foreach ( $panel['fields'] as $f => $field ) {
			$panel['fields'][ $f ] = self::field( $field, $slug, $seen );
		}
		return $panel;
	}

	private static function field( array $field, string $slug, array &$seen ): array {
		if ( empty( $field['id'] ) ) {
			throw new InvalidArgumentException( sprintf( 'Every field on the "%s" editor screen needs an id.', $slug ) );
		}
		if ( isset( $seen[ $field['id'] ] ) ) {
			throw new InvalidArgumentException( sprintf( 'The "%s" editor screen uses the field id "%s" twice. Every field id is saved as its own value, so they must be unique across the whole screen.', $slug, $field['id'] ) );
		}
		$seen[ $field['id'] ] = true;

		if ( empty( $field['kind'] ) || ! in_array( $field['kind'], self::KINDS, true ) ) {
			throw new InvalidArgumentException( sprintf(
				'The field "%s" on the "%s" editor screen asks for "%s", which is not a control the design system has. Use one of: %s. If you need something else, add it to the design system first.',
				$field['id'],
				$slug,
				$field['kind'] ?? '',
				implode( ', ', self::KINDS )
			) );
		}
		if ( empty( $field['label'] ) ) {
			throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen needs a label.', $field['id'], $slug ) );
		}
		if ( in_array( $field['kind'], self::CHOICE_KINDS, true ) && empty( $field['options'] ) && 'record' !== $field['kind'] ) {
			throw new InvalidArgumentException( sprintf( 'The field "%s" on the "%s" editor screen is a %s, so it needs options.', $field['id'], $slug, $field['kind'] ) );
		}

		$field['help']       = $field['help'] ?? '';
		$field['required']   = (bool) ( $field['required'] ?? false );
		$field['capability'] = $field['capability'] ?? '';
		$field['depends_on'] = $field['depends_on'] ?? null;
		$field['wide']       = (bool) ( $field['wide'] ?? in_array( $field['kind'], [ 'richtext', 'repeater', 'media', 'file', 'table', 'facts', 'title' ], true ) );

		return $field;
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Schema.php tests/php/SchemaTest.php
git commit -m "Close the field list so a plugin cannot invent a control"
```

---

### Task 6: A record editor needs a real post type

The rule that records are WordPress post types, made mechanical. A static check cannot tell a real post type from a plausible string, so this fires at run time on the first attempt to use the screen.

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/php/v1/Editor.php`
- Test: `tests/php/PostTypeGuardTest.php`

**Interfaces:**
- Consumes: `Editor::register()`, `Schema::validate()`.
- Produces: `Editor::ready(string $slug): bool` — false, with an admin notice queued, when the post type is missing.

- [ ] **Step 1: Write the failing test**

Create `tests/php/PostTypeGuardTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class PostTypeGuardTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
	}

	private function register( string $post_type ): void {
		Editor::register( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => $post_type,
			'tabs'      => [],
		] );
	}

	public function test_a_registered_post_type_is_ready(): void {
		$GLOBALS['bwpe_stub']['post_types'] = [ 'bw_sport' ];
		$this->register( 'bw_sport' );
		$this->assertTrue( Editor::ready( 'sports' ) );
	}

	public function test_an_unregistered_post_type_is_not_ready(): void {
		$this->register( 'bw_sport' );
		$this->assertFalse( Editor::ready( 'sports' ) );
	}

	public function test_the_reason_names_the_post_type(): void {
		$this->register( 'bw_sport' );
		Editor::ready( 'sports' );
		$this->assertStringContainsString( 'bw_sport', Editor::problem( 'sports' ) );
	}

	public function test_an_option_screen_needs_no_post_type(): void {
		Editor::register( [
			'slug'        => 'club-pages',
			'title'       => 'Club pages',
			'store'       => 'option',
			'option_name' => 'bw_club_pages',
			'tabs'        => [],
		] );
		$this->assertTrue( Editor::ready( 'club-pages' ) );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter PostTypeGuardTest`
Expected: FAIL — `Call to undefined method … ready()`.

- [ ] **Step 3: Implement the guard**

Add to `v1/Editor.php`:

```php
	/** @var array<string,string> slug => why the screen will not run */
	private static $problems = [];

	/**
	 * Whether this screen can actually run. A record editor whose post type
	 * nobody registered does not load: post meta on a post type that does not
	 * exist saves nothing, silently, and the site owner would have no way to
	 * tell. Better to refuse and say so.
	 */
	public static function ready( string $slug ): bool {
		$screen = self::get( $slug );
		if ( null === $screen ) {
			return false;
		}
		if ( 'post' === $screen['store'] && ! post_type_exists( $screen['post_type'] ) ) {
			self::$problems[ $slug ] = sprintf(
				'This editor saves a record to the "%s" post type, and nothing has registered that post type. Register it with register_post_type() before this screen can open.',
				$screen['post_type']
			);
			return false;
		}
		unset( self::$problems[ $slug ] );
		return true;
	}

	public static function problem( string $slug ): string {
		return self::$problems[ $slug ] ?? '';
	}
```

Add `self::$problems = [];` to `Editor::reset()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Editor.php tests/php/PostTypeGuardTest.php
git commit -m "Refuse to open a record editor whose post type is not registered"
```

---

### Task 7: Capability filtering, both directions

A field the user cannot change never reaches the browser, so it cannot be re-enabled by editing the page — and never comes back on save.

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Capabilities.php`
- Test: `tests/php/CapabilitiesTest.php`

**Interfaces:**
- Consumes: the normalised screen from `Schema::validate()`.
- Produces: `Capabilities::filterSchema(array $screen): array`, `Capabilities::filterValues(array $screen, array $values): array`, `Capabilities::allowed(array $screen): array` (field ids the user may write).

- [ ] **Step 1: Write the failing tests**

Create `tests/php/CapabilitiesTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Capabilities;
use Blueworx\PageEditor\v1\Schema;

final class CapabilitiesTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	private function screen(): array {
		return Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
						[ 'id' => 'fee', 'kind' => 'number', 'label' => 'Fee', 'capability' => 'manage_woocommerce' ],
						[ 'id' => 'note', 'kind' => 'text', 'label' => 'Note', 'capability' => 'edit_others_posts', 'locked_help' => 'Only an editor can change this.' ],
					] ],
				] ],
			],
		] );
	}

	public function test_a_field_the_user_cannot_change_is_removed(): void {
		$out = Capabilities::filterSchema( $this->screen() );
		$ids = array_column( $out['tabs'][0]['panels'][0]['fields'], 'id' );
		$this->assertSame( [ 'name' ], $ids );
	}

	public function test_a_field_with_locked_help_is_kept_but_locked(): void {
		$GLOBALS['bwpe_stub']['capabilities'] = [];
		$out    = Capabilities::filterSchema( $this->screen() );
		$fields = $out['tabs'][0]['panels'][0]['fields'];
		$this->assertCount( 1, $fields );

		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_woocommerce' ];
		$out    = Capabilities::filterSchema( $this->screen() );
		$ids    = array_column( $out['tabs'][0]['panels'][0]['fields'], 'id' );
		$this->assertSame( [ 'name', 'fee' ], $ids );
	}

	public function test_values_for_forbidden_fields_are_dropped_on_the_way_in(): void {
		$values = Capabilities::filterValues( $this->screen(), [ 'name' => 'Rugby', 'fee' => 40 ] );
		$this->assertSame( [ 'name' => 'Rugby' ], $values );
	}

	public function test_an_empty_capability_means_the_screen_capability_governs(): void {
		$allowed = Capabilities::allowed( $this->screen() );
		$this->assertSame( [ 'name' ], $allowed );
	}
}
```

Note: `locked_help` is a field key added here. Add it to `Schema::field()` defaults as `$field['locked_help'] = $field['locked_help'] ?? '';` before running.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter CapabilitiesTest`
Expected: FAIL — `Class "Blueworx\PageEditor\v1\Capabilities" not found`.

- [ ] **Step 3: Implement**

Create `v1/Capabilities.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * What this user may see and write. Filtering happens on the way out as well as
 * in: a field the browser never receives cannot be re-enabled by editing the
 * page, and a value for it is dropped rather than trusted.
 */
final class Capabilities {

	public static function filterSchema( array $screen ): array {
		foreach ( $screen['tabs'] as $t => $tab ) {
			foreach ( $tab['panels'] as $p => $panel ) {
				$kept = [];
				foreach ( $panel['fields'] as $field ) {
					if ( self::may( $field ) ) {
						$kept[] = $field;
						continue;
					}
					// Where knowing the field exists matters, it is sent locked
					// with a line naming who can change it — never editable.
					if ( '' !== $field['locked_help'] ) {
						$field['readonly'] = true;
						$field['help']     = $field['locked_help'];
						$kept[]            = $field;
					}
				}
				$screen['tabs'][ $t ]['panels'][ $p ]['fields'] = array_values( $kept );
			}
		}
		return $screen;
	}

	/** @return string[] */
	public static function allowed( array $screen ): array {
		$ids = [];
		foreach ( $screen['tabs'] as $tab ) {
			foreach ( $tab['panels'] as $panel ) {
				foreach ( $panel['fields'] as $field ) {
					if ( self::may( $field ) ) {
						$ids[] = $field['id'];
					}
				}
			}
		}
		return $ids;
	}

	public static function filterValues( array $screen, array $values ): array {
		$allowed = array_flip( self::allowed( $screen ) );
		return array_intersect_key( $values, $allowed );
	}

	private static function may( array $field ): bool {
		return '' === $field['capability'] || current_user_can( $field['capability'] );
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Capabilities.php \
  .claude/skills/blueworx-admin-design/editor/php/v1/Schema.php tests/php/CapabilitiesTest.php
git commit -m "Filter fields by capability on the way out as well as in"
```

---

### Task 8: One sanitiser per field kind

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Sanitise.php`
- Test: `tests/php/SanitiseTest.php`

**Interfaces:**
- Produces: `Sanitise::field(array $field, $value)` returning the cleaned value; `Sanitise::values(array $screen, array $values): array`.

- [ ] **Step 1: Write the failing tests**

Create `tests/php/SanitiseTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Sanitise;

final class SanitiseTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	public function test_text_loses_markup(): void {
		$this->assertSame( 'Rugby', Sanitise::field( [ 'kind' => 'text' ], '<b>Rugby</b>' ) );
	}

	public function test_richtext_keeps_the_five_things_it_allows(): void {
		$out = Sanitise::field( [ 'kind' => 'richtext' ], '<p>A <strong>club</strong> <script>bad()</script></p>' );
		$this->assertStringContainsString( '<strong>club</strong>', $out );
		$this->assertStringNotContainsString( 'script', $out );
	}

	public function test_a_number_outside_its_range_is_clamped(): void {
		$field = [ 'kind' => 'number', 'min' => 1, 'max' => 10 ];
		$this->assertSame( 10, Sanitise::field( $field, 99 ) );
		$this->assertSame( 1, Sanitise::field( $field, -5 ) );
	}

	public function test_a_choice_outside_its_options_becomes_empty(): void {
		$field = [ 'kind' => 'select', 'options' => [ [ 'value' => 'a', 'label' => 'A' ] ] ];
		$this->assertSame( '', Sanitise::field( $field, 'z' ) );
		$this->assertSame( 'a', Sanitise::field( $field, 'a' ) );
	}

	public function test_a_colour_must_be_a_hex_value(): void {
		$this->assertSame( '#4F46E5', Sanitise::field( [ 'kind' => 'colour' ], '#4F46E5' ) );
		$this->assertSame( '', Sanitise::field( [ 'kind' => 'colour' ], 'red; background:url(x)' ) );
	}

	public function test_tokens_are_cleaned_individually_and_deduplicated(): void {
		$out = Sanitise::field( [ 'kind' => 'tokens' ], [ 'under 12', '<b>under 12</b>', 'under 14' ] );
		$this->assertSame( [ 'under 12', 'under 14' ], $out );
	}

	public function test_a_repeater_cleans_every_cell_of_every_row(): void {
		$field = [ 'kind' => 'repeater', 'fields' => [
			[ 'id' => 'day', 'kind' => 'text' ],
			[ 'id' => 'seats', 'kind' => 'number', 'min' => 0, 'max' => 30 ],
		] ];
		$out = Sanitise::field( $field, [ [ 'day' => '<i>Monday</i>', 'seats' => 99, 'sneaky' => 'x' ] ] );
		$this->assertSame( [ [ 'day' => 'Monday', 'seats' => 30 ] ], $out );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter SanitiseTest`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement**

Create `v1/Sanitise.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * Every value is cleaned by what its field is, not by what the browser said it
 * was. A kind with no case here is treated as text, which is the safe end of
 * the range rather than a hole.
 */
final class Sanitise {

	public static function values( array $screen, array $values ): array {
		$out = [];
		foreach ( self::fields( $screen ) as $field ) {
			if ( array_key_exists( $field['id'], $values ) ) {
				$out[ $field['id'] ] = self::field( $field, $values[ $field['id'] ] );
			}
		}
		return $out;
	}

	/** @return array[] */
	public static function fields( array $screen ): array {
		$out = [];
		foreach ( $screen['tabs'] as $tab ) {
			foreach ( $tab['panels'] as $panel ) {
				foreach ( $panel['fields'] as $field ) {
					$out[] = $field;
				}
			}
		}
		return $out;
	}

	public static function field( array $field, $value ) {
		switch ( $field['kind'] ?? 'text' ) {
			case 'richtext':
				return wp_kses_post( (string) $value );

			case 'textarea':
				return implode( "\n", array_map( 'sanitize_text_field', explode( "\n", (string) $value ) ) );

			case 'number':
			case 'range':
				$n = (int) $value;
				if ( isset( $field['min'] ) ) {
					$n = max( (int) $field['min'], $n );
				}
				if ( isset( $field['max'] ) ) {
					$n = min( (int) $field['max'], $n );
				}
				return $n;

			case 'toggle':
				return (bool) $value;

			case 'colour':
				return preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $value ) ? (string) $value : '';

			case 'date':
				return preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $value ) ? (string) $value : '';

			case 'datetime':
				return preg_match( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', (string) $value ) ? (string) $value : '';

			case 'media':
			case 'file':
			case 'record':
				return (int) $value;

			case 'slug':
				return sanitize_key( (string) $value );

			case 'select':
			case 'radio':
				return self::oneOf( $field, (string) $value );

			case 'checkboxes':
			case 'scrolllist':
				$picked = is_array( $value ) ? $value : [];
				$out    = [];
				foreach ( $picked as $one ) {
					$kept = self::oneOf( $field, (string) $one );
					if ( '' !== $kept ) {
						$out[] = $kept;
					}
				}
				return array_values( array_unique( $out ) );

			case 'tokens':
				$given = is_array( $value ) ? $value : [];
				$out   = [];
				foreach ( $given as $one ) {
					$clean = sanitize_text_field( (string) $one );
					if ( '' !== $clean ) {
						$out[] = $clean;
					}
				}
				return array_values( array_unique( $out ) );

			case 'repeater':
				$rows = is_array( $value ) ? $value : [];
				$out  = [];
				foreach ( $rows as $row ) {
					if ( ! is_array( $row ) ) {
						continue;
					}
					$clean = [];
					foreach ( $field['fields'] as $cell ) {
						$clean[ $cell['id'] ] = self::field( $cell, $row[ $cell['id'] ] ?? '' );
					}
					$out[] = $clean;
				}
				return $out;

			// facts and table are read-only on the screen; nothing comes back.
			case 'facts':
			case 'table':
				return null;

			default:
				return sanitize_text_field( (string) $value );
		}
	}

	private static function oneOf( array $field, string $value ): string {
		foreach ( $field['options'] ?? [] as $option ) {
			if ( (string) $option['value'] === $value ) {
				return $value;
			}
		}
		return '';
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Sanitise.php tests/php/SanitiseTest.php
git commit -m "Clean every value by what its field is, not what the browser claimed"
```

---

### Task 9: A failed save writes nothing at all

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Validate.php`
- Test: `tests/php/ValidateTest.php`

**Interfaces:**
- Produces: `Validate::run(array $screen, array $values): array` returning `[]` when valid, or `['field_id' => 'message']`.

- [ ] **Step 1: Write the failing tests**

Create `tests/php/ValidateTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;
use Blueworx\PageEditor\v1\Validate;

final class ValidateTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	private function screen(): array {
		return Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name', 'required' => true ],
						[ 'id' => 'contact', 'kind' => 'text', 'label' => 'Contact email', 'format' => 'email' ],
						[ 'id' => 'label', 'kind' => 'text', 'label' => 'Short label', 'max_length' => 12 ],
					] ],
				] ],
			],
		] );
	}

	public function test_a_valid_record_returns_no_errors(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co', 'label' => 'Rugby' ] );
		$this->assertSame( [], $errors );
	}

	public function test_a_missing_required_field_is_named(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => '' ] );
		$this->assertArrayHasKey( 'name', $errors );
	}

	public function test_an_error_names_the_fix_rather_than_saying_invalid(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => 'Rugby', 'contact' => 'dan' ] );
		$this->assertStringContainsString( 'domain', $errors['contact'] );
		$this->assertStringNotContainsString( 'Invalid', $errors['contact'] );
	}

	public function test_a_length_cap_is_enforced(): void {
		$errors = Validate::run( $this->screen(), [ 'name' => 'Rugby', 'label' => 'Far too long a label' ] );
		$this->assertStringContainsString( '12', $errors['label'] );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter ValidateTest`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement**

Create `v1/Validate.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

use Blueworx\PageEditor\v1\Sanitise;

/**
 * Errors are keyed by field id so the screen can put each message under the
 * field it belongs to. Every message names the fix — "Invalid input" tells a
 * site owner nothing they can act on.
 */
final class Validate {

	/** @return array<string,string> */
	public static function run( array $screen, array $values ): array {
		$errors = [];

		foreach ( Sanitise::fields( $screen ) as $field ) {
			$value = $values[ $field['id'] ] ?? '';

			if ( ! self::applies( $field, $values ) ) {
				continue;
			}

			if ( $field['required'] && self::isEmpty( $value ) ) {
				$errors[ $field['id'] ] = sprintf( '%s needs a value before this can be saved.', $field['label'] );
				continue;
			}
			if ( self::isEmpty( $value ) ) {
				continue;
			}

			if ( 'email' === ( $field['format'] ?? '' ) && '' === sanitize_email( (string) $value ) ) {
				$errors[ $field['id'] ] = 'That is not a valid address. It needs a domain, like dan@coastalbloom.co.';
				continue;
			}
			if ( 'url' === ( $field['format'] ?? '' ) && '' === esc_url_raw( (string) $value ) ) {
				$errors[ $field['id'] ] = 'That is not a valid address. It needs to start with https://.';
				continue;
			}
			if ( isset( $field['max_length'] ) && strlen( (string) $value ) > (int) $field['max_length'] ) {
				$errors[ $field['id'] ] = sprintf( 'Keep this to %d characters or fewer.', (int) $field['max_length'] );
				continue;
			}
		}

		if ( isset( $screen['validate'] ) && is_callable( $screen['validate'] ) ) {
			$extra = call_user_func( $screen['validate'], $values );
			if ( is_array( $extra ) ) {
				$errors = array_merge( $errors, $extra );
			}
		}

		return $errors;
	}

	/**
	 * A field that only exists while its condition holds is not validated when
	 * the condition is false — it is not on the screen, so it cannot be wrong.
	 */
	private static function applies( array $field, array $values ): bool {
		if ( empty( $field['depends_on'] ) ) {
			return true;
		}
		$on = $field['depends_on'];
		return ( $values[ $on['field'] ] ?? null ) == $on['value']; // phpcs:ignore WordPress.PHP.StrictComparisons.LooseComparison -- a checkbox sends "1" for the boolean true a schema declares.
	}

	private static function isEmpty( $value ): bool {
		if ( is_array( $value ) ) {
			return 0 === count( $value );
		}
		return '' === trim( (string) $value );
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Validate.php tests/php/ValidateTest.php
git commit -m "Validate the whole record and name the fix in every message"
```

---

### Task 10: Where the values live

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Store.php`
- Test: `tests/php/StoreTest.php`

**Interfaces:**
- Produces: `Store::for(array $screen): Store` returning a `PostStore` or `OptionStore`; both expose `read(int $id = 0): array` and `write(array $values, int $id = 0): bool`.

- [ ] **Step 1: Write the failing tests**

Create `tests/php/StoreTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;
use Blueworx\PageEditor\v1\Store;

final class StoreTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	private function postScreen(): array {
		return Schema::validate( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
			] ] ],
		] );
	}

	public function test_a_record_round_trips_through_post_meta(): void {
		$store = Store::for( $this->postScreen() );
		$store->write( [ 'name' => 'Rugby' ], 12 );
		$this->assertSame( [ 'name' => 'Rugby' ], $store->read( 12 ) );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][12]['bw_sport_name'] );
	}

	public function test_a_settings_screen_round_trips_through_one_option(): void {
		$screen = Schema::validate( [
			'slug' => 'club-pages', 'title' => 'Club pages', 'store' => 'option', 'option_name' => 'bw_club_pages',
			'tabs' => [ [ 'id' => 'g', 'label' => 'Global', 'panels' => [
				[ 'id' => 'h', 'title' => 'Header', 'fields' => [ [ 'id' => 'menu_label', 'kind' => 'text', 'label' => 'Menu label' ] ] ],
			] ] ],
		] );
		$store = Store::for( $screen );
		$store->write( [ 'menu_label' => 'Menu' ] );
		$this->assertSame( [ 'menu_label' => 'Menu' ], $store->read() );
	}

	public function test_a_field_never_saved_reads_back_as_empty_not_missing(): void {
		$store = Store::for( $this->postScreen() );
		$this->assertSame( [ 'name' => '' ], $store->read( 99 ) );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter StoreTest`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement**

Create `v1/Store.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * Two places a screen's values can live, behind one door.
 *
 * A record's values are post meta keyed by post type and field id, so two
 * screens on one site cannot collide. A settings screen keeps everything in a
 * single option, because it is one thing.
 */
abstract class Store {

	/** @var array */
	protected $screen;

	protected function __construct( array $screen ) {
		$this->screen = $screen;
	}

	public static function for( array $screen ): Store {
		return 'option' === $screen['store'] ? new OptionStore( $screen ) : new PostStore( $screen );
	}

	abstract public function read( int $id = 0 ): array;

	abstract public function write( array $values, int $id = 0 ): bool;

	/** @return array[] */
	protected function fields(): array {
		return Sanitise::fields( $this->screen );
	}
}

final class PostStore extends Store {

	public function read( int $id = 0 ): array {
		$out = [];
		foreach ( $this->fields() as $field ) {
			$out[ $field['id'] ] = get_post_meta( $id, $this->key( $field['id'] ), true );
		}
		return $out;
	}

	public function write( array $values, int $id = 0 ): bool {
		foreach ( $values as $key => $value ) {
			update_post_meta( $id, $this->key( $key ), $value );
		}
		return true;
	}

	private function key( string $field ): string {
		return $this->screen['post_type'] . '_' . $field;
	}
}

final class OptionStore extends Store {

	public function read( int $id = 0 ): array {
		$saved = get_option( $this->screen['option_name'], [] );
		$saved = is_array( $saved ) ? $saved : [];
		$out   = [];
		foreach ( $this->fields() as $field ) {
			$out[ $field['id'] ] = $saved[ $field['id'] ] ?? '';
		}
		return $out;
	}

	public function write( array $values, int $id = 0 ): bool {
		$saved = get_option( $this->screen['option_name'], [] );
		$saved = is_array( $saved ) ? $saved : [];
		return update_option( $this->screen['option_name'], array_merge( $saved, $values ) );
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Store.php tests/php/StoreTest.php
git commit -m "Save records to post meta and settings screens to one option"
```

---

### Task 11: The save path, end to end

Ties Tasks 7 to 10 into the one operation the screen actually performs, and proves the all-or-nothing rule.

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/php/v1/Editor.php`
- Test: `tests/php/SaveTest.php`

**Interfaces:**
- Consumes: `Capabilities`, `Sanitise`, `Validate`, `Store`.
- Produces: `Editor::load(string $slug, int $id = 0): array` returning `['schema' => array, 'values' => array]`; `Editor::save(string $slug, array $values, int $id = 0): array` returning `['ok' => true, 'values' => array]` or `['ok' => false, 'errors' => array<string,string>]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/php/SaveTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class SaveTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];

		Editor::register( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name', 'required' => true ],
					[ 'id' => 'contact', 'kind' => 'text', 'label' => 'Contact email', 'format' => 'email' ],
					[ 'id' => 'fee', 'kind' => 'number', 'label' => 'Fee', 'capability' => 'manage_woocommerce' ],
				] ],
			] ] ],
		] );
	}

	public function test_a_valid_save_writes_and_reports_ok(): void {
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co' ], 7 );
		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_name'] );
	}

	public function test_an_invalid_save_writes_nothing_at_all(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$result = Editor::save( 'sports', [ 'name' => 'Hockey', 'contact' => 'dan' ], 7 );

		$this->assertFalse( $result['ok'] );
		$this->assertArrayHasKey( 'contact', $result['errors'] );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_name'], 'the earlier value must survive a failed save' );
	}

	public function test_a_value_the_user_may_not_write_is_ignored_silently(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'fee' => 40 ], 7 );
		$this->assertArrayNotHasKey( 'bw_sport_fee', $GLOBALS['bwpe_stub']['meta'][7] );
	}

	public function test_load_returns_a_schema_already_filtered_by_capability(): void {
		$loaded = Editor::load( 'sports', 7 );
		$ids    = array_column( $loaded['schema']['tabs'][0]['panels'][0]['fields'], 'id' );
		$this->assertSame( [ 'name', 'contact' ], $ids );
		$this->assertArrayNotHasKey( 'fee', $loaded['values'] );
	}

	public function test_saving_a_screen_that_is_not_ready_fails_with_its_reason(): void {
		$GLOBALS['bwpe_stub']['post_types'] = [];
		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$this->assertFalse( $result['ok'] );
		$this->assertStringContainsString( 'bw_sport', $result['errors']['_screen'] );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter SaveTest`
Expected: FAIL — `Call to undefined method … save()`.

- [ ] **Step 3: Implement**

Add to `v1/Editor.php`:

```php
	/**
	 * Everything the screen needs to draw itself: the schema this user is
	 * allowed to see, and the values behind it.
	 */
	public static function load( string $slug, int $id = 0 ): array {
		$screen = self::get( $slug );
		if ( null === $screen || ! self::ready( $slug ) ) {
			return [ 'schema' => null, 'values' => [], 'problem' => self::problem( $slug ) ];
		}
		$visible = Capabilities::filterSchema( $screen );
		$values  = Store::for( $screen )->read( $id );

		return [
			'schema' => $visible,
			'values' => Capabilities::filterValues( $screen, $values ),
		];
	}

	/**
	 * The whole record, or nothing. A part-written record is worse than a
	 * rejected one: the site owner would have no way to tell which half landed.
	 */
	public static function save( string $slug, array $values, int $id = 0 ): array {
		$screen = self::get( $slug );
		if ( null === $screen ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => 'That editor screen does not exist.' ] ];
		}
		if ( ! current_user_can( $screen['capability'] ) ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => 'You do not have permission to change this.' ] ];
		}
		if ( ! self::ready( $slug ) ) {
			return [ 'ok' => false, 'errors' => [ '_screen' => self::problem( $slug ) ] ];
		}

		$writable = Capabilities::filterValues( $screen, $values );
		$clean    = Sanitise::values( $screen, $writable );
		$errors   = Validate::run( $screen, $clean );

		if ( $errors ) {
			return [ 'ok' => false, 'errors' => $errors ];
		}

		Store::for( $screen )->write( $clean, $id );

		return [ 'ok' => true, 'values' => $clean ];
	}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 32 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Editor.php tests/php/SaveTest.php
git commit -m "Save the whole record or none of it"
```

---

### Task 12: The Publish and settings tab, added for you

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Settings.php`
- Modify: `.claude/skills/blueworx-admin-design/editor/php/v1/Editor.php`
- Test: `tests/php/SettingsTabTest.php`

**Interfaces:**
- Produces: `Settings::tab(array $screen): ?array` — the tab definition, or null for an option screen.

- [ ] **Step 1: Write the failing tests**

Create `tests/php/SettingsTabTest.php`:

```php
<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class SettingsTabTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
	}

	private function register( string $store = 'post' ): void {
		Editor::register( array_merge(
			[
				'slug' => 'sports', 'title' => 'Edit sport',
				'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
					[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
				] ] ],
			],
			'post' === $store ? [ 'post_type' => 'bw_sport' ] : [ 'store' => 'option', 'option_name' => 'bw_x' ]
		) );
	}

	public function test_a_record_screen_gains_the_tab_last(): void {
		$this->register( 'post' );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$this->assertSame( 'Publish & settings', end( $tabs )['label'] );
	}

	public function test_the_tab_holds_the_three_panels_in_order(): void {
		$this->register( 'post' );
		$tabs   = Editor::load( 'sports', 7 )['schema']['tabs'];
		$panels = array_column( end( $tabs )['panels'], 'id' );
		$this->assertSame( [ 'status', 'taxonomies', 'parent' ], $panels );
	}

	public function test_the_slug_field_warns_that_links_break(): void {
		$this->register( 'post' );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$help = '';
		foreach ( end( $tabs )['panels'][0]['fields'] as $field ) {
			if ( 'slug' === $field['id'] ) {
				$help = $field['help'];
			}
		}
		$this->assertStringContainsString( 'not redirected', $help );
	}

	public function test_a_settings_screen_does_not_gain_the_tab(): void {
		$this->register( 'option' );
		$tabs = Editor::load( 'sports' )['schema']['tabs'];
		$this->assertCount( 1, $tabs );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vendor/bin/phpunit --filter SettingsTabTest`
Expected: FAIL — only one tab is returned.

- [ ] **Step 3: Implement**

Create `v1/Settings.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * WordPress's own post settings, in their own tab, last, identical on every
 * screen we build. A plugin does not write these and cannot reorder them —
 * that sameness is the point.
 */
final class Settings {

	public static function tab( array $screen ): ?array {
		if ( 'post' !== $screen['store'] ) {
			return null;
		}

		return [
			'id'     => 'publish',
			'label'  => 'Publish & settings',
			'panels' => [
				[
					'id'       => 'status',
					'eyebrow'  => 'Publishing',
					'title'    => 'Status, slug and excerpt',
					'note'     => 'Where this sits on the site, and who can reach it.',
					'hideable' => false,
					'fields'   => [
						[ 'id' => 'post_status', 'kind' => 'select', 'label' => 'Status', 'help' => 'A draft is only visible to you.', 'options' => [
							[ 'value' => 'draft', 'label' => 'Draft' ],
							[ 'value' => 'publish', 'label' => 'Published' ],
							[ 'value' => 'private', 'label' => 'Private' ],
						] ],
						[ 'id' => 'post_date', 'kind' => 'datetime', 'label' => 'Published' ],
						[ 'id' => 'post_author', 'kind' => 'record', 'label' => 'Author', 'capability' => 'edit_others_posts', 'locked_help' => 'Only an editor can change the author.' ],
						[ 'id' => 'post_name', 'kind' => 'slug', 'label' => 'Slug', 'help' => 'Changing this breaks links already shared; the old address is not redirected.' ],
						[ 'id' => 'post_excerpt', 'kind' => 'textarea', 'label' => 'Excerpt', 'help' => 'Used where the site shows a summary rather than the whole page.' ],
						[ 'id' => 'comment_status', 'kind' => 'toggle', 'label' => 'Allow comments' ],
					],
				],
				[
					'id'       => 'taxonomies',
					'eyebrow'  => 'Publishing',
					'title'    => 'Categories and tags',
					'note'     => 'How this record is grouped and found.',
					'hideable' => false,
					'fields'   => [
						[ 'id' => 'post_tags', 'kind' => 'tokens', 'label' => 'Tags', 'help' => 'Press Enter after each one.' ],
						[ 'id' => 'featured_image', 'kind' => 'media', 'label' => 'Featured image' ],
					],
				],
				[
					'id'       => 'parent',
					'eyebrow'  => 'Publishing',
					'title'    => 'Parent and template',
					'note'     => 'Where this sits in the site structure.',
					'hideable' => false,
					'fields'   => [
						[ 'id' => 'post_parent', 'kind' => 'record', 'label' => 'Parent', 'help' => 'Leave this empty to keep the record at the top level.' ],
						[ 'id' => 'menu_order', 'kind' => 'number', 'label' => 'Order', 'help' => 'Lower numbers come first.', 'min' => 0 ],
					],
				],
			],
		];
	}
}
```

In `Editor::load()`, append the tab to `$visible` before returning:

```php
		$extra = Settings::tab( $screen );
		if ( null !== $extra ) {
			$visible['tabs'][] = Capabilities::filterSchema( [ 'tabs' => [ $extra ] ] )['tabs'][0];
		}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vendor/bin/phpunit`
Expected: PASS, 36 tests.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Settings.php \
  .claude/skills/blueworx-admin-design/editor/php/v1/Editor.php tests/php/SettingsTabTest.php
git commit -m "Add WordPress's own post settings as their own last tab"
```

---

### Task 13: The admin page and the two REST routes

The only task whose code needs a real WordPress to run, so it is proved by Stage D rather than by PHPUnit.

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Rest.php`
- Create: `.claude/skills/blueworx-admin-design/editor/php/v1/Screen.php`
- Modify: `.claude/skills/blueworx-admin-design/editor/php/v1/Editor.php`

**Interfaces:**
- Consumes: `Editor::load()`, `Editor::save()`.
- Produces: `GET /wp-json/blueworx-page-editor/v1/<slug>?id=<n>` → `{schema, values}`; `POST` same path with `{id, values}` → `{ok:true, values}` or 422 `{ok:false, errors}`. Stage C calls exactly these.

- [ ] **Step 1: Write the REST routes**

Create `v1/Rest.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * Two routes, because the screen only ever does two things: load the record,
 * and save the record. Both re-check permission — the admin page having
 * rendered is not proof of anything by the time a request arrives.
 */
final class Rest {

	const NS = 'blueworx-page-editor/v1';

	public static function boot(): void {
		add_action( 'rest_api_init', [ __CLASS__, 'routes' ] );
	}

	public static function routes(): void {
		foreach ( Editor::all() as $slug => $screen ) {
			register_rest_route( self::NS, '/' . $slug, [
				[
					'methods'             => 'GET',
					'callback'            => static function ( $request ) use ( $slug ) {
						return rest_ensure_response( Editor::load( $slug, (int) $request->get_param( 'id' ) ) );
					},
					'permission_callback' => static function () use ( $screen ) {
						return current_user_can( $screen['capability'] );
					},
					'args'                => [ 'id' => [ 'type' => 'integer', 'default' => 0 ] ],
				],
				[
					'methods'             => 'POST',
					'callback'            => static function ( $request ) use ( $slug ) {
						$values = $request->get_param( 'values' );
						$result = Editor::save( $slug, is_array( $values ) ? $values : [], (int) $request->get_param( 'id' ) );
						return new \WP_REST_Response( $result, $result['ok'] ? 200 : 422 );
					},
					'permission_callback' => static function () use ( $screen ) {
						return current_user_can( $screen['capability'] );
					},
				],
			] );
		}
	}
}
```

- [ ] **Step 2: Write the admin page**

Create `v1/Screen.php`:

```php
<?php
namespace Blueworx\PageEditor\v1;

/**
 * The admin page itself: a mount point, the design system, and the editor.
 * WordPress supplies the menu and the admin bar, so the screen is full-bleed
 * within them — that is the only chrome the plugin overrides, and only here.
 */
final class Screen {

	public static function boot(): void {
		add_action( 'admin_menu', [ __CLASS__, 'menu' ] );
		add_action( 'admin_enqueue_scripts', [ __CLASS__, 'assets' ] );
	}

	public static function menu(): void {
		foreach ( Editor::all() as $slug => $screen ) {
			$render = static function () use ( $slug ) {
				self::render( $slug );
			};
			if ( ! empty( $screen['parent'] ) ) {
				add_submenu_page( $screen['parent'], $screen['title'], $screen['menu_title'] ?? $screen['title'], $screen['capability'], $slug, $render );
			} else {
				add_menu_page( $screen['title'], $screen['menu_title'] ?? $screen['title'], $screen['capability'], $slug, $render, $screen['icon'] ?? 'dashicons-edit' );
			}
		}
	}

	public static function render( string $slug ): void {
		$screen = Editor::get( $slug );

		if ( ! Editor::ready( $slug ) ) {
			printf(
				'<div class="wrap bw-admin"><div class="bw-notice bw-notice--danger"><p>%s</p></div></div>',
				esc_html( Editor::problem( $slug ) )
			);
			return;
		}

		printf(
			'<div class="wrap bw-wrap bw-admin"><div id="bw-page-editor" data-screen="%s" data-record="%d"></div></div>',
			esc_attr( $slug ),
			(int) ( $_GET['id'] ?? 0 ) // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- reading which record to show, not changing anything.
		);
	}

	public static function assets( string $hook ): void {
		$slug = self::slugForHook( $hook );
		if ( null === $slug ) {
			return;
		}

		$base = self::url();

		wp_enqueue_style( 'blueworx-admin-design', $base . 'assets/blueworx-admin-design.css', [], self::version() );
		wp_enqueue_script( 'blueworx-page-editor', $base . 'assets/blueworx-page-editor.js', [ 'wp-element', 'wp-api-fetch', 'wp-i18n' ], self::version(), true );

		// The screen is full-bleed inside wp-admin's own chrome, and only here.
		wp_add_inline_style( 'blueworx-admin-design', implode( '', [
			'.wrap.bw-wrap{margin:0}',
			'body.' . sanitize_html_class( $hook ) . ' #wpcontent{padding-left:0}',
			'body.' . sanitize_html_class( $hook ) . ' #wpbody-content{padding-bottom:0}',
			'body.' . sanitize_html_class( $hook ) . ' #wpfooter{display:none}',
		] ) );

		wp_add_inline_script(
			'blueworx-page-editor',
			'window.blueworxPageEditor=' . wp_json_encode( [
				'root'  => esc_url_raw( rest_url( Rest::NS ) ),
				'nonce' => wp_create_nonce( 'wp_rest' ),
			] ) . ';',
			'before'
		);
	}

	private static function slugForHook( string $hook ): ?string {
		foreach ( array_keys( Editor::all() ) as $slug ) {
			if ( false !== strpos( $hook, $slug ) ) {
				return $slug;
			}
		}
		return null;
	}

	/** The plugin that registered the screen owns the assets, so the URL comes from it. */
	private static function url(): string {
		return apply_filters( 'blueworx_page_editor_asset_url', plugin_dir_url( dirname( __DIR__, 4 ) ) );
	}

	private static function version(): string {
		return \Blueworx\PageEditor\Registry::latest();
	}
}
```

- [ ] **Step 3: Boot both from the facade**

Add to `v1/Editor.php`:

```php
	public static function boot(): void {
		Screen::boot();
		Rest::boot();
	}
```

And call it at the end of `Registry::load()`:

```php
		\Blueworx\PageEditor\v1\Editor::boot();
```

- [ ] **Step 4: Syntax-check**

Run:

```bash
find .claude/skills/blueworx-admin-design/editor/php -name '*.php' -print0 | xargs -0 -n1 php -l
```

Expected: `No syntax errors detected` for every file.

- [ ] **Step 5: Confirm the PHPUnit suite still passes**

Run: `vendor/bin/phpunit`
Expected: PASS, 36 tests. (These two classes call WordPress directly and are proved in Stage D.)

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php/v1/Rest.php \
  .claude/skills/blueworx-admin-design/editor/php/v1/Screen.php \
  .claude/skills/blueworx-admin-design/editor/php/v1/Editor.php \
  .claude/skills/blueworx-admin-design/editor/php/Registry.php
git commit -m "Register the admin page and the two routes the editor talks to"
```

---

# Stage C — The browser runtime

One file. Pure logic at the top, exported for `node --test`; the view below it; the bootstrap last, behind a `window.wp` guard so the same file loads cleanly in Node.

### Task 14: The pure logic, and its tests

**Files:**
- Create: `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`
- Test: `scripts/lib/page-editor.test.mjs`
- Modify: `.github/workflows/foundation-ci.yml`

**Interfaces:**
- Produces (exported for tests): `isDirty(saved, current)`, `dependencyMet(field, values)`, `visibleFields(panel, values)`, `panelCount(panel, values)`, `tabCount(tab)`, `countLabel(n)`, `dirtyTabs(schema, saved, current)`, `firstErrorTab(schema, errors)`.

Note on the classmap: `Store.php` declares three classes (`Store`, `PostStore`, `OptionStore`) in one file because they are one idea, which PSR-4 cannot express — hence the classmap in `composer.json`, and hence `Registry::load()` requiring files explicitly rather than relying on an autoloader that does not exist inside WordPress.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/page-editor.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pe = require('../../.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js');

const schema = {
  tabs: [
    { id: 'details', label: 'Details', panels: [
      { id: 'basics', title: 'Basics', fields: [
        { id: 'name', kind: 'text', label: 'Name' },
        { id: 'announce', kind: 'toggle', label: 'Show the announcement bar' },
        { id: 'announce_text', kind: 'text', label: 'Announcement', depends_on: { field: 'announce', value: true } },
      ] },
    ] },
    { id: 'media', label: 'Media', panels: [
      { id: 'images', title: 'Images', fields: [{ id: 'header', kind: 'media', label: 'Header image' }] },
    ] },
  ],
};

test('isDirty: identical records are clean', () => {
  assert.equal(pe.isDirty({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }), false);
});

test('isDirty: a changed value is dirty', () => {
  assert.equal(pe.isDirty({ a: 1 }, { a: 2 }), true);
});

test('isDirty: a reordered repeater is dirty', () => {
  assert.equal(pe.isDirty({ r: [{ d: 'Mon' }, { d: 'Tue' }] }, { r: [{ d: 'Tue' }, { d: 'Mon' }] }), true);
});

test('dependencyMet: a field with no dependency always applies', () => {
  assert.equal(pe.dependencyMet({ id: 'name' }, {}), true);
});

test('dependencyMet: a dependent field applies only while its condition holds', () => {
  const field = { id: 'announce_text', depends_on: { field: 'announce', value: true } };
  assert.equal(pe.dependencyMet(field, { announce: false }), false);
  assert.equal(pe.dependencyMet(field, { announce: true }), true);
});

test('visibleFields: drops fields whose condition is false', () => {
  const panel = schema.tabs[0].panels[0];
  assert.deepEqual(pe.visibleFields(panel, { announce: false }).map((f) => f.id), ['name', 'announce']);
  assert.deepEqual(pe.visibleFields(panel, { announce: true }).map((f) => f.id), ['name', 'announce', 'announce_text']);
});

test('tabCount: counts the panels in the tab, not the fields', () => {
  assert.equal(pe.tabCount(schema.tabs[0], {}), 1);
});

test('countLabel: an empty group reads "empty", never "0"', () => {
  assert.equal(pe.countLabel(0), 'empty');
  assert.equal(pe.countLabel(3), '3');
});

test('dirtyTabs: names the tab a change is in', () => {
  const tabs = pe.dirtyTabs(schema, { name: 'Rugby', header: 1 }, { name: 'Hockey', header: 1 });
  assert.deepEqual(tabs, ['Details']);
});

test('firstErrorTab: finds the tab holding the first bad field', () => {
  assert.equal(pe.firstErrorTab(schema, { header: 'Pick an image.' }), 'media');
});

test('firstErrorTab: returns null when nothing is wrong', () => {
  assert.equal(pe.firstErrorTab(schema, {}), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test scripts/lib/page-editor.test.mjs
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Write the pure logic**

Create `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`:

```js
/**
 * BlueWorx page editor — the browser half.
 *
 * Plain JavaScript on purpose. It runs against the React WordPress already
 * registers, so a plugin adds no dependency and no build step, and elements are
 * made with h() rather than JSX for the same reason.
 *
 * Do not edit this file in a plugin. It is compared against the foundation on
 * every pull request; the fix for a difference is always to re-pull.
 *
 * Layout: pure logic first (exported at the bottom for tests), then the view,
 * then the bootstrap — which only runs where there is a browser to run in.
 */
(function (root) {
  'use strict';

  /* --- Pure logic ---------------------------------------------------------- */

  function isDirty(saved, current) {
    return JSON.stringify(saved) !== JSON.stringify(current);
  }

  // A checkbox sends "1" for the boolean true a schema declares, so the
  // comparison is deliberately loose in one direction only: both sides are
  // reduced to a string first.
  function dependencyMet(field, values) {
    if (!field || !field.depends_on) return true;
    const want = field.depends_on.value;
    const got = values ? values[field.depends_on.field] : undefined;
    if (typeof want === 'boolean') return Boolean(got) === want;
    return String(got === undefined ? '' : got) === String(want);
  }

  function visibleFields(panel, values) {
    return (panel.fields || []).filter(function (field) {
      return dependencyMet(field, values);
    });
  }

  function panelCount(panel, values) {
    return visibleFields(panel, values).length;
  }

  function tabCount(tab) {
    return (tab.panels || []).length;
  }

  // A group with nothing in it reads "empty". "0" is a number the site owner
  // has to interpret; "empty" is the fact itself.
  function countLabel(n) {
    return n === 0 ? 'empty' : String(n);
  }

  function fieldsIn(tab) {
    return (tab.panels || []).reduce(function (all, panel) {
      return all.concat(panel.fields || []);
    }, []);
  }

  function dirtyTabs(schema, saved, current) {
    return (schema.tabs || []).filter(function (tab) {
      return fieldsIn(tab).some(function (field) {
        return isDirty(saved[field.id], current[field.id]);
      });
    }).map(function (tab) {
      return tab.label;
    });
  }

  function firstErrorTab(schema, errors) {
    const bad = Object.keys(errors || {});
    if (bad.length === 0) return null;
    const found = (schema.tabs || []).find(function (tab) {
      return fieldsIn(tab).some(function (field) {
        return bad.indexOf(field.id) !== -1;
      });
    });
    return found ? found.id : null;
  }

  const api = {
    isDirty: isDirty,
    dependencyMet: dependencyMet,
    visibleFields: visibleFields,
    panelCount: panelCount,
    tabCount: tabCount,
    countLabel: countLabel,
    dirtyTabs: dirtyTabs,
    firstErrorTab: firstErrorTab,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.blueworxPageEditorCore = api;
}(typeof window !== 'undefined' ? window : globalThis));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/page-editor.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add the file to the repo's syntax pass**

In `.github/workflows/foundation-ci.yml`, change the syntax-check step to include it:

```yaml
      - name: Syntax-check all scripts
        run: |
          for f in scripts/*.mjs scripts/lib/*.mjs .claude/hooks/*.mjs \
                   .claude/skills/blueworx-admin-design/editor/*.js; do
            node --check "$f"
          done
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js \
  scripts/lib/page-editor.test.mjs .github/workflows/foundation-ci.yml
git commit -m "Add the editor's pure logic, with tests"
```

---

### Task 15: The shell — header, tabs, panels, save bar

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`

**Interfaces:**
- Consumes: everything from Task 14.
- Produces: `Editor(props)` component; `useRecord(slug, id)` hook returning `{ schema, values, saved, setValue, save, saving, errors, notice, dismiss, discard }`.

- [ ] **Step 1: Add the data hook**

Insert above the export block:

```js
  /* --- Data ---------------------------------------------------------------- */

  function wp() {
    return root.wp;
  }

  function useRecord(slug, id) {
    const el = wp().element;
    const [schema, setSchema] = el.useState(null);
    const [problem, setProblem] = el.useState('');
    const [saved, setSaved] = el.useState({});
    const [values, setValues] = el.useState({});
    const [errors, setErrors] = el.useState({});
    const [notice, setNotice] = el.useState(null);
    const [saving, setSaving] = el.useState(false);
    const [loading, setLoading] = el.useState(true);

    el.useEffect(function () {
      wp().apiFetch({ path: root.blueworxPageEditor.root.replace(/^.*\/wp-json/, '') + '/' + slug + '?id=' + id })
        .then(function (data) {
          if (!data.schema) { setProblem(data.problem || ''); setLoading(false); return; }
          setSchema(data.schema);
          setSaved(data.values);
          setValues(data.values);
          setLoading(false);
        })
        .catch(function () {
          setProblem('This editor could not be loaded. Reload the page to try again.');
          setLoading(false);
        });
    }, [slug, id]);

    function setValue(fieldId, value) {
      setValues(function (prev) {
        const next = Object.assign({}, prev);
        next[fieldId] = value;
        return next;
      });
      setNotice(null);
    }

    function save() {
      setSaving(true);
      wp().apiFetch({
        path: root.blueworxPageEditor.root.replace(/^.*\/wp-json/, '') + '/' + slug,
        method: 'POST',
        data: { id: id, values: values },
      }).then(function (result) {
        setSaved(result.values);
        setValues(result.values);
        setErrors({});
        setNotice({ kind: 'success', text: 'Saved. The site is showing these changes now.' });
        setSaving(false);
      }).catch(function (response) {
        const body = response && response.errors ? response : { errors: { _screen: 'That could not be saved. Try again.' } };
        setErrors(body.errors);
        setNotice({ kind: 'danger', text: 'Nothing was saved. Some fields need attention first.' });
        setSaving(false);
      });
    }

    function discard() {
      setValues(saved);
      setErrors({});
      setNotice(null);
    }

    return {
      schema: schema, problem: problem, loading: loading, values: values, saved: saved,
      errors: errors, notice: notice, saving: saving,
      setValue: setValue, save: save, discard: discard,
      dismiss: function () { setNotice(null); },
      dirty: isDirty(saved, values),
    };
  }
```

- [ ] **Step 2: Add the shell**

```js
  /* --- The shell ----------------------------------------------------------- */

  function Editor(props) {
    const el = wp().element;
    const h = el.createElement;
    const record = useRecord(props.slug, props.id);
    const [tab, setTab] = el.useState(null);

    if (record.loading) {
      return h('div', { className: 'bw-card' }, h('div', { className: 'bw-card__body' },
        h('div', { className: 'bw-skel' }), h('div', { className: 'bw-skel' }), h('div', { className: 'bw-skel' })));
    }
    if (record.problem) {
      return h('div', { className: 'bw-notice bw-notice--danger' }, h('p', null, record.problem));
    }

    const tabs = record.schema.tabs || [];
    const active = tab || (tabs[0] && tabs[0].id);
    const current = tabs.find(function (t) { return t.id === active; }) || tabs[0];
    const dirtyIn = dirtyTabs(record.schema, record.saved, record.values);

    return h('div', { className: 'bw-page' },
      h(PageHead, { schema: record.schema }),
      tabs.length > 1 ? h(Tabs, { tabs: tabs, active: active, onPick: setTab }) : null,
      record.notice ? h(Notice, { notice: record.notice, onDismiss: record.dismiss,
        onGo: function () { const t = firstErrorTab(record.schema, record.errors); if (t) setTab(t); } }) : null,
      h('div', { className: 'bw-panels' }, (current ? current.panels : []).map(function (panel) {
        return h(Panel, { key: panel.id, panel: panel, record: record });
      })),
      h(SaveBar, { record: record, dirtyIn: dirtyIn })
    );
  }

  function PageHead(props) {
    const h = wp().element.createElement;
    return h('div', { className: 'bw-pagehead' },
      h('div', { className: 'bw-pagehead__titles' },
        props.schema.eyebrow ? h('p', { className: 'bw-pagehead__eyebrow' }, props.schema.eyebrow) : null,
        h('h1', { className: 'bw-pagehead__h1' }, props.schema.title),
        props.schema.lede ? h('p', { className: 'bw-pagehead__lede' }, props.schema.lede) : null));
  }

  function Tabs(props) {
    const h = wp().element.createElement;
    return h('div', { className: 'bw-tabs', role: 'tablist' }, props.tabs.map(function (tab) {
      return h('button', {
        key: tab.id,
        type: 'button',
        role: 'tab',
        'aria-selected': tab.id === props.active,
        className: 'bw-tab' + (tab.id === props.active ? ' is-active' : ''),
        onClick: function () { props.onPick(tab.id); },
      }, tab.label, h('span', { className: 'bw-tab__count' }, countLabel(tabCount(tab))));
    }));
  }

  function Notice(props) {
    const h = wp().element.createElement;
    return h('div', { className: 'bw-notice bw-notice--' + props.notice.kind },
      h('p', null, props.notice.text),
      props.notice.kind === 'danger'
        ? h('button', { type: 'button', className: 'bw-btn bw-btn--ghost', onClick: props.onGo }, 'Take me to it')
        : h('button', { type: 'button', className: 'bw-btn bw-btn--ghost', onClick: props.onDismiss }, 'Dismiss'));
  }

  function Panel(props) {
    const h = wp().element.createElement;
    const panel = props.panel;
    const fields = visibleFields(panel, props.record.values);
    const hiddenId = panel.id + '__shown';
    const shown = props.record.values[hiddenId] !== false;

    return h('section', { className: 'bw-card' },
      h('div', { className: 'bw-card__head' },
        h('div', { className: 'bw-card__titles' },
          panel.eyebrow ? h('p', { className: 'bw-card__eyebrow' }, panel.eyebrow) : null,
          h('h2', { className: 'bw-card__title' }, panel.title)),
        panel.hideable ? h('label', { className: 'bw-switch' },
          h('input', { type: 'checkbox', checked: shown,
            onChange: function (e) { props.record.setValue(hiddenId, e.target.checked); } }),
          h('span', { className: 'bw-switch__track' }),
          h('span', { className: 'bw-switch__label' }, shown ? 'Shown' : 'Hidden')) : null),
      shown ? h('div', { className: 'bw-card__body' },
        panel.note ? h('p', { className: 'bw-card__note' }, panel.note) : null,
        fields.length === 0
          ? h('div', { className: 'bw-empty' }, h('p', null, 'Nothing here yet.'))
          : h('div', { className: 'bw-fields' }, fields.map(function (field) {
              return h(Field, { key: field.id, field: field, record: props.record });
            }))) : null);
  }

  function SaveBar(props) {
    const h = wp().element.createElement;
    const record = props.record;
    const clean = !record.dirty;
    const hint = clean
      ? 'Everything is saved.'
      : props.dirtyIn.length === 1
        ? 'Unsaved changes in ' + props.dirtyIn[0] + '.'
        : 'Unsaved changes.';

    return h('div', { className: 'bw-savebar' },
      h('p', { className: 'bw-savebar__hint' },
        h('i', { className: 'bw-icon', 'data-lucide': clean ? 'circle-check' : 'circle-alert' }), hint),
      h('button', { type: 'button', className: 'bw-btn bw-btn--ghost', disabled: clean || record.saving, onClick: record.discard }, 'Discard changes'),
      h('button', { type: 'button', className: 'bw-btn bw-btn--primary', disabled: clean || record.saving, onClick: record.save }, record.saving ? 'Saving…' : 'Save changes'));
  }
```

- [ ] **Step 3: Syntax-check**

Run: `node --check .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`
Expected: no output.

- [ ] **Step 4: Confirm the pure tests still pass**

Run: `node --test scripts/lib/page-editor.test.mjs`
Expected: PASS, 11 tests. The view code must not have broken the Node load — if it has, something outside a function is touching `wp`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js
git commit -m "Draw the editor shell: header, tabs, panels and one save bar"
```

---

### Task 16: The straightforward controls

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`

**Interfaces:**
- Produces: `Field(props)` handling `text`, `textarea`, `number`, `range`, `colour`, `date`, `datetime`, `copytext`, `select`, `radio`, `checkboxes`, `toggle`, `title`, `slug`.

- [ ] **Step 1: Add the field wrapper and the simple kinds**

```js
  /* --- Fields -------------------------------------------------------------- */

  function Field(props) {
    const h = wp().element.createElement;
    const field = props.field;
    const error = props.record.errors[field.id];
    const wrap = 'bw-field' + (field.wide ? ' bw-field--wide' : '');

    return h('div', { className: wrap },
      field.kind !== 'title' ? h('label', { className: 'bw-field__label', htmlFor: field.id },
        field.label,
        field.required ? h('span', { className: 'bw-field__req' }, '*') : null) : null,
      h(Control, { field: field, record: props.record, invalid: Boolean(error) }),
      error ? h('p', { className: 'bw-field__error' }, error)
            : field.help ? h('p', { className: 'bw-field__help' }, field.help) : null);
  }

  function Control(props) {
    const h = wp().element.createElement;
    const field = props.field;
    const record = props.record;
    const value = record.values[field.id];
    const set = function (v) { record.setValue(field.id, v); };
    const common = {
      id: field.id,
      disabled: Boolean(field.readonly),
      className: 'bw-input' + (props.invalid ? ' bw-input--invalid' : ''),
    };

    switch (field.kind) {
      case 'title':
        return h('input', { id: field.id, type: 'text', className: 'bw-titleinput', placeholder: field.label,
          disabled: Boolean(field.readonly), value: value || '', onChange: function (e) { set(e.target.value); } });

      case 'slug':
        return h('div', { className: 'bw-permalink' },
          h('code', null, (root.blueworxPageEditor && root.blueworxPageEditor.home) || '/'),
          h('input', Object.assign({}, common, { type: 'text', value: value || '', onChange: function (e) { set(e.target.value); } })));

      case 'textarea':
        return h('textarea', { id: field.id, disabled: Boolean(field.readonly), rows: 5,
          className: 'bw-textarea' + (props.invalid ? ' bw-textarea--invalid' : ''),
          value: value || '', onChange: function (e) { set(e.target.value); } });

      case 'number':
        return h('span', { className: 'bw-inputwrap' },
          h('input', Object.assign({}, common, { type: 'number', min: field.min, max: field.max,
            value: value === undefined || value === '' ? '' : value,
            onChange: function (e) { set(e.target.value === '' ? '' : Number(e.target.value)); } })),
          field.unit ? h('span', { className: 'bw-inputwrap__affix' }, field.unit) : null);

      case 'range':
        return h('div', { className: 'bw-range' },
          h('input', { id: field.id, type: 'range', min: field.min || 0, max: field.max || 10,
            disabled: Boolean(field.readonly), value: Number(value || 0),
            onChange: function (e) { set(Number(e.target.value)); } }),
          h('span', { className: 'bw-range__value' }, String(value || 0)));

      case 'colour':
        return h('div', { className: 'bw-colorfield' },
          h('input', { type: 'color', className: 'bw-colorfield__swatch', disabled: Boolean(field.readonly),
            value: value || '#4F46E5', onChange: function (e) { set(e.target.value); } }),
          h('input', Object.assign({}, common, { type: 'text', className: common.className + ' bw-colorfield__hex bw-input--mono',
            value: value || '', onChange: function (e) { set(e.target.value); } })),
          h('div', { className: 'bw-colorfield__presets' }, (field.presets || []).map(function (hex) {
            return h('button', { key: hex, type: 'button', title: hex,
              className: 'bw-colorfield__preset' + (value === hex ? ' is-active' : ''),
              style: { background: hex }, onClick: function () { set(hex); } });
          })));

      case 'date':
      case 'datetime':
        return h('input', Object.assign({}, common, {
          type: field.kind === 'date' ? 'date' : 'datetime-local',
          value: value || '', onChange: function (e) { set(e.target.value); } }));

      case 'copytext':
        return h('div', { className: 'bw-copyfield' },
          h('input', Object.assign({}, common, { className: common.className + ' bw-input--mono', readOnly: true, value: value || '' })),
          h('button', { type: 'button', className: 'bw-btn bw-btn--secondary bw-copyfield__btn',
            onClick: function () { root.navigator.clipboard.writeText(value || ''); } }, 'Copy'));

      case 'select':
      case 'record':
        return h('span', { className: 'bw-select' },
          h('select', { id: field.id, className: 'bw-select__el', disabled: Boolean(field.readonly),
            value: value === undefined ? '' : value, onChange: function (e) { set(e.target.value); } },
            h('option', { value: '' }, '—'),
            (field.options || []).map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })),
          h('i', { className: 'bw-icon bw-select__chev', 'data-lucide': 'chevron-down' }));

      case 'radio':
        return h('div', { className: 'bw-radiogroup bw-radiogroup--row' }, (field.options || []).map(function (o) {
          return h('label', { key: o.value, className: 'bw-check' },
            h('input', { type: 'radio', name: field.id, value: o.value, checked: value === o.value,
              disabled: Boolean(field.readonly), onChange: function () { set(o.value); } }),
            h('span', null, o.label),
            o.help ? h('small', { className: 'bw-check__help' }, o.help) : null);
        }));

      case 'checkboxes':
      case 'scrolllist':
        return h('div', { className: field.kind === 'scrolllist' ? 'bw-scrolllist' : 'bw-radiogroup bw-radiogroup--row' },
          (field.options || []).map(function (o) {
            const picked = (value || []).indexOf(o.value) !== -1;
            return h('label', { key: o.value, className: 'bw-check' },
              h('input', { type: 'checkbox', checked: picked, disabled: Boolean(field.readonly),
                onChange: function () {
                  const next = (value || []).slice();
                  if (picked) next.splice(next.indexOf(o.value), 1); else next.push(o.value);
                  set(next);
                } }),
              h('span', null, o.label));
          }));

      case 'toggle':
        return h('label', { className: 'bw-switch' },
          h('input', { id: field.id, type: 'checkbox', checked: Boolean(value), disabled: Boolean(field.readonly),
            onChange: function (e) { set(e.target.checked); } }),
          h('span', { className: 'bw-switch__track' }),
          h('span', { className: 'bw-switch__label' }, value ? 'On' : 'Off'));

      default:
        return h(ComplexControl, { field: field, record: props.record, invalid: props.invalid });
    }
  }
```

- [ ] **Step 2: Add a placeholder for the kinds Task 17 handles**

```js
  function ComplexControl(props) {
    const h = wp().element.createElement;
    return h('input', { id: props.field.id, type: 'text', className: 'bw-input',
      value: props.record.values[props.field.id] || '',
      onChange: function (e) { props.record.setValue(props.field.id, e.target.value); } });
  }
```

- [ ] **Step 3: Syntax-check and re-run the pure tests**

Run:

```bash
node --check .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js && node --test scripts/lib/page-editor.test.mjs
```

Expected: no syntax output, then PASS, 11 tests.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js
git commit -m "Draw the straightforward editor controls"
```

---

### Task 17: The controls that hold state of their own

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`

**Interfaces:**
- Consumes: `Control`'s `default` branch from Task 16.
- Produces: `ComplexControl` handling `richtext`, `tokens`, `repeater`, `media`, `file`, `facts`, `table`; and `Conditional` wrapping dependent fields.

- [ ] **Step 1: Replace the placeholder with the real implementations**

```js
  function ComplexControl(props) {
    const el = wp().element;
    const h = el.createElement;
    const field = props.field;
    const record = props.record;
    const value = record.values[field.id];
    const set = function (v) { record.setValue(field.id, v); };

    switch (field.kind) {
      case 'richtext':
        // A shell, not a document editor: bold, italic, link, list, image and
        // nothing else, so what a site owner can produce stays inside what the
        // front end is built to render.
        return h('div', { className: 'bw-richtext' },
          h('div', { className: 'bw-richtext__bar' },
            ['bold', 'italic'].map(function (cmd) {
              return h('button', { key: cmd, type: 'button', className: 'bw-richtext__btn',
                title: cmd === 'bold' ? 'Bold' : 'Italic',
                onClick: function () { root.document.execCommand(cmd); } }, cmd === 'bold' ? 'B' : 'I');
            }),
            h('span', { className: 'bw-richtext__sep' }),
            ['link', 'list', 'image'].map(function (name) {
              return h('button', { key: name, type: 'button', className: 'bw-richtext__btn', title: name,
                onClick: function () { root.document.execCommand(name === 'list' ? 'insertUnorderedList' : 'createLink'); } },
                h('i', { className: 'bw-icon', 'data-lucide': name === 'link' ? 'external-link' : name === 'list' ? 'file-text' : 'image' }));
            })),
          h('textarea', { id: field.id, className: 'bw-textarea', rows: 6, disabled: Boolean(field.readonly),
            value: value || '', onChange: function (e) { set(e.target.value); } }));

      case 'tokens':
        return h(Tokens, { field: field, value: value || [], onChange: set });

      case 'repeater':
        return h(Repeater, { field: field, value: value || [], onChange: set });

      case 'media':
      case 'file':
        return h('div', { className: field.kind === 'media' ? 'bw-media' : 'bw-upload' },
          value
            ? h('div', { className: 'bw-media__chosen' },
                h('span', null, field.kind === 'media' ? 'Image chosen' : 'File chosen'),
                h('button', { type: 'button', className: 'bw-btn bw-btn--ghost', onClick: function () { set(0); } }, 'Remove'))
            : h('div', { className: 'bw-media__empty' },
                h('p', null, field.help || 'Nothing chosen yet.'),
                h('button', { type: 'button', className: 'bw-btn bw-btn--secondary',
                  onClick: function () { openLibrary(field, set); } },
                  field.kind === 'media' ? 'Choose an image' : 'Choose a file')));

      case 'facts':
        return h('dl', { className: 'bw-dl' }, (field.rows || []).map(function (row) {
          return h(el.Fragment, { key: row.label }, h('dt', null, row.label), h('dd', null, row.value));
        }));

      case 'table':
        return h('div', { className: 'bw-tablewrap' }, h('table', { className: 'bw-table' },
          h('thead', null, h('tr', null, (field.columns || []).map(function (c) { return h('th', { key: c }, c); }))),
          h('tbody', null, (field.rows || []).map(function (row, i) {
            return h('tr', { key: i }, row.map(function (cell, j) { return h('td', { key: j }, cell); }));
          }))));

      default:
        return h('input', { id: field.id, type: 'text', className: 'bw-input',
          value: value || '', onChange: function (e) { set(e.target.value); } });
    }
  }

  function openLibrary(field, set) {
    if (!root.wp || !root.wp.media) return;
    const frame = root.wp.media({ title: field.label, multiple: false });
    frame.on('select', function () { set(frame.state().get('selection').first().id); });
    frame.open();
  }

  function Tokens(props) {
    const el = wp().element;
    const h = el.createElement;
    const [draft, setDraft] = el.useState('');

    function commit() {
      const text = draft.trim();
      if (text === '' || props.value.indexOf(text) !== -1) { setDraft(''); return; }
      props.onChange(props.value.concat([text]));
      setDraft('');
    }

    return h('div', { className: 'bw-tokens' },
      props.value.map(function (token) {
        return h('span', { key: token, className: 'bw-chip' }, token,
          h('button', { type: 'button', className: 'bw-chip__x', 'aria-label': 'Remove ' + token,
            onClick: function () { props.onChange(props.value.filter(function (t) { return t !== token; })); } },
            h('i', { className: 'bw-icon', 'data-lucide': 'x' })));
      }),
      h('input', { type: 'text', className: 'bw-tokens__input', value: draft,
        placeholder: props.value.length ? '' : 'Type and press Enter',
        disabled: Boolean(props.field.readonly),
        onChange: function (e) { setDraft(e.target.value); },
        onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } } }));
  }

  function Repeater(props) {
    const h = wp().element.createElement;
    const rows = props.value;

    function change(index, cellId, cellValue) {
      const next = rows.slice();
      next[index] = Object.assign({}, next[index]);
      next[index][cellId] = cellValue;
      props.onChange(next);
    }

    function move(index, by) {
      const target = index + by;
      if (target < 0 || target >= rows.length) return;
      const next = rows.slice();
      const held = next[index];
      next[index] = next[target];
      next[target] = held;
      props.onChange(next);
    }

    return h('div', { className: 'bw-repeater' },
      rows.length === 0 ? h('div', { className: 'bw-repeater__empty' }, 'No rows yet.') : null,
      rows.map(function (row, i) {
        return h('div', { key: i, className: 'bw-repeater__row' },
          // Dragging is a nice-to-have; these two buttons are how a reorder is
          // actually done, so it works from the keyboard like everything else.
          h('span', { className: 'bw-repeater__grip' },
            h('button', { type: 'button', className: 'bw-iconbtn', 'aria-label': 'Move up', onClick: function () { move(i, -1); } },
              h('i', { className: 'bw-icon', 'data-lucide': 'chevron-up' })),
            h('button', { type: 'button', className: 'bw-iconbtn', 'aria-label': 'Move down', onClick: function () { move(i, 1); } },
              h('i', { className: 'bw-icon', 'data-lucide': 'chevron-down' }))),
          h('div', { className: 'bw-repeater__fields' }, (props.field.fields || []).map(function (cell) {
            return h('div', { key: cell.id, className: 'bw-field' },
              h('label', { className: 'bw-field__label', htmlFor: cell.id + '-' + i }, cell.label),
              h('input', { id: cell.id + '-' + i, type: cell.kind === 'number' ? 'number' : 'text',
                className: 'bw-input', value: row[cell.id] === undefined ? '' : row[cell.id],
                onChange: function (e) { change(i, cell.id, e.target.value); } }));
          })),
          h('button', { type: 'button', className: 'bw-iconbtn bw-iconbtn--danger', 'aria-label': 'Remove this row',
            onClick: function () { props.onChange(rows.filter(function (_, j) { return j !== i; })); } },
            h('i', { className: 'bw-icon', 'data-lucide': 'trash-2' })));
      }),
      h('div', { className: 'bw-repeater__foot' },
        h('button', { type: 'button', className: 'bw-btn bw-btn--secondary',
          onClick: function () { props.onChange(rows.concat([{}])); } }, 'Add a row')));
  }
```

- [ ] **Step 2: Wrap dependent fields so the dependency is visible**

In `Panel`, replace the field map so a dependent field is drawn inside `bw-conditional` with the dependency stated:

```js
          : h('div', { className: 'bw-fields' }, fields.map(function (field) {
              const drawn = h(Field, { key: field.id, field: field, record: props.record });
              if (!field.depends_on) return drawn;
              const on = (panel.fields || []).find(function (f) { return f.id === field.depends_on.field; });
              return h('div', { key: field.id, className: 'bw-conditional bw-field--wide' },
                h('p', { className: 'bw-fieldnote' },
                  h('i', { className: 'bw-icon', 'data-lucide': 'info' }),
                  'Shown because "' + (on ? on.label : field.depends_on.field) + '" is on.'),
                drawn);
            }))
```

- [ ] **Step 3: Syntax-check and re-run the pure tests**

Run:

```bash
node --check .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js && node --test scripts/lib/page-editor.test.mjs
```

Expected: no syntax output, then PASS, 11 tests.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js
git commit -m "Draw the repeating, token, media and dependent-field controls"
```

---

### Task 18: Mount it

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js`

- [ ] **Step 1: Add the bootstrap, last in the file, behind a browser guard**

Immediately before the `module.exports` block:

```js
  /* --- Bootstrap ----------------------------------------------------------- */
  /* Guarded so this same file loads cleanly under node --test, which has no
     window and no wp. */

  if (typeof window !== 'undefined' && window.wp && window.wp.element && window.document) {
    window.document.addEventListener('DOMContentLoaded', function () {
      const mount = window.document.getElementById('bw-page-editor');
      if (!mount) return;
      const props = { slug: mount.getAttribute('data-screen'), id: Number(mount.getAttribute('data-record') || 0) };
      const el = window.wp.element;
      if (el.createRoot) {
        el.createRoot(mount).render(el.createElement(Editor, props));
      } else {
        el.render(el.createElement(Editor, props), mount);
      }
      if (window.lucide) window.lucide.createIcons();
    });
  }
```

- [ ] **Step 2: Confirm the file still loads in Node**

Run: `node --test scripts/lib/page-editor.test.mjs`
Expected: PASS, 11 tests. A failure here means the guard is wrong and the file is touching `window` at load.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js
git commit -m "Mount the editor onto its admin screen"
```

---

# Stage D — Proof

### Task 19: A worked example screen

The example is the reference plugins copy from, so it is written the way a plugin should write one — a schema and nothing else.

**Files:**
- Create: `.wp-test/example-plugin/blueworx-editor-example.php`
- Create: `.wp-test/example-plugin/blueworx-page-editor/` (copy of the library)
- Create: `.wp-test/example-plugin/assets/blueworx-page-editor.js` (copy)
- Create: `.wp-test/example-plugin/assets/blueworx-admin-design.css` (copy)

- [ ] **Step 1: Write the example plugin**

Create `.wp-test/example-plugin/blueworx-editor-example.php`:

```php
<?php
/**
 * Plugin Name: BlueWorx editor example
 * Description: The worked page editor screen the foundation tests against, and the shape a plugin copies.
 * Version: 0.1.0
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/blueworx-page-editor/blueworx-page-editor.php';

add_action( 'init', function () {
	register_post_type( 'bwx_sport', [
		'label'        => 'Sports',
		'public'       => false,
		'show_ui'      => true,
		'supports'     => [ 'title', 'excerpt', 'revisions' ],
		'show_in_rest' => true,
	] );
} );

add_action( 'plugins_loaded', function () {
	\Blueworx\PageEditor\v1\Editor::register( [
		'slug'       => 'bwx-sport-editor',
		'title'      => 'Edit sport',
		'eyebrow'    => 'Collections · Sports',
		'lede'       => 'One tab per area of the sport page. Nothing changes on the site until you save.',
		'post_type'  => 'bwx_sport',
		'capability' => 'manage_options',
		'tabs'       => [
			[
				'id'     => 'content',
				'label'  => 'Content',
				'panels' => [
					[
						'id'      => 'basics',
						'eyebrow' => 'Details · Section',
						'title'   => 'Basics',
						'note'    => 'What this sport is called and how it is described.',
						'fields'  => [
							[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name', 'required' => true, 'help' => 'Shown as the heading on the sport page.' ],
							[ 'id' => 'short_label', 'kind' => 'text', 'label' => 'Short label', 'max_length' => 12, 'help' => 'Used where space is tight, like the menu.' ],
							[ 'id' => 'contact', 'kind' => 'text', 'label' => 'Contact email', 'format' => 'email' ],
							[ 'id' => 'age_groups', 'kind' => 'tokens', 'label' => 'Age groups', 'help' => 'Press Enter after each one.' ],
							[ 'id' => 'description', 'kind' => 'richtext', 'label' => 'Description' ],
						],
					],
					[
						'id'       => 'schedule',
						'eyebrow'  => 'Details · Section',
						'title'    => 'Training times',
						'note'     => 'Each row appears as a session on the sport page.',
						'hideable' => true,
						'fields'   => [
							[ 'id' => 'sessions', 'kind' => 'repeater', 'label' => 'Sessions', 'fields' => [
								[ 'id' => 'day', 'kind' => 'text', 'label' => 'Day' ],
								[ 'id' => 'venue', 'kind' => 'text', 'label' => 'Venue' ],
							] ],
						],
					],
				],
			],
		],
	] );
} );
```

- [ ] **Step 2: Copy the library and assets in, the way a plugin does**

```bash
cd .wp-test/example-plugin
cp -R ../../.claude/skills/blueworx-admin-design/editor/php blueworx-page-editor
mkdir -p assets
cp ../../.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js assets/
cp ../../.claude/skills/blueworx-admin-design/styles.css assets/blueworx-admin-design.css
mkdir -p assets/fonts && cp ../../.claude/skills/blueworx-admin-design/fonts/* assets/fonts/
cp ../../.claude/skills/blueworx-admin-design/assets/icons/lucide-icons.js assets/blueworx-admin-icons.js
```

- [ ] **Step 3: Start the harness and open the screen by hand once**

Run:

```bash
node scripts/wp-test-env.mjs start
```

Activate "BlueWorx editor example", create a sport, open the editor, and confirm: the page header, the two tabs with counts, the panels, and the save bar reading "Everything is saved."

- [ ] **Step 4: Commit**

```bash
git add .wp-test/example-plugin
git commit -m "Add the worked example editor screen the tests drive"
```

---

### Task 20: The end-to-end pass

**Files:**
- Create: `.wp-test/tests/page-editor.spec.js`

- [ ] **Step 1: Write the tests**

Create `.wp-test/tests/page-editor.spec.js`:

```js
const { test, expect } = require('@playwright/test');

const SCREEN = '/wp-admin/admin.php?page=bwx-sport-editor&id=1';

test.beforeEach(async ({ page }) => {
  await page.goto(SCREEN);
});

test('the screen opens clean, with one save bar', async ({ page }) => {
  await expect(page.locator('.bw-savebar')).toHaveCount(1);
  await expect(page.locator('.bw-savebar__hint')).toContainText('Everything is saved.');
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeDisabled();
});

test('changing a field wakes the save bar and names the tab', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await expect(page.locator('.bw-savebar__hint')).toContainText('Content');
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
});

test('switching tab keeps the change and does not save', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.getByRole('tab', { name: /Publish & settings/ }).click();
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
  await page.getByRole('tab', { name: /Content/ }).click();
  await expect(page.locator('#name')).toHaveValue('Rugby');
});

test('an invalid save writes nothing and says where to look', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.fill('#contact', 'dan');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--danger')).toContainText('Nothing was saved');
  await expect(page.locator('.bw-field__error')).toContainText('domain');

  await page.reload();
  await expect(page.locator('#name')).not.toHaveValue('Rugby');
});

test('a valid save writes and the screen goes clean', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.fill('#contact', 'dan@coastalbloom.co');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--success')).toBeVisible();
  await expect(page.locator('.bw-savebar__hint')).toContainText('Everything is saved.');

  await page.reload();
  await expect(page.locator('#name')).toHaveValue('Rugby');
});

test('a dependent field appears only while its condition holds', async ({ page }) => {
  await expect(page.locator('.bw-conditional')).toHaveCount(0);
  await page.locator('.bw-card:has-text("Training times") .bw-switch input').uncheck();
  await expect(page.locator('.bw-switch__label')).toContainText('Hidden');
});

test('a repeater row can be added, reordered and removed from the keyboard', async ({ page }) => {
  await page.click('text=Add a row');
  await page.fill('#day-0', 'Monday');
  await page.click('text=Add a row');
  await page.fill('#day-1', 'Tuesday');

  await page.locator('[aria-label="Move up"]').nth(1).click();
  await expect(page.locator('#day-0')).toHaveValue('Tuesday');

  await page.locator('[aria-label="Remove this row"]').first().click();
  await expect(page.locator('#day-0')).toHaveValue('Monday');
});
```

- [ ] **Step 2: Run them**

Run:

```bash
npx playwright test .wp-test/tests/page-editor.spec.js
```

Expected: PASS, 7 tests. Fix the implementation, not the test, for anything that fails.

- [ ] **Step 3: Commit**

```bash
git add .wp-test/tests/page-editor.spec.js
git commit -m "Drive the example editor end to end"
```

---

# Stage E — Enforcement and the written standard

### Task 21: The two new copied paths are hash-checked

**Files:**
- Modify: `scripts/lib/checks.mjs:394-494`
- Modify: `scripts/check-design-system-sync.mjs`
- Modify: `.github/workflows/ci-wordpress.yml`
- Test: `scripts/lib/checks.test.mjs`

**Interfaces:**
- Consumes: `designSystemSync({ … })` as it stands.
- Produces: four new named parameters — `canonicalEditorPhp`, `shippedEditorPhp` (both `Map` or null), `canonicalEditorJs`, `shippedEditorJs` (both string or null) — plus `editorPhpPath` (default `blueworx-page-editor`) and `editorJsPath` (default `assets/blueworx-page-editor.js`).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/checks.test.mjs`:

```js
test('designSystemSync: a drifted editor library is a problem', () => {
  const result = designSystemSync({
    foundationFiles: new Map([['styles.css', 'a']]),
    pluginFiles: new Map([['styles.css', 'a']]),
    canonicalCss: 'a',
    shippedCss: 'a',
    canonicalEditorPhp: new Map([['v1/Editor.php', 'x']]),
    shippedEditorPhp: new Map([['v1/Editor.php', 'y']]),
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('v1/Editor.php')));
});

test('designSystemSync: a missing editor script is a problem', () => {
  const result = designSystemSync({
    foundationFiles: new Map([['styles.css', 'a']]),
    pluginFiles: new Map([['styles.css', 'a']]),
    canonicalCss: 'a',
    shippedCss: 'a',
    canonicalEditorJs: 'x',
    shippedEditorJs: null,
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('assets/blueworx-page-editor.js')));
});

test('designSystemSync: a plugin with no editor library is left alone', () => {
  const result = designSystemSync({
    foundationFiles: new Map([['styles.css', 'a']]),
    pluginFiles: new Map([['styles.css', 'a']]),
    canonicalCss: 'a',
    shippedCss: 'a',
    canonicalEditorPhp: new Map([['v1/Editor.php', 'x']]),
    shippedEditorPhp: null,
    canonicalEditorJs: 'x',
    shippedEditorJs: null,
  });
  assert.equal(result.problems.filter((p) => p.includes('blueworx-page-editor')).length, 1,
    'a plugin that has not adopted the editor is not failed for the PHP folder it does not carry');
});
```

The third test states the rule deliberately: a plugin only carries the library once it has an editor screen. The folder being absent is adoption, not drift — but the **script** is checked whenever the foundation has one, matching how icons already behave.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: FAIL on all three.

- [ ] **Step 3: Implement**

In `scripts/lib/checks.mjs`, add the parameters to the `designSystemSync` signature:

```js
  canonicalEditorPhp = null,
  shippedEditorPhp = null,
  canonicalEditorJs = null,
  shippedEditorJs = null,
  editorPhpPath = 'blueworx-page-editor',
  editorJsPath = 'assets/blueworx-page-editor.js',
```

And insert this block after the icons block, before `if ( problems.length === 0 )`:

```js
  // The page editor library. A plugin only carries it once it has an editor
  // screen, so an absent folder is adoption, not drift — but a folder that is
  // present must match, file for file, or two plugins on one site disagree
  // about what an editor is.
  if ( canonicalEditorPhp !== null && shippedEditorPhp !== null ) {
    for ( const [ name, want ] of [ ...canonicalEditorPhp.entries() ].sort() ) {
      const got = shippedEditorPhp.get( name );
      if ( got === undefined ) problems.push( `${editorPhpPath}/${name} — missing from this plugin` );
      else if ( got !== want ) problems.push( `${editorPhpPath}/${name} — differs from the page editor library` );
    }
    for ( const name of [ ...shippedEditorPhp.keys() ].sort() ) {
      if ( ! canonicalEditorPhp.has( name ) ) problems.push( `${editorPhpPath}/${name} — not part of the page editor library; delete it` );
    }
    if ( canonicalEditorJs !== null && shippedEditorJs !== canonicalEditorJs ) {
      problems.push( `${editorJsPath} — ${shippedEditorJs === null ? 'missing; the editor screen loads it' : 'differs from the page editor library'}` );
    }
  }
```

Add the two copy lines to the printed fix, after the icons line:

```js
    `  [ -d ${editorPhpPath} ] && cp -R ${skillPath}/editor/php/. ${editorPhpPath}/`,
    `  [ -d ${editorPhpPath} ] && cp ${skillPath}/editor/blueworx-page-editor.js ${editorJsPath}`,
```

In `scripts/check-design-system-sync.mjs`, read and pass them:

```js
const editorPhpPath = process.env.EDITOR_PHP_PATH || 'blueworx-page-editor';
const editorJsPath = process.env.EDITOR_JS_PATH || 'assets/blueworx-page-editor.js';
```

```js
  canonicalEditorPhp: hashTree(join(foundationDir, skillPath, 'editor/php')),
  shippedEditorPhp: hashTree(editorPhpPath),
  canonicalEditorJs: hashFile(join(foundationDir, skillPath, 'editor/blueworx-page-editor.js')),
  shippedEditorJs: hashFile(editorJsPath),
  editorPhpPath,
  editorJsPath,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/checks.mjs scripts/check-design-system-sync.mjs scripts/lib/checks.test.mjs
git commit -m "Hash-check a plugin's copy of the page editor library"
```

---

### Task 22: Hand-written editor markup is refused

**Files:**
- Modify: `scripts/lib/admin-ui.mjs:163-250`
- Test: `scripts/lib/admin-ui.test.mjs`

**Interfaces:**
- Consumes: `findViolations({ path, kind, content, vocab, whole })`.
- Produces: a new rule id, `hand-written-editor`, at severity `warn`.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/admin-ui.test.mjs`:

```js
const vocab = { classes: new Set(['bw-tabs', 'bw-savebar', 'bw-card', 'bw-input']), tokens: new Set(), components: new Set() };

test('findViolations: tabs plus a save bar in a plugin is a hand-written editor', () => {
  const problems = findViolations({
    path: 'includes/admin/class-sport-editor.php',
    kind: 'php',
    content: [
      '<div class="bw-tabs"><button class="bw-tab">Content</button></div>',
      '<div class="bw-savebar"><button class="bw-btn">Save changes</button></div>',
    ].join('\n'),
    vocab,
  });
  const found = problems.filter((p) => p.rule === 'hand-written-editor');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warn');
  assert.match(found[0].message, /page editor library/);
});

test('findViolations: a settings screen with a save bar and no tabs is left alone', () => {
  const problems = findViolations({
    path: 'includes/admin/class-settings.php',
    kind: 'php',
    content: '<div class="bw-savebar"><button class="bw-btn">Save changes</button></div>',
    vocab,
  });
  assert.equal(problems.filter((p) => p.rule === 'hand-written-editor').length, 0);
});

test('findViolations: the rule never fires on an edit fragment', () => {
  const problems = findViolations({
    path: 'includes/admin/class-sport-editor.php',
    kind: 'php',
    content: '<div class="bw-tabs"></div><div class="bw-savebar"></div>',
    vocab,
    whole: false,
  });
  assert.equal(problems.filter((p) => p.rule === 'hand-written-editor').length, 0);
});

test('findViolations: the library itself is not a consumer of itself', () => {
  const problems = findViolations({
    path: 'blueworx-page-editor/v1/Screen.php',
    kind: 'php',
    content: '<div class="bw-tabs"></div><div class="bw-savebar"></div>',
    vocab,
  });
  assert.equal(problems.filter((p) => p.rule === 'hand-written-editor').length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/admin-ui.test.mjs`
Expected: FAIL — no `hand-written-editor` problems are produced.

- [ ] **Step 3: Implement**

In `scripts/lib/admin-ui.mjs`, add near the other constants:

```js
const EDITOR_LIB_DIR = 'blueworx-page-editor/';
```

And add this block beside the existing whole-file `no-bw-class` rule, before `return problems;`:

```js
  // Tabs and a save bar on the same screen is an editor, and editors come from
  // the page editor library — one shell, one save model, one set of controls.
  // A save bar on its own is an ordinary settings screen and is left alone.
  //
  // Whole files only: an edit fragment carrying one of the two says nothing
  // about what the finished file holds. A warning for its first release, until
  // it has proved itself against screens that predate the library.
  if (
    whole &&
    kind !== 'css' &&
    ! p.includes( EDITOR_LIB_DIR ) &&
    /class(?:Name)?\s*=\s*["'][^"']*\bbw-tabs\b/.test( content ) &&
    /class(?:Name)?\s*=\s*["'][^"']*\bbw-savebar\b/.test( content )
  ) {
    add( 0, 'hand-written-editor', 'warn', 'You have hand-written an editor screen — tabs and a save bar together are an editor, and those come from the page editor library. Declare the screen as a field schema and let the library render it.' );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/admin-ui.test.mjs scripts/lib/checks.test.mjs .claude/hooks/admin-ui-adherence.test.mjs`
Expected: PASS across all three files.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/admin-ui.mjs scripts/lib/admin-ui.test.mjs
git commit -m "Warn when an editor screen is hand-written rather than declared"
```

---

### Task 23: Write the standard down where new projects inherit it

**Files:**
- Modify: `CLAUDE.md.template:90-101`
- Modify: `docs/starter-prompt-wordpress-plugin.md:77-96`
- Modify: `README.md`

- [ ] **Step 1: Add the rule to the template**

In `CLAUDE.md.template`, append to the "WordPress admin screens come from the design system" section:

```markdown
- **Custom editor screens come from the page editor library, and records are post types.** Any screen where a site owner edits a record or a set of page content is declared as a field schema and rendered by the library in `editor/` inside the design system skill — never hand-written. The plugin copies `editor/php/` to `blueworx-page-editor/` and `editor/blueworx-page-editor.js` to `assets/blueworx-page-editor.js`, and CI hash-checks both. The shell is fixed: page header, tabs, panels, one save bar, whatever the tab. The control list is closed; a control the design system does not have is added to the design system first. Anything record-like is a registered WordPress post type, so it gets revisions, capabilities and REST for free — the library refuses to open a record editor whose post type nobody registered. Only genuine site settings or plugin configuration store to options.
```

- [ ] **Step 2: Add it to the starter prompt**

In `docs/starter-prompt-wordpress-plugin.md`, after the admin screens bullet:

```markdown
- **Any screen where somebody edits content is a page editor screen.** Copy the design system's
  `editor/php/` to `blueworx-page-editor/` and `editor/blueworx-page-editor.js` to
  `assets/blueworx-page-editor.js`, require the loader from the main plugin file, and register the
  screen as a field schema — tabs, panels, fields, which capability each needs, and whether it stores
  to a post type or to options. Do not write the markup, the save handler, the dirty tracking or the
  JavaScript: the library owns all of it, so every plugin's editor behaves the same way. Anything
  record-like must be a registered post type; the library will not open a record editor without one.
  CI hash-checks both copies and warns on a hand-written editor screen.
```

- [ ] **Step 3: Note it in the README**

In `README.md`, in the paragraph naming the design system as the one shared design exception, add a sentence:

```markdown
That system also carries the **page editor** — the shared shell and behaviour for any screen where a
site owner edits content, so every plugin's editing experience is the same one.
```

- [ ] **Step 4: Confirm the whole suite is green**

Run:

```bash
for f in scripts/*.mjs scripts/lib/*.mjs .claude/hooks/*.mjs .claude/skills/blueworx-admin-design/editor/*.js; do node --check "$f"; done
node --test scripts/lib/*.test.mjs .claude/hooks/*.test.mjs
vendor/bin/phpunit
```

Expected: no syntax output; all Node tests pass; all PHPUnit tests pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md.template docs/starter-prompt-wordpress-plugin.md README.md
git commit -m "Write the page editor standard into the template and the starter prompt"
```

---

## After the plan

- The `hand-written-editor` rule is a **warning** on purpose. After one release, look at what it caught across the plugin repos and flip it to `error` in `scripts/lib/admin-ui.mjs`. That is a one-word change and its own small pull request.
- Nothing here migrates an existing screen. The first plugin to build a new editor is the first consumer; existing screens are left until someone touches them.
