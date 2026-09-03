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
		// The strip of derived figures under the header, which stays put while
		// the tabs beneath it change. Every cell says what to work out, never
		// how: the browser adds it up as somebody types, so the figures move
		// with the screen rather than catching up after a save.
		'summary'    => [
			[ 'id' => 'coached', 'label' => 'Coached hours', 'sum' => 'delivery.hours', 'where' => 'delivery.counts', 'suffix' => 'hrs', 'foot' => 'Sessions that count towards the season' ],
			[ 'id' => 'everything', 'label' => 'All planned hours', 'sum' => 'delivery.hours', 'suffix' => 'hrs', 'foot' => 'Including the ones left out' ],
			[ 'id' => 'phases', 'label' => 'Season phases', 'count' => 'timeline', 'foot' => 'On the timeline' ],
		],
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
			[
				'id'     => 'delivery',
				'label'  => 'Delivery',
				'panels' => [
					[
						'id'      => 'work',
						'eyebrow' => 'Season · Coaching',
						'title'   => 'Planned coaching',
						'note'    => 'Rows fall under the block they belong to, and each block carries its own subtotal.',
						'fields'  => [
							// A repeater that groups. group_by names one of its
							// own select cells, subtotal_of one of its own
							// number cells — so the header row and the subtotal
							// come from the same data the rows already hold,
							// rather than from a second list to keep in step.
							[
								'id'                => 'delivery',
								'kind'              => 'repeater',
								'label'             => 'Coaching blocks',
								'group_by'          => 'block',
								'subtotal_of'       => 'hours',
								'subtotal_suffix'   => 'hrs',
								'group_empty_label' => 'Not scheduled yet',
								'fields'            => [
									[ 'id' => 'title', 'kind' => 'text', 'label' => 'Session' ],
									[ 'id' => 'block', 'kind' => 'select', 'label' => 'Block', 'options' => [
										[ 'value' => 'preseason', 'label' => 'Pre-season' ],
										[ 'value' => 'season', 'label' => 'In season' ],
										[ 'value' => 'offseason', 'label' => 'Off season' ],
									] ],
									[ 'id' => 'hours', 'kind' => 'number', 'label' => 'Hours' ],
									[ 'id' => 'counts', 'kind' => 'toggle', 'label' => 'Counts towards the season' ],
								],
							],
						],
					],
					[
						'id'      => 'plan',
						'eyebrow' => 'Season · Timeline',
						'title'   => 'Season timeline',
						'note'    => 'Weeks are set to match what the coaches can actually do — they are never worked out from the hours above.',
						'fields'  => [
							[ 'id' => 'timeline', 'kind' => 'gantt', 'label' => 'Season phases', 'help' => 'One bar per phase. The launch milestone separates the season from what follows it.' ],
						],
					],
				],
			],
			[
				'id'     => 'settled',
				'label'  => 'Settled',
				'panels' => [
					[
						'id'      => 'kit',
						'eyebrow' => 'Season · Kit',
						'title'   => 'What every player brings',
						'note'    => 'The same list for every sport. The wording is per sport; the list is not.',
						'fields'  => [
							// A fixed list: no add, no remove, no reorder, every
							// cell still editable. The rows arrive as the field's
							// own default, which is the shape a fixed list wants —
							// they come from somewhere other than this screen.
							[
								'id'      => 'kit',
								'kind'    => 'repeater',
								'label'   => 'Kit',
								'fixed'   => true,
								'default' => [
									[ 'item' => 'Boots', 'note' => 'Studded, not blades.' ],
									[ 'item' => 'Water bottle', 'note' => 'Named.' ],
								],
								'fields'  => [
									[ 'id' => 'item', 'kind' => 'text', 'label' => 'Item' ],
									[ 'id' => 'note', 'kind' => 'text', 'label' => 'Note' ],
								],
							],
						],
					],
					[
						'id'      => 'terms',
						'eyebrow' => 'Season · Terms',
						'title'   => 'The school terms',
						'note'    => 'Three terms, always in this order. Only the wording is per sport.',
						'fields'  => [
							[
								'id'      => 'terms',
								'kind'    => 'gantt',
								'label'   => 'Terms',
								'fixed'   => true,
								'default' => [
									[ 'id' => 't1', 'title' => 'Autumn term', 'desc' => '', 'start' => 1, 'end' => 12, 'milestone' => '', 'kind' => 'pre', 'visible' => true ],
									[ 'id' => 't2', 'title' => 'Spring term', 'desc' => '', 'start' => 13, 'end' => 24, 'milestone' => '', 'kind' => 'pre', 'visible' => true ],
								],
							],
						],
					],
				],
			],
		],
	] );

	// A second screen on the same records, for the one thing the screen above
	// cannot show: what the Publish and settings tab looks like when a screen
	// says it does not want all of it. A record that is not a page of the site
	// has no excerpt, no comments, no categories and no parent, and its
	// address is something to copy rather than something to retype.
	//
	// Registered separately rather than by trimming the screen above, so that
	// screen goes on proving the other half — that a screen which says nothing
	// still gets the whole tab.
	\Blueworx\PageEditor\v1\Editor::register( [
		'slug'       => 'bwx-sport-trimmed',
		'title'      => 'Edit sport (trimmed)',
		'post_type'  => 'bwx_sport',
		'capability' => 'edit_posts',
		'publishing' => [
			'slug'       => 'readonly',
			'excerpt'    => false,
			'comments'   => false,
			'taxonomies' => false,
			'parent'     => false,
		],
		'tabs'       => [
			[
				'id'     => 'content',
				'label'  => 'Content',
				'panels' => [
					[
						'id'     => 'basics',
						'title'  => 'The basics',
						'fields' => [
							[ 'id' => 'post_title', 'kind' => 'title', 'label' => 'Name' ],
						],
					],
				],
			],
		],
	] );
} );
