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
							[ 'id' => 'announcement_enabled', 'kind' => 'toggle', 'label' => 'Announcement bar', 'help' => 'Adds a banner across the top of the sport page.' ],
							[ 'id' => 'announcement_text', 'kind' => 'text', 'label' => 'Banner text', 'help' => 'Shown inside the announcement bar.', 'depends_on' => [ 'field' => 'announcement_enabled', 'value' => true ] ],
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

/**
 * Test-only convenience: the library now requires the id in the editor URL to
 * be a real post of the screen's own type, so the harness needs a stable one
 * to point Playwright at. Runs on every 'init', after the post type is
 * registered (priority 10 above) and after activation ever gets a chance to
 * run this same plugin's own hooks — activate_plugin() includes this file
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
