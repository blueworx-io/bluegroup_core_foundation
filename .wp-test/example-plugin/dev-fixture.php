<?php
/**
 * Dev/test scaffolding — not part of the reference schema, and not loaded by
 * blueworx-editor-example.php or anything else. That file is what a plugin
 * copies from, so it stays pure schema: a screen definition and nothing else,
 * not even a require pointing at this.
 *
 * The automated end-to-end suite does not use this either — it creates its
 * own fixture record over the REST API in a beforeAll (see
 * .wp-test/tests/page-editor.spec.js). This file is only for a person
 * poking at the screen by hand who would rather not click through "Add New"
 * first: require it once from the top of blueworx-editor-example.php while
 * you work locally, and remove that line again before committing anything —
 * or just create a sport post the normal way, which is all Task 19's own
 * check ever asked for.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Runs on every 'init', after the post type is registered (priority 10 in
 * blueworx-editor-example.php) and after activation ever gets a chance to run
 * this same plugin's own hooks — activate_plugin() includes the plugin file
 * after 'init' has already fired for that request, so the post type would
 * not exist yet if this ran at activation time instead.
 */
function bwx_editor_example_ensure_post() {
	$id = (int) get_option( 'bwx_editor_example_post_id' );
	if ( $id && get_post( $id ) && 'bwx_sport' === get_post_type( $id ) ) {
		return $id;
	}
	$id = wp_insert_post( [
		'post_type'   => 'bwx_sport',
		'post_title'  => 'Rugby union',
		'post_status' => 'publish',
	], true );
	if ( is_wp_error( $id ) ) {
		return 0;
	}
	update_option( 'bwx_editor_example_post_id', $id );
	return $id;
}
add_action( 'init', 'bwx_editor_example_ensure_post', 20 );
