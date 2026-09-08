# Design System: One Copy, Newest Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When two BlueWorx plugins are active on one site, exactly one copy of the admin design system loads — the newest version present — instead of whichever plugin happened to claim the shared `blueworx-admin-design` handle first.

**Architecture:** The design system gains a tiny PHP registrar shipped beside its stylesheet. Every plugin's copy registers its own version into a global on load; the first caller to ask for an enqueue resolves the highest version and enqueues that copy alone. This is the same "highest version on the site wins, loaded once" rule the page editor library already uses in `Registry.php`, applied to the stylesheet. Because the registrar sits next to the CSS it describes, it derives its own asset URL from `__FILE__` and never guesses at directory depth.

**Tech Stack:** PHP 7.4+ (the floor foundation CI syntax-checks the library at), WordPress enqueue API, Node 20+ for the CI check scripts, PHPUnit 9 with the repo's own WordPress stubs, `node --test` for the check-script unit tests.

**Spec:** This plan is the spec. It follows the live diagnosis recorded on 2026-09-07: on blueworx.io the deck editor's only `blueworx-admin-design` stylesheet came from `plugins/blueworx-labs-wordpress/assets/blueworx-admin-design.css?ver=1.81.1-…`, and the Deck Builder's own copy — the one carrying `.bw-repeater__fields{flex-direction:column}` — was absent from the page entirely, because WordPress keeps the first registration of a style handle and silently drops the rest.

## Global Constraints

- **The foundation is the source.** Every file under `.claude/skills/blueworx-admin-design/` is copied verbatim into plugins and hash-checked by CI. Never edit a plugin's copy; change the foundation and re-pull.
- **PHP floor is 7.4.** `foundation-ci.yml` syntax-checks `editor/php` with PHP 7.4. No typed properties on classes, no arrow-function-only syntax, no union types, no `match`. Constructor promotion is out.
- **WordPress floor is 4.1 for anything the registrar calls.** The library already refuses to assume 6.5 (see the `wp_enqueue_script_module` comment in `Screen.php`). `wp_enqueue_style`, `wp_add_inline_style`, `wp_style_is` and `plugin_dir_url` are all safe.
- **The stylesheet is copied byte for byte.** `check-design-system-sync.mjs` compares `assets/blueworx-admin-design.css` against `.claude/skills/blueworx-admin-design/styles.css` with a hash. Any new shipped file must be added to that comparison or it can drift unnoticed.
- **One handle name stays.** The enqueued handle remains `blueworx-admin-design`. Renaming it per plugin is the approach this plan explicitly rejects: two copies of a stylesheet scoped to the same `.bw-admin` wrapper leave the cascade to decide, which is not a decision anyone made.
- **Design system version format is `MAJOR.MINOR.PATCH`,** compared with PHP's `version_compare` and JS `semver.mjs`. It starts at `1.0.0`.
- **Communication rules apply to commits and PRs:** one plain line saying what changed; a PR description says what it does and anything to decide. No walkthroughs.

---

## File Structure

**Foundation — new:**
- `.claude/skills/blueworx-admin-design/design-system.php` — the registrar. Plugins copy it to `assets/blueworx-admin-design.php`, beside the stylesheet. Holds the design system version, collects every copy on the site, resolves the winner, enqueues it once.
- `tests/php/DesignSystemTest.php` — PHPUnit cover for the registrar.
- `scripts/check-design-system-version.mjs` — foundation-only CI guard: if `styles.css` changed in this PR, the version in `design-system.php` must have changed too.
- `scripts/lib/design-system-version.mjs` — the pure comparison that check calls.
- `scripts/lib/design-system-version.test.mjs` — its unit tests.

**Foundation — modified:**
- `.claude/skills/blueworx-admin-design/editor/php/v1/Screen.php` — stops calling `wp_enqueue_style` itself and asks the registrar instead.
- `.claude/skills/blueworx-admin-design/readme.md` — the copy-paste enqueue recipe becomes the registrar call.
- `.claude/skills/blueworx-admin-design/SKILL.md` — the ship list gains the fourth file.
- `scripts/lib/checks.mjs` — `designSystemSync()` gains the registrar file.
- `scripts/lib/checks.test.mjs` — cover for that.
- `scripts/check-design-system-sync.mjs` — passes the new paths in.
- `tests/php/WordPressStubs.php` — gains enqueue stubs.
- `.github/workflows/foundation-ci.yml` — runs the new version guard.
- `CLAUDE.md.template` — the ship list paragraph.

**Deck Builder (`blueworx_labs_deck-builder`) — modified:**
- `assets/blueworx-admin-design.php` (new, copied), `blueworx-page-editor/v1/Screen.php` (re-pulled), `.claude/skills/blueworx-admin-design/` (re-pulled), `includes/class-blueworx-deck-builder-admin.php`, `blueworx-labs-deck-builder.php` (version), `package.json`, `CHANGELOG.md`, `bin/build-zip.sh` (allowlist already covers `assets/`, verify only), one Playwright test.

**Enhancements (`blueworx_labs_wordpress`) — modified:**
- `assets/blueworx-admin-design.php` (new, copied), `.claude/skills/blueworx-admin-design/` (re-pulled), `includes/admin-assets.php`, plugin header version, `package.json`, `CHANGELOG.md`.

---

### Task 1: The registrar, and the stubs it needs

