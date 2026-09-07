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
