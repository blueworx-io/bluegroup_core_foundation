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
		// The post type's own capability (get_post_type_object('bwx_sport')
		// ->cap->edit_posts) — WordPress's default capability_type for a post
		// type reuses 'edit_posts', shared with every other default post
		// type, but that is still the capability about editing content. A
		// site owner able to edit sports should not also need
		// manage_options — the capability for the site's own settings pages —
		// just to open this screen. A post type with genuinely distinct
		// capabilities per role would declare its own capability_type instead
		// (register_post_type()'s 'capabilities' argument); that needs its
		// own capabilities granted to a role somewhere, which is more than a
		// reference schema should carry.
		'capability' => 'edit_posts',
		'tabs'       => [
			[
				'id'     => 'content',
				'label'  => 'Content',
				'panels' => [
					[
						'id'      => 'basics',
						// Where on the live page this panel's fields surface —
						// distinct per panel, unlike a placeholder repeated
						// everywhere, because that is what an eyebrow is for:
						// orienting the reader inside the record, not
						// decorating the panel.
						'eyebrow' => 'Sport page · Header',
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
						'eyebrow'  => 'Sport page · Schedule',
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