**Files:**
- Create: `.claude/skills/blueworx-admin-design/design-system.php`
- Create: `tests/php/DesignSystemTest.php`
- Modify: `tests/php/WordPressStubs.php`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all in the global namespace (the file is plain procedural PHP, not namespaced, because plugins that do not vendor the page editor library have no autoloader for it):
  - `blueworx_admin_design_register( string $version, string $file ): void` — records one copy. Called at the bottom of every copy of the file with its own version and `__FILE__`.
  - `blueworx_admin_design_winner(): array` — `[ 'version' => string, 'file' => string ]` for the highest version registered, or `[ 'version' => '', 'file' => '' ]` when none.
  - `blueworx_admin_design_version(): string`
  - `blueworx_admin_design_url(): string` — the winning copy's `assets/` URL, trailing slash included.
  - `blueworx_admin_design_enqueue(): void` — enqueues the winning stylesheet under handle `blueworx-admin-design`, at the winning version. Safe to call from any number of plugins on any number of screens.
  - `blueworx_admin_design_enqueue_icons(): void` — same treatment for `blueworx-admin-icons.js` under handle `blueworx-admin-design-icons`, printed with `type="module"`.

- [ ] **Step 1: Write the failing test**

Create `tests/php/DesignSystemTest.php`:

```php
<?php
use PHPUnit\Framework\TestCase;

final class DesignSystemTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		$GLOBALS['blueworx_admin_design_copies'] = [];
	}

	public function test_highest_version_wins_regardless_of_registration_order() {
		blueworx_admin_design_register( '1.2.0', '/plugins/older/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '2.0.1', '/plugins/newer/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '1.10.0', '/plugins/middle/assets/blueworx-admin-design.php' );

		$this->assertSame( '2.0.1', blueworx_admin_design_version() );
		$this->assertSame( '/plugins/newer/assets/blueworx-admin-design.php', blueworx_admin_design_winner()['file'] );
	}

	public function test_ten_sorts_above_nine_not_alphabetically() {
		blueworx_admin_design_register( '1.9.0', '/plugins/a/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '1.10.0', '/plugins/b/assets/blueworx-admin-design.php' );

		$this->assertSame( '1.10.0', blueworx_admin_design_version() );
	}

	public function test_enqueues_the_winning_copy_once_under_the_shared_handle() {
		blueworx_admin_design_register( '1.0.0', '/plugins/older/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '2.0.0', '/plugins/newer/assets/blueworx-admin-design.php' );

		blueworx_admin_design_enqueue();
		blueworx_admin_design_enqueue();

		$styles = $GLOBALS['bwpe_stub_styles'];
		$this->assertCount( 1, $styles );
		$this->assertSame( 'blueworx-admin-design', $styles[0]['handle'] );
		$this->assertSame( 'https://example.test/plugins/newer/assets/blueworx-admin-design.css', $styles[0]['src'] );
		$this->assertSame( '2.0.0', $styles[0]['ver'] );
	}

	public function test_no_copies_registered_enqueues_nothing() {
		blueworx_admin_design_enqueue();

		$this->assertSame( [], $GLOBALS['bwpe_stub_styles'] );
		$this->assertSame( '', blueworx_admin_design_version() );
	}

	public function test_icons_module_is_enqueued_from_the_same_winning_copy() {
		blueworx_admin_design_register( '2.0.0', '/plugins/newer/assets/blueworx-admin-design.php' );

		blueworx_admin_design_enqueue_icons();

		$scripts = $GLOBALS['bwpe_stub_scripts'];
		$this->assertCount( 1, $scripts );
		$this->assertSame( 'blueworx-admin-design-icons', $scripts[0]['handle'] );
		$this->assertSame( 'https://example.test/plugins/newer/assets/blueworx-admin-icons.js', $scripts[0]['src'] );
	}

	public function test_a_copy_registering_twice_is_recorded_once() {
		blueworx_admin_design_register( '1.0.0', '/plugins/a/assets/blueworx-admin-design.php' );
		blueworx_admin_design_register( '1.0.0', '/plugins/a/assets/blueworx-admin-design.php' );

		$this->assertCount( 1, $GLOBALS['blueworx_admin_design_copies'] );
	}
}
```

Add to `tests/php/WordPressStubs.php` — inside the existing `if ( ! function_exists( … ) )` style the file already uses, and reset the three new globals from `bwpe_stub_reset()`:

```php
// Enqueue recording. The design system registrar is the only thing under test
// that enqueues, and what matters is which copy won — so these record rather
// than emulate WordPress's dependency resolution.
if ( ! function_exists( 'wp_enqueue_style' ) ) {
	function wp_enqueue_style( $handle, $src = '', $deps = [], $ver = false, $media = 'all' ) {
		$GLOBALS['bwpe_stub_styles'][] = [ 'handle' => $handle, 'src' => $src, 'ver' => $ver ];
	}
}

if ( ! function_exists( 'wp_enqueue_script' ) ) {
	function wp_enqueue_script( $handle, $src = '', $deps = [], $ver = false, $in_footer = false ) {
		$GLOBALS['bwpe_stub_scripts'][] = [ 'handle' => $handle, 'src' => $src, 'ver' => $ver ];
	}
}

if ( ! function_exists( 'wp_add_inline_style' ) ) {
	function wp_add_inline_style( $handle, $css ) {
		$GLOBALS['bwpe_stub_inline_styles'][] = [ 'handle' => $handle, 'css' => $css ];
		return true;
	}
}

if ( ! function_exists( 'add_filter' ) ) {
	function add_filter( $hook, $callback, $priority = 10, $args = 1 ) {
		return true;
	}
}

// plugin_dir_url() maps a file path to the URL of the directory holding it.
// The stub keeps the path so a test can assert which plugin's copy won.
if ( ! function_exists( 'plugin_dir_url' ) ) {
	function plugin_dir_url( $file ) {
		return 'https://example.test' . rtrim( str_replace( '\\', '/', dirname( $file ) ), '/' ) . '/';
	}
}
```

