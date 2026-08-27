<?php
namespace Blueworx\PageEditor\v1;

/**
 * WordPress's own post settings, in their own tab, last, identical on every
 * screen we build. A plugin does not write these and cannot reorder them —
 * that sameness is the point.
 *
 * The tab is run through Schema::normaliseTab() before it is handed back, so
 * every field here gets the same defaults — wide, required, help, depends_on,
 * locked_help, capability — as a field a plugin declared. The browser reads
 * those keys on every field; without this, this tab's fields would be a
 * second, thinner shape it would have to special-case.
 */
final class Settings {

	public static function tab( array $screen ): ?array {
		if ( 'post' !== $screen['store'] ) {
			return null;
		}

		$tab = [
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

		return Schema::normaliseTab( $tab, $screen['slug'] );
	}
}
