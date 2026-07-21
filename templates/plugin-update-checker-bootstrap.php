<?php
/**
 * Plugin Update Checker bootstrap — copy this block into the plugin's main file,
 * below the plugin header, and replace <repo> and <slug>.
 *
 * Prerequisites:
 *   1. Vendor the library into the plugin at plugin-update-checker/ and commit it
 *      (see docs/wordpress-auto-updates.md in the foundation).
 *   2. The plugin has a valid "Version:" header. It is the only thing a site
 *      compares against, so it must be bumped for every release.
 *   3. The repo publishes releases via the foundation's release-wordpress.yml.
 *
 * Do not commit this file into a plugin as-is — it is a snippet to paste, not a
 * file to include.
 */

require_once plugin_dir_path( __FILE__ ) . 'plugin-update-checker/plugin-update-checker.php';

use YahnisElsts\PluginUpdateChecker\v5\PucFactory;

$blueworx_update_checker = PucFactory::buildUpdateChecker(
	'https://github.com/blueworx-io/<repo>/',
	__FILE__,
	'<slug>' // Must equal the plugin's folder name. Omit it and WordPress can
	         // install the update alongside the original as a second copy.
);

/*
 * Our plugin repos are private, so the site needs a token to see releases at all.
 * It lives in wp-config.php — never in the plugin, never in the repo:
 *
 *     define( 'BLUEWORX_PLUGIN_UPDATE_TOKEN', 'github_pat_...' );
 *
 * Guarded, so the same code works unchanged if a repo is ever made public.
 */
if ( defined( 'BLUEWORX_PLUGIN_UPDATE_TOKEN' ) && BLUEWORX_PLUGIN_UPDATE_TOKEN ) {
	$blueworx_update_checker->setAuthentication( BLUEWORX_PLUGIN_UPDATE_TOKEN );
}

/*
 * Install the zip attached to the Release, not GitHub's auto-generated source
 * tarball. The tarball is named <repo>-<tag>, so without this the update
 * extracts to the wrong folder — WordPress treats it as a different plugin and
 * the original deactivates — and it ships every dev file in the repo.
 */
$blueworx_update_checker->getVcsApi()->enableReleaseAssets();