And in `bwpe_stub_reset()`:

```php
	$GLOBALS['bwpe_stub_styles']        = [];
	$GLOBALS['bwpe_stub_scripts']       = [];
	$GLOBALS['bwpe_stub_inline_styles'] = [];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit --filter DesignSystemTest`
Expected: FAIL — `Error: Call to undefined function blueworx_admin_design_register()`.

- [ ] **Step 3: Write minimal implementation**

Create `.claude/skills/blueworx-admin-design/design-system.php`:

```php
<?php
/**
 * The BlueWorx admin design system: which copy of it actually loads.
 *
 * Plugins copy this file to assets/blueworx-admin-design.php, beside the
 * stylesheet it enqueues, and it works out its own URL from there — no guessing
 * at directory depth, no constant for the plugin to define.
 *
 * WHY THIS EXISTS
 * Every BlueWorx plugin ships its own copy of the design system, deliberately:
 * there is no shared runtime package, because two plugins on one site can be
 * built against different versions of it. But they all enqueue under one handle
 * and all style the same .bw-admin wrapper, so on a site with two of them
 * WordPress kept whichever registered first and silently dropped the rest —
 * which meant a plugin's screens could be styled by another plugin's older
 * stylesheet, with no error anywhere. Cascade order, not intent, decided how
 * the admin looked.
 *
 * WHAT IT DOES INSTEAD
 * Every copy on the site announces its version here. The highest version wins
 * and is the only one enqueued, exactly as blueworx-page-editor/Registry.php
 * already picks the one copy of the editor library that runs. One download, one
 * winner, and the same winner no matter what order plugins happen to load in.
 *
 * BUMPING THE VERSION
 * The constant below travels with styles.css: change the stylesheet in the
 * foundation and this moves too, or an older copy elsewhere keeps winning.
 * scripts/check-design-system-version.mjs fails the foundation's own CI if a PR
 * touches one without the other.
 *
 * @package BlueWorx\AdminDesign
 */

// Guard the behaviour, not the registration. Each plugin ships its own copy of
// this file, so the function bodies must be declared once — but every copy still
// has to announce itself, or the winner is decided by whichever plugin loaded
// first, which is the bug this file exists to remove.
if ( ! function_exists( 'blueworx_admin_design_register' ) ) {

	/**
	 * Records one copy of the design system present on this site.
	 *
	 * @param string $version The design system version that copy carries.
	 * @param string $file    That copy's own __FILE__.
	 * @return void
	 */
	function blueworx_admin_design_register( $version, $file ) {
		if ( ! isset( $GLOBALS['blueworx_admin_design_copies'] ) || ! is_array( $GLOBALS['blueworx_admin_design_copies'] ) ) {
			$GLOBALS['blueworx_admin_design_copies'] = [];
		}
		// Keyed by file, so a plugin loaded twice in one request (a test
		// harness, a mu-plugin mirror) counts once rather than skewing nothing
		// in particular.
		$GLOBALS['blueworx_admin_design_copies'][ $file ] = (string) $version;
	}

	/**
	 * The copy that wins: the highest version registered.
	 *
	 * @return array{version:string,file:string}
	 */
	function blueworx_admin_design_winner() {
		$copies = isset( $GLOBALS['blueworx_admin_design_copies'] ) ? $GLOBALS['blueworx_admin_design_copies'] : [];
		$best   = [ 'version' => '', 'file' => '' ];
		foreach ( $copies as $file => $version ) {
			if ( '' === $best['version'] || version_compare( $version, $best['version'], '>' ) ) {
				$best = [ 'version' => $version, 'file' => $file ];
			}
		}
		return $best;
	}

	/**
	 * The winning copy's version, or '' when no copy registered.
	 *
	 * @return string
	 */
	function blueworx_admin_design_version() {
		$winner = blueworx_admin_design_winner();
		return $winner['version'];
	}

	/**
	 * The winning copy's assets directory URL, trailing slash included.
	 *
	 * @return string
	 */
	function blueworx_admin_design_url() {
		$winner = blueworx_admin_design_winner();
		if ( '' === $winner['file'] ) {
			return '';
		}
		return plugin_dir_url( $winner['file'] );
	}

	/**
	 * Enqueues the winning stylesheet, once, however many plugins ask for it.
	 *
	 * @return void
	 */
	function blueworx_admin_design_enqueue() {
		$winner = blueworx_admin_design_winner();
		if ( '' === $winner['file'] ) {
			return;
		}
		if ( ! empty( $GLOBALS['blueworx_admin_design_enqueued'] ) ) {
			return;
		}
		$GLOBALS['blueworx_admin_design_enqueued'] = true;

		wp_enqueue_style(
			'blueworx-admin-design',
			blueworx_admin_design_url() . 'blueworx-admin-design.css',
			[],
			$winner['version']
		);
	}

	/**
	 * Enqueues the winning copy's icon module, once.
	 *
	 * The system's icons are inlined by this module: every <i data-lucide="…">
	 * stays empty without it, which reads as a missing icon rather than a
	 * missing script.
	 *
	 * @return void
	 */
	function blueworx_admin_design_enqueue_icons() {
		$winner = blueworx_admin_design_winner();
		if ( '' === $winner['file'] ) {
			return;
		}
		if ( ! empty( $GLOBALS['blueworx_admin_design_icons_enqueued'] ) ) {
			return;
		}
		$GLOBALS['blueworx_admin_design_icons_enqueued'] = true;

		wp_enqueue_script(
			'blueworx-admin-design-icons',
			blueworx_admin_design_url() . 'blueworx-admin-icons.js',
			[],
			$winner['version'],
			true
		);
		add_filter( 'script_loader_tag', 'blueworx_admin_design_icons_module', 10, 2 );
	}

	/**
	 * Forces the icon script's tag to type="module".
	 *
	 * wp_enqueue_script_module() only exists from WordPress 6.5 and the design
	 * system declares no WordPress floor, so this filter is the same effect back
	 * to 4.1. WordPress prints its own type attribute on older versions, so the
	 * replacement inserts ours rather than assuming none is there.
	 *
	 * @param string $tag    The script tag.
	 * @param string $handle The script handle.
	 * @return string
	 */
	function blueworx_admin_design_icons_module( $tag, $handle ) {
		if ( 'blueworx-admin-design-icons' !== $handle ) {
			return $tag;
		}
		$tag = preg_replace( '/\stype=([\'"])[^\'"]*\1/', '', $tag );
		return str_replace( '<script ', '<script type="module" ', $tag );
	}
}

// Every copy announces itself, guard or no guard — see above.
blueworx_admin_design_register( '1.0.0', __FILE__ );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit --filter DesignSystemTest`
Expected: PASS, 6 tests.

