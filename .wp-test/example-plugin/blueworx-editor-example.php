<?php
/**
 * Plugin Name: BlueWorx editor example
 * Description: The worked page editor screen the foundation tests against, and the shape a plugin copies.
 * Version: 0.1.0
 *
 * How this screen is reached, and the one thing this file deliberately does
 * not do.
 *
 * The editor edits a record that already exists. Its address is
 * admin.php?page=bwx-sport-editor&id=123, where 123 is a bwx_sport post. Open
 * it without an id, or with an id that is not a sport, and it says the record
 * could not be found — which is the right answer, not a bug: an editor with
 * no record to edit has nothing to save to.
 *
 * So the plugin has to supply the way in. This one does it the cheapest way
 * there is: the post type below is registered with 'show_ui' => true, so
 * WordPress draws its own "Sports" list and its own "Add New", and those
 * create the records. What is missing from this example, and is the next
 * thing to build in a real plugin, is the link from that list to this screen
 * — a row action or a column, added with the post_row_actions filter,
 * pointing at admin.php?page=bwx-sport-editor&id={$post->ID}. A plugin that
 * would rather not show WordPress's own list at all sets 'show_ui' => false
 * and builds its own list screen from the design system, with an "Add new"
 * that calls wp_insert_post() and then redirects to the same address.
 *
 * Either way it is the post type's job, never the library's: the library
 * edits records and does not create them.
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
							// The record's own title, not a field of its own:
							// post_title is a column on the post (see
							// PostStore::POST_COLUMNS), so this is what makes
							// the sport show by name in wp-admin's own lists
							// as well as here. A record screen that never
							// declares it leaves every record reading
							// "(no title)", however much else it edits.
							[ 'id' => 'post_title', 'kind' => 'title', 'label' => 'Name', 'required' => true, 'help' => 'Shown as the heading on the sport page.' ],
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
							// A row holds more than text: see
							// Schema::REPEATER_KINDS. Each cell is drawn by its
							// own control and cleaned by its own kind.
							[ 'id' => 'sessions', 'kind' => 'repeater', 'label' => 'Sessions', 'fields' => [
								[ 'id' => 'day', 'kind' => 'text', 'label' => 'Day' ],
								[ 'id' => 'venue', 'kind' => 'text', 'label' => 'Venue' ],
								[ 'id' => 'notes', 'kind' => 'textarea', 'label' => 'Notes' ],
								[ 'id' => 'members_only', 'kind' => 'toggle', 'label' => 'Members only' ],
								[ 'id' => 'level', 'kind' => 'select', 'label' => 'Level', 'options' => [
									[ 'value' => 'all', 'label' => 'All levels' ],
									[ 'value' => 'beginner', 'label' => 'Beginners' ],
								] ],
							] ],
							// A link that suggests without constraining: the
							// field stays free text, and the list is a
							// shortcut to the pages this site already has.
							[ 'id' => 'more_info', 'kind' => 'text', 'label' => 'More information', 'format' => 'url',
								'help' => 'Where to read more. Pick one of your own pages, or type any address.',
								'suggestions' => [
									[ 'value' => '/about/', 'label' => 'About' ],
									[ 'value' => '/membership/', 'label' => 'Membership' ],
								] ],
						],
					],
				],
			],
		],
	] );
} );
