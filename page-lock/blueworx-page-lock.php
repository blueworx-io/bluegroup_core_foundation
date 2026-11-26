<?php
/**
 * BlueWorx page lock — loader.
 *
 * The one page lock every BlueWorx site uses. The theme carries a copy, and so
 * does the old BlueWorx plugin on sites not on the theme. Each copy announces
 * itself here and the highest version runs, once, so a site with both never
 * runs two locks.
 *
 * The copy is loaded on after_setup_theme rather than plugins_loaded: a theme
 * loads after every plugin, so waiting until then is the only way its copy
 * gets a say in which version wins.
 *
 * Do not edit this folder in a theme or plugin. It is compared against the
 * foundation's page-lock/ on every pull request; the fix for a difference is
 * always to copy it again from the foundation.
 *
 * @package BlueworxPageLock
 */

if ( ! defined( 'ABSPATH' ) && ! defined( 'BWPL_TESTING' ) ) {
	exit;
}

if ( ! class_exists( 'Blueworx\PageLock\Registry', false ) ) {
	require_once __DIR__ . '/Registry.php';
}

\Blueworx\PageLock\Registry::add( '1.0.1', __DIR__ );

if ( function_exists( 'add_action' ) ) {
	add_action( 'after_setup_theme', array( '\Blueworx\PageLock\Registry', 'load' ), 0 );
}