Then confirm the PHP floor: `php -l .claude/skills/blueworx-admin-design/design-system.php` under PHP 7.4 if available locally, otherwise rely on the CI syntax-check step widened in Task 4.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/design-system.php tests/php/DesignSystemTest.php tests/php/WordPressStubs.php
git commit -m "Load one copy of the design system — the newest on the site

Every plugin ships its own copy and they all enqueue under one handle, so
WordPress kept whichever registered first and dropped the rest. Copies now
announce their version and the highest one is the only one loaded.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The page editor library uses the registrar

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/editor/php/v1/Screen.php:60-119`
- Modify: `.claude/skills/blueworx-admin-design/editor/php/blueworx-page-editor.php`

**Interfaces:**
- Consumes: `blueworx_admin_design_enqueue()`, `blueworx_admin_design_enqueue_icons()` from Task 1.
- Produces: nothing new. `Screen::assets()` keeps its signature.

The library's own JavaScript (`blueworx-page-editor.js`) still comes from the library's winning copy at `Registry::latest()` — that is the library's API version and stays as it is. Only the design system's stylesheet and icon module move to the registrar.

- [ ] **Step 1: Write the failing test**

Add to `tests/php/DesignSystemTest.php`:

```php
	public function test_the_library_does_not_enqueue_the_design_system_itself() {
		$screen = file_get_contents( __DIR__ . '/../../.claude/skills/blueworx-admin-design/editor/php/v1/Screen.php' );

		$this->assertStringNotContainsString( "wp_enqueue_style( 'blueworx-admin-design'", $screen );
		$this->assertStringContainsString( 'blueworx_admin_design_enqueue()', $screen );
		$this->assertStringContainsString( 'blueworx_admin_design_enqueue_icons()', $screen );
	}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit --filter test_the_library_does_not_enqueue_the_design_system_itself`
Expected: FAIL — `Screen.php` still contains `wp_enqueue_style( 'blueworx-admin-design'`.

- [ ] **Step 3: Write minimal implementation**

In `Screen.php::assets()`, replace the stylesheet and icon enqueues. Delete these two lines:

```php
		wp_enqueue_style( 'blueworx-admin-design', $base . 'assets/blueworx-admin-design.css', [], self::version() );
```

and

```php
		wp_enqueue_script( 'blueworx-admin-icons', $base . 'assets/blueworx-admin-icons.js', [], self::version(), true );
		add_filter( 'script_loader_tag', [ __CLASS__, 'moduleType' ], 10, 2 );
```

Put in their place, keeping the editor's own script enqueue where it is:

```php
		// The design system decides which copy of itself loads — the newest on
		// the site, once, however many plugins asked. This library used to
		// enqueue it directly under a shared handle, which meant the first
		// plugin to register won and every other plugin's screens wore its
		// stylesheet. See assets/blueworx-admin-design.php.
		blueworx_admin_design_enqueue();
		blueworx_admin_design_enqueue_icons();
```

Change the inline style's handle target — it still attaches to `blueworx-admin-design`, which the registrar enqueued, so that line is unchanged. Add a guard above both calls so a plugin that has not yet shipped the registrar degrades to no design system rather than a fatal:

```php
		if ( ! function_exists( 'blueworx_admin_design_enqueue' ) ) {
			// A plugin that has not re-pulled the design system yet. Nothing to
			// enqueue is better than a fatal on an admin screen; CI's design
			// system sync check is what tells them to catch up.
			return;
		}
```

Place that guard immediately after the `wp_enqueue_media()` block and before the enqueues, so the editor's own script does not load into a screen with no styling either.

Delete the now-unused `moduleType()` method and the `$base` variable if nothing else uses it — check first: `blueworx-page-editor.js` still uses `$base`, so `$base` stays and only `moduleType()` goes.

In `editor/php/blueworx-page-editor.php`, require the registrar if the plugin shipped it, before the library boots:

```php
// The design system is a peer of the library, not part of it: a plugin can use
// the design system without the editor. Required here only because a plugin
// that has both should not have to remember the order.
$blueworx_admin_design = dirname( __DIR__ ) . '/assets/blueworx-admin-design.php';
if ( file_exists( $blueworx_admin_design ) ) {
	require_once $blueworx_admin_design;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit`
Expected: PASS, whole suite green.

Run: `find .claude/skills/blueworx-admin-design/editor/php -name '*.php' -print0 | xargs -0 -n1 php -l`
Expected: no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/editor/php tests/php/DesignSystemTest.php
git commit -m "Editor screens ask the design system which copy to load

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CI keeps the registrar in sync

**Files:**
- Modify: `scripts/lib/checks.mjs:394-470`
- Modify: `scripts/lib/checks.test.mjs`
- Modify: `scripts/check-design-system-sync.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime; it checks the file Task 1 created.
- Produces: `designSystemSync()` gains two options — `canonicalRegistrar` and `shippedRegistrar` (both `string|null` hashes) and `registrarPath` (default `assets/blueworx-admin-design.php`). Existing callers that omit them keep working: a `null` canonical means "the design system does not have one yet", which passes.

- [ ] **Step 1: Write the failing test**

Add to `scripts/lib/checks.test.mjs`, following the shape the existing `designSystemSync` tests use:

```js
test('designSystemSync: fails when the shipped registrar differs from the foundation', () => {
  const result = designSystemSync({
    foundationFiles: new Map([['styles.css', 'a']]),
    pluginFiles: new Map([['styles.css', 'a']]),
    canonicalCss: 'css',
    shippedCss: 'css',
    canonicalRegistrar: 'registrar-new',
    shippedRegistrar: 'registrar-old',
  });

  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('assets/blueworx-admin-design.php')));
});

test('designSystemSync: fails when the plugin ships no registrar at all', () => {
  const result = designSystemSync({
    foundationFiles: new Map([['styles.css', 'a']]),
    pluginFiles: new Map([['styles.css', 'a']]),
    canonicalCss: 'css',
    shippedCss: 'css',
    canonicalRegistrar: 'registrar-new',
    shippedRegistrar: null,
  });

  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('missing')));
});

test('designSystemSync: passes when the registrar matches', () => {
  const result = designSystemSync({
    foundationFiles: new Map([['styles.css', 'a']]),
    pluginFiles: new Map([['styles.css', 'a']]),
    canonicalCss: 'css',
    shippedCss: 'css',
    canonicalRegistrar: 'same',
    shippedRegistrar: 'same',
  });

  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/checks.test.mjs`
Expected: FAIL — the two failure tests report `ok: true`, because `designSystemSync` ignores the new options.

- [ ] **Step 3: Write minimal implementation**

In `scripts/lib/checks.mjs`, add to the `designSystemSync()` parameter list:

```js
  canonicalRegistrar = null,
  shippedRegistrar = null,
  registrarPath = 'assets/blueworx-admin-design.php',
```

and after the existing `canonicalCss`/`shippedCss` block:

```js
  // The registrar decides which copy of the design system loads on a site with
  // more than one BlueWorx plugin. A plugin shipping a stale one keeps the old
  // "first handle registered wins" behaviour and nothing says so at runtime, so
  // it is checked exactly as hard as the stylesheet is.
  if (canonicalRegistrar !== null) {
    if (shippedRegistrar === null) {
      problems.push(`${registrarPath} — missing; the plugin must ship the design system registrar beside the stylesheet`);
    } else if (shippedRegistrar !== canonicalRegistrar) {
      problems.push(`${registrarPath} — differs from ${skillPath}/design-system.php`);
    }
  }
```

In `scripts/check-design-system-sync.mjs`, add the path and pass both hashes:

```js
const registrarPath = process.env.REGISTRAR_PATH || 'assets/blueworx-admin-design.php';
```

```js
  canonicalRegistrar: hashFile(join(foundationDir, skillPath, 'design-system.php')),
  shippedRegistrar: hashFile(registrarPath),
  registrarPath,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/*.test.mjs`
Expected: PASS, whole file green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/checks.mjs scripts/lib/checks.test.mjs scripts/check-design-system-sync.mjs
git commit -m "CI checks the design system registrar like it checks the stylesheet

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: CI stops the version and the stylesheet drifting apart

**Files:**
- Create: `scripts/lib/design-system-version.mjs`
- Create: `scripts/lib/design-system-version.test.mjs`
- Create: `scripts/check-design-system-version.mjs`
- Modify: `.github/workflows/foundation-ci.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `designSystemVersionBump({ styleChanged, registrarChanged, baseVersion, headVersion })` returning `{ ok: boolean, message: string }`, and `parseDesignSystemVersion(php)` returning the version string from a registrar file's `blueworx_admin_design_register( 'X.Y.Z', __FILE__ )` call, or `''`.

"Newest wins" is only as good as the version moving. Without this, a stylesheet fix ships under an unchanged version, an older copy on the site ties or beats it, and the fix silently does not arrive — the same class of failure as the bug this whole plan removes.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/design-system-version.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { designSystemVersionBump, parseDesignSystemVersion } from './design-system-version.mjs';

test('parses the version out of the registration call', () => {
  const php = "// comment\nblueworx_admin_design_register( '2.3.1', __FILE__ );\n";
  assert.equal(parseDesignSystemVersion(php), '2.3.1');
});

test('returns empty string when there is no registration call', () => {
  assert.equal(parseDesignSystemVersion('<?php // nothing here'), '');
});

test('fails when styles.css changed and the version did not', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /styles\.css/);
});

test('passes when styles.css changed and the version went up', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseVersion: '1.0.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, true);
});

test('fails when the version went backwards', () => {
  const result = designSystemVersionBump({
    styleChanged: true,
    baseVersion: '1.2.0',
    headVersion: '1.1.0',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /backwards/);
});

test('passes when styles.css did not change', () => {
  const result = designSystemVersionBump({
    styleChanged: false,
    baseVersion: '1.0.0',
    headVersion: '1.0.0',
  });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/design-system-version.test.mjs`
Expected: FAIL — `Cannot find module './design-system-version.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/design-system-version.mjs`:

```js
// The design system's version is what decides which copy loads on a site with
// two BlueWorx plugins (see the skill's design-system.php). A stylesheet change
// that ships under an unchanged version never reaches a site where an older copy
// is already installed — it ties, and the tie goes to whoever registered first.
// So the two move together, and this is what says so.

import { compareSemver } from './semver.mjs';

export function parseDesignSystemVersion(php) {
  const m = /blueworx_admin_design_register\(\s*'([0-9]+\.[0-9]+\.[0-9]+)'/.exec(php ?? '');
  return m ? m[1] : '';
}

export function designSystemVersionBump({ styleChanged, baseVersion, headVersion }) {
  if (!styleChanged) {
    return { ok: true, message: 'Design system version: styles.css unchanged — nothing to bump.' };
  }
  if (!headVersion) {
    return { ok: false, message: 'Design system version: could not read the version from design-system.php.' };
  }
  if (baseVersion && compareSemver(headVersion, baseVersion) < 0) {
    return { ok: false, message: `Design system version: ${headVersion} is backwards from ${baseVersion}.` };
  }
  if (baseVersion === headVersion) {
    return {
      ok: false,
      message: [
        `Design system version: styles.css changed but the version is still ${headVersion}.`,
        '',
        "Bump the version in the register call at the bottom of",
        '.claude/skills/blueworx-admin-design/design-system.php — a stylesheet change',
        'under an unchanged version never reaches a site that already has an older',
        'copy of the design system installed.',
      ].join('\n'),
    };
  }
  return { ok: true, message: `Design system version: ${baseVersion} → ${headVersion}.` };
}
```

Note: `semver.mjs` exports `compareSemver`, which is the name used above — confirmed, not assumed.

Create `scripts/check-design-system-version.mjs`:

```js
#!/usr/bin/env node
// Foundation-only. Fails the run if this PR changes the design system's
// stylesheet without moving its version. See scripts/lib/design-system-version.mjs
// for why the two travel together.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { designSystemVersionBump, parseDesignSystemVersion } from './lib/design-system-version.mjs';

const base = process.env.BASE_REF || 'main';
const skill = '.claude/skills/blueworx-admin-design';

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

const changed = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const result = designSystemVersionBump({
  styleChanged: changed.includes(`${skill}/styles.css`),
  baseVersion: parseDesignSystemVersion(gitShow(`origin/${base}`, `${skill}/design-system.php`)),
  headVersion: parseDesignSystemVersion(readFileSync(`${skill}/design-system.php`, 'utf8')),
});

console.log(result.message);
process.exit(result.ok ? 0 : 1);
```

In `.github/workflows/foundation-ci.yml`, in the Node job after the unit tests step, add:

```yaml
      - name: Design system version moves with its stylesheet
        env:
          BASE_REF: ${{ github.base_ref }}
        run: node scripts/check-design-system-version.mjs
```

The job's checkout must have history for `origin/<base>`, and `foundation-ci.yml` sets no `fetch-depth` anywhere today — checked, not assumed — so its `actions/checkout@v4` step in the Node job needs it added:

```yaml
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
```

Without this the checkout is shallow, `git show origin/<base>:…` finds nothing, `baseVersion` comes back empty, and the check passes everything — a guard that never fires is worse than no guard, because it reads like cover.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/*.test.mjs`
Expected: PASS.

Run: `node --check scripts/check-design-system-version.mjs`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/design-system-version.mjs scripts/lib/design-system-version.test.mjs scripts/check-design-system-version.mjs .github/workflows/foundation-ci.yml
git commit -m "Fail the build if the design system's stylesheet changes without its version

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Say so in the documents plugins read

**Files:**
- Modify: `.claude/skills/blueworx-admin-design/readme.md:265-280`
- Modify: `.claude/skills/blueworx-admin-design/SKILL.md`
- Modify: `CLAUDE.md.template`

**Interfaces:**
- Consumes: the function names from Task 1.
- Produces: the ship list every plugin's `CLAUDE.md` inherits, now four paths.

- [ ] **Step 1: Update the readme's enqueue recipe**

Replace the copy-paste block around `readme.md:271` — currently `wp_enqueue_style( 'bw-admin', PLUGIN_URL . 'assets/blueworx-admin-design.css', [], BW_VERSION );` and the matching `wp_enqueue_script_module` line — with:

```php
// Load the design system on your admin screens. Do not enqueue the stylesheet
// yourself: on a site with two BlueWorx plugins, whichever enqueued first used
// to win and the other plugin's screens wore its stylesheet. This loads the
// newest copy present on the site, once.
require_once PLUGIN_DIR . 'assets/blueworx-admin-design.php';

add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( ! my_plugin_is_own_screen( $hook ) ) {
		return;
	}
	blueworx_admin_design_enqueue();
	blueworx_admin_design_enqueue_icons();
} );
```

- [ ] **Step 2: Update the ship list in SKILL.md**

Wherever SKILL.md lists what a plugin ships from the design system, add the fourth entry and keep the existing three:

```
- `styles.css`            → `assets/blueworx-admin-design.css`
- `design-system.php`     → `assets/blueworx-admin-design.php`
- `fonts/`                → `assets/fonts/`
- `assets/icons/lucide-icons.js` → `assets/blueworx-admin-icons.js`
```

with a line saying the registrar must sit beside the stylesheet, because it works out its URL from its own location.

- [ ] **Step 3: Update CLAUDE.md.template**

In the "WordPress admin screens come from the design system" section, the paragraph beginning "The plugin also **ships** three things from the design system" becomes four, and gains one sentence: the plugin calls `blueworx_admin_design_enqueue()` rather than enqueueing the stylesheet itself, so that on a site with two BlueWorx plugins the newest copy of the design system is the one that loads.

- [ ] **Step 4: Verify**

Run: `node --test scripts/lib/*.test.mjs .claude/hooks/*.test.mjs`
Expected: PASS — the admin-UI adherence tests read the readme's vocabulary, so a readme edit must not break them.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/blueworx-admin-design/readme.md .claude/skills/blueworx-admin-design/SKILL.md CLAUDE.md.template
git commit -m "Document the registrar as the way to load the design system

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Open the foundation PR and move `v1`

**Files:** none — this is the integration step.

Every plugin's CI pins the foundation at `v1`. Until `v1` moves, both plugin PRs below stay red on the design system sync check, because they carry a registrar the foundation ref does not have.

- [ ] **Step 1: Push the branch and open the PR**

```bash
git push -u origin design-system-newest-copy-wins
gh pr create --title "Load one copy of the design system, the newest on the site" --body "$(cat <<'EOF'
Two BlueWorx plugins on one site both enqueued the design system under one handle, so WordPress kept whichever registered first and dropped the rest. A plugin's screens could be styled by another plugin's older stylesheet with nothing reporting it — on blueworx.io the deck editor was wearing WordPress Enhancements' copy, which is why its line-item rows sat on one squashed line.

Copies now announce their version and only the newest loads. CI checks the new file like it checks the stylesheet, and fails a PR that changes the stylesheet without moving the version.

Needs deciding: this only reaches sites once `v1` moves and both plugins re-pull.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for CI, then merge**

Run: `gh pr checks --watch`
Expected: all green.

- [ ] **Step 3: Move `v1` to the merged commit**

```bash
git checkout main && git pull
git tag -f v1 && git push -f origin v1
```

Confirm with Luke before this force-push: it is what every plugin's CI resolves, so it changes what every other repo checks against.

---

### Task 7: Deck Builder adopts it

**Files:**
- Create: `assets/blueworx-admin-design.php` (copied from the foundation)
- Modify: `.claude/skills/blueworx-admin-design/` (re-pulled), `blueworx-page-editor/` (re-pulled)
- Modify: `includes/class-blueworx-deck-builder-admin.php:194-230`
- Modify: `blueworx-labs-deck-builder.php`, `package.json`, `CHANGELOG.md`
- Test: `tests/design-system.spec.js`

**Interfaces:**
- Consumes: the functions from Task 1, via the shipped `assets/blueworx-admin-design.php`.
- Produces: nothing other plugins read.

- [ ] **Step 1: Write the failing test**

Create `tests/design-system.spec.js`, against the local WordPress harness:

```js
const { test, expect } = require('@playwright/test');

// The deck editor's line items stack one field per line. They only do that if
// the screen is wearing this plugin's own design system rather than another
// BlueWorx plugin's older copy — which is exactly what used to happen, with
// nothing on the page to say so.
test('the deck editor loads this plugin\'s design system', async ({ page }) => {
  await page.goto('/wp-admin/admin.php?page=blueworx-labs-deck-builder');

  const editorLink = page.locator('a[href*="page=blueworx-deck-editor"]').first();
  await expect(editorLink).toBeVisible();
  await editorLink.click();

  const href = await page.locator('link#blueworx-admin-design-css').getAttribute('href');
  expect(href).toContain('/plugins/blueworx-labs-deck-builder/assets/blueworx-admin-design.css');

  const direction = await page
    .locator('.bw-repeater__fields')
    .first()
    .evaluate((el) => getComputedStyle(el).flexDirection);
  expect(direction).toBe('column');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node ../bluegroup_core_foundation/scripts/wp-test-env.mjs up --plugin .
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw npx playwright test tests/design-system.spec.js --workers=1
```

Expected: FAIL. On a harness with only this plugin installed the stylesheet URL assertion may already pass, so the meaningful failure is the flex-direction assertion once the plugin is re-pulled but the enqueue is not yet switched. If both pass before any change, the harness is not reproducing the collision — say so and rely on Task 8's live verification instead of weakening the test.

- [ ] **Step 3: Re-pull the design system and switch the enqueue**

```bash
cp -R ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/. .claude/skills/blueworx-admin-design/
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/styles.css assets/blueworx-admin-design.css
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/design-system.php assets/blueworx-admin-design.php
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/assets/icons/lucide-icons.js assets/blueworx-admin-icons.js
cp -R ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/editor/php/. blueworx-page-editor/
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js assets/blueworx-page-editor.js
```

In `blueworx-labs-deck-builder.php`, require the registrar before the page editor library is required:

```php
require_once BLUEWORX_DECK_BUILDER_DIR . 'assets/blueworx-admin-design.php';
```

In `includes/class-blueworx-deck-builder-admin.php::enqueue_assets()`, replace the `wp_enqueue_style( 'blueworx-admin-design', … )` call and the `wp_enqueue_script_module( 'blueworx-admin-icons', … )` block with:

```php
		// Which copy of the design system loads is the system's decision, not
		// this plugin's: on a site with another BlueWorx plugin, the newest copy
		// present wins. Enqueueing it here directly is what used to let an older
		// copy style these screens.
		blueworx_admin_design_enqueue();
		blueworx_admin_design_enqueue_icons();
```

The `wp_add_inline_style( 'blueworx-admin-design', $this->chrome_overrides() )` call below it is unchanged — the handle is still there, the registrar enqueued it.

- [ ] **Step 4: Run test to verify it passes**

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw npx playwright test --workers=1
```

Expected: PASS, the whole suite.

Then verify the zip still builds and still carries the new file:

```bash
npm run build:zip
unzip -l ../blueworx-labs-deck-builder-*.zip | grep blueworx-admin-design.php
```

Expected: the build's own verification passes and the registrar is listed. `assets` is already on the allowlist in `bin/build-zip.sh`, so no change there — confirm rather than assume.

- [ ] **Step 5: Bump, changelog, commit, PR**

Bump to `0.11.0` in `blueworx-labs-deck-builder.php` (both the `Version:` header and `BLUEWORX_DECK_BUILDER_VERSION`) and in `package.json`. Add under a new `## [0.11.0]` heading in `CHANGELOG.md`:

```markdown
### Fixed

- The deck editor is styled by this plugin's own design system again. On a site
  running another BlueWorx plugin, whichever plugin loaded first decided how
  every BlueWorx screen looked, so the editor's line items sat squashed on one
  line instead of one field each. The newest copy of the design system on the
  site now wins, whatever order plugins load in.
```

```bash
git add -A
git commit -m "Let the newest design system on the site style the deck editor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin fix-design-system-collision
gh pr create --title "Use the newest design system on the site" --body "..."
```

---

### Task 8: Enhancements adopts it, and the live screen is checked

**Files:**
- Create: `assets/blueworx-admin-design.php` in `blueworx_labs_wordpress`
- Modify: `.claude/skills/blueworx-admin-design/` (re-pulled), `includes/admin-assets.php:133-176`, plugin header, `package.json`, `CHANGELOG.md`

Enhancements is the plugin currently winning the handle, and it does not vendor the page editor library — so it needs the registrar shipped and required on its own.

- [ ] **Step 1: Re-pull and switch the enqueue**

```bash
cd ../blueworx_labs_wordpress
cp -R ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/. .claude/skills/blueworx-admin-design/
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/styles.css assets/blueworx-admin-design.css
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/design-system.php assets/blueworx-admin-design.php
cp ../bluegroup_core_foundation/.claude/skills/blueworx-admin-design/assets/icons/lucide-icons.js assets/blueworx-admin-icons.js
```

Require the registrar from the plugin's main file, then rewrite `blueworx_enqueue_admin_design_style()` and `blueworx_enqueue_admin_design_icons()` in `includes/admin-assets.php` to delegate:

```php
function blueworx_enqueue_admin_design_style() {
	blueworx_admin_design_enqueue();
}

function blueworx_enqueue_admin_design_icons() {
	blueworx_admin_design_enqueue_icons();
}
```

Delete `blueworx_admin_design_icons_module()` and its `add_filter( 'script_loader_tag', … )` line — the registrar carries that now, under the same handle name (`blueworx-admin-design-icons`), so nothing else needs changing.

The two functions keep their names and their callers: the admin re-skin and the login screen both call the style function for its `@font-face` declarations, and they still get them.

- [ ] **Step 2: Run the plugin's own tests**

```bash
node ../bluegroup_core_foundation/scripts/wp-test-env.mjs up --plugin .
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw npx playwright test --workers=1
```

Expected: PASS. Enhancements styles a lot of screens from this stylesheet, so a regression here is the real risk in this whole plan — read the failures rather than adjusting the test.

- [ ] **Step 3: Bump, changelog, commit, PR**

Minor bump — this changes how the plugin loads a shared asset. Changelog entry:

```markdown
### Fixed

- On a site running another BlueWorx plugin, the newest copy of the admin design
  system is now the one that loads. Whichever plugin happened to load first used
  to decide how every BlueWorx screen looked, including other plugins' screens.
```

- [ ] **Step 4: Verify on the live site, after both are deployed**

With both plugins updated on blueworx.io, open the deck editor through the support session and confirm:

```js
// Expected: the stylesheet comes from blueworx-labs-deck-builder or
// blueworx-labs-wordpress — whichever carries the higher design system version —
// and there is exactly one of it.
Array.from(document.querySelectorAll('link[rel=stylesheet]'))
  .filter((l) => l.href.includes('blueworx-admin-design.css'))
  .map((l) => l.href);

// Expected: "column"
getComputedStyle(document.querySelector('.bw-repeater__fields')).flexDirection;
```

Both must hold before this is called done. One link, and `column`.

---

## Out of scope, worth knowing

The page editor's own JavaScript still ships at `?ver=1.0.0` — the library's API version, which never moves — behind a one-year cache header. That is a separate recorded problem (`page-editor-assets-never-cache-bust`): a fix to the editor's JavaScript still does not reach a browser that has already loaded it. This plan does not touch it, and it does not affect the stylesheet any more, because the stylesheet's version now moves with its content.
