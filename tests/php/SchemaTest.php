<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;

final class SchemaTest extends TestCase {

	private function screen( array $field ): array {
		return [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [ $field ] ],
				] ],
			],
		];
	}

	public function test_a_known_kind_is_accepted(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$this->assertSame( 'text', $screen['tabs'][0]['panels'][0]['fields'][0]['kind'] );
	}

	public function test_an_unknown_kind_is_rejected_by_name(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'carousel' );
		Schema::validate( $this->screen( [ 'id' => 'x', 'kind' => 'carousel', 'label' => 'X' ] ) );
	}

	public function test_defaults_are_filled_in(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$this->assertSame( 'post', $screen['store'] );
		$this->assertSame( 'manage_options', $screen['capability'] );
		$this->assertFalse( $screen['tabs'][0]['panels'][0]['hideable'] );
	}

	public function test_a_field_without_a_label_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'needs a label' );
		Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text' ] ) );
	}

	public function test_a_repeater_sub_field_with_an_unknown_kind_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'trumpet' );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [
				[ 'id' => 'label', 'kind' => 'trumpet', 'label' => 'Label' ],
			],
		] ) );
	}

	/**
	 * The browser draws a repeater cell as a text box or a number box and
	 * nothing else, so those are the only kinds a row may hold. Anything else
	 * registered cleanly and then rendered as a text box saving nonsense —
	 * the schema has to refuse what the screen cannot draw.
	 */
	public function test_a_repeater_sub_field_of_a_kind_a_row_cannot_hold_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'richtext' );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [ [ 'id' => 'notes', 'kind' => 'richtext', 'label' => 'Notes' ] ],
		] ) );
	}

	public function test_a_rejected_repeater_sub_field_names_what_a_row_may_hold(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'text, number, textarea, select, toggle, media' );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [ [ 'id' => 'tags', 'kind' => 'tokens', 'label' => 'Tags' ] ],
		] ) );
	}

	/**
	 * The four kinds the row gained. Each is drawn by its own control in
	 * Repeater(), and each is already cleaned by its own kind on the way in —
	 * see Sanitise::field(), which recurses per cell.
	 */
	public function test_a_repeater_row_may_hold_the_wider_set_of_cells(): void {
		$screen = Schema::validate( $this->screen( [
			'id'     => 'tiers',
			'kind'   => 'repeater',
			'label'  => 'Tiers',
			'fields' => [
				[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
				[ 'id' => 'features', 'kind' => 'textarea', 'label' => 'Features' ],
				[ 'id' => 'featured', 'kind' => 'toggle', 'label' => 'Most popular' ],
				[ 'id' => 'photo', 'kind' => 'media', 'label' => 'Photo' ],
				[ 'id' => 'sells', 'kind' => 'select', 'label' => 'Sells', 'options' => [ [ 'value' => 'a', 'label' => 'A' ] ] ],
			],
		] ) );

		$cells = $screen['tabs'][0]['panels'][0]['fields'][0]['fields'];
		$this->assertSame(
			[ 'text', 'textarea', 'toggle', 'media', 'select' ],
			array_column( $cells, 'kind' )
		);
	}

	public function test_a_text_field_may_offer_suggestions(): void {
		$screen = Schema::validate( $this->screen( [
			'id'          => 'href',
			'kind'        => 'text',
			'label'       => 'Link',
			'suggestions' => [
				[ 'value' => '/about/', 'label' => 'About' ],
				[ 'value' => '/membership/', 'label' => 'Membership' ],
			],
		] ) );

		$field = $screen['tabs'][0]['panels'][0]['fields'][0];
		$this->assertSame(
			[ [ 'value' => '/about/', 'label' => 'About' ], [ 'value' => '/membership/', 'label' => 'Membership' ] ],
			$field['suggestions']
		);
	}

	/** Absent is the ordinary case, and reads as an empty list, not as missing. */
	public function test_a_field_with_no_suggestions_gets_an_empty_list(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$this->assertSame( [], $screen['tabs'][0]['panels'][0]['fields'][0]['suggestions'] );
	}

	public function test_a_suggestion_with_no_label_falls_back_to_its_value(): void {
		$screen = Schema::validate( $this->screen( [
			'id'          => 'href',
			'kind'        => 'text',
			'label'       => 'Link',
			'suggestions' => [ [ 'value' => '/about/' ] ],
		] ) );
		$this->assertSame( [ [ 'value' => '/about/', 'label' => '/about/' ] ], $screen['tabs'][0]['panels'][0]['fields'][0]['suggestions'] );
	}

	public function test_suggestions_on_a_kind_that_cannot_show_them_are_refused(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'suggestions' );
		Schema::validate( $this->screen( [
			'id'          => 'body',
			'kind'        => 'textarea',
			'label'       => 'Body',
			'suggestions' => [ [ 'value' => '/about/', 'label' => 'About' ] ],
		] ) );
	}

	public function test_a_suggestion_with_no_value_is_refused(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'no value' );
		Schema::validate( $this->screen( [
			'id'          => 'href',
			'kind'        => 'text',
			'label'       => 'Link',
			'suggestions' => [ [ 'label' => 'About' ] ],
		] ) );
	}

	/** A suggestion list is a shortcut, never a constraint. */
	public function test_a_value_outside_the_suggestions_is_still_saved(): void {
		$field = [
			'id'          => 'href',
			'kind'        => 'text',
			'label'       => 'Link',
			'suggestions' => [ [ 'value' => '/about/', 'label' => 'About' ] ],
		];
		$this->assertSame( 'https://somewhere.else/', \Blueworx\PageEditor\v1\Sanitise::field( $field, 'https://somewhere.else/' ) );
	}

	/** A select cell is held to the same rule as a select field. */
	public function test_a_select_cell_still_needs_options(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'options' );
		Schema::validate( $this->screen( [
			'id'     => 'tiers',
			'kind'   => 'repeater',
			'label'  => 'Tiers',
			'fields' => [ [ 'id' => 'sells', 'kind' => 'select', 'label' => 'Sells' ] ],
		] ) );
	}

	public function test_a_repeater_row_may_hold_text_and_number_cells(): void {
		$screen = Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [
				[ 'id' => 'day', 'kind' => 'text', 'label' => 'Day' ],
				[ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats' ],
			],
		] ) );
		$this->assertSame( [ 'text', 'number' ], array_column( $screen['tabs'][0]['panels'][0]['fields'][0]['fields'], 'kind' ) );
	}

	public function test_a_repeater_sub_field_without_a_label_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'needs a label' );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [
				[ 'id' => 'label', 'kind' => 'text' ],
			],
		] ) );
	}

	public function test_a_repeater_containing_a_repeater_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [
				[ 'id' => 'inner', 'kind' => 'repeater', 'label' => 'Inner', 'fields' => [
					[ 'id' => 'x', 'kind' => 'text', 'label' => 'X' ],
				] ],
			],
		] ) );
	}

	public function test_a_repeater_sub_field_id_may_repeat_a_top_level_field_id(): void {
		$screen = Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'day', 'kind' => 'text', 'label' => 'Day' ],
						[ 'id' => 'days', 'kind' => 'repeater', 'label' => 'Days', 'fields' => [
							[ 'id' => 'day', 'kind' => 'text', 'label' => 'Day' ],
						] ],
					] ],
				] ],
			],
		] );
		$this->assertSame( 'day', $screen['tabs'][0]['panels'][0]['fields'][1]['fields'][0]['id'] );
	}

	public function test_a_valid_repeater_gets_sub_field_defaults_filled_in(): void {
		$screen = Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [
				[ 'id' => 'label', 'kind' => 'text', 'label' => 'Label' ],
			],
		] ) );
		$sub = $screen['tabs'][0]['panels'][0]['fields'][0]['fields'][0];
		$this->assertArrayHasKey( 'help', $sub );
		$this->assertArrayHasKey( 'required', $sub );
		$this->assertArrayHasKey( 'capability', $sub );
		$this->assertArrayHasKey( 'locked_help', $sub );
	}

	public function test_two_tabs_with_the_same_id_are_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [] ],
				[ 'id' => 'details', 'label' => 'Details again', 'panels' => [] ],
			],
		] );
	}

	public function test_two_panels_with_the_same_id_in_different_tabs_are_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [] ],
				] ],
				[ 'id' => 'more', 'label' => 'More', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics again', 'fields' => [] ],
				] ],
			],
		] );
	}

	public function test_a_dependency_on_an_unknown_field_is_rejected_naming_both_ids(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( '"announce_text" on the "club-pages" editor screen depends on "announce", which is not a field on the "club-pages" editor screen' );
		Schema::validate( [
			'slug'      => 'club-pages',
			'title'     => 'Club pages',
			'post_type' => 'bw_club_page',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[
							'id'         => 'announce_text',
							'kind'       => 'text',
							'label'      => 'Announcement',
							'depends_on' => [ 'field' => 'announce', 'value' => true ],
						],
					] ],
				] ],
			],
		] );
	}

	public function test_a_dependency_on_a_field_declared_later_is_accepted(): void {
		$screen = Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[
							'id'         => 'announce_text',
							'kind'       => 'text',
							'label'      => 'Announcement',
							'depends_on' => [ 'field' => 'announce', 'value' => true ],
						],
					] ],
					[ 'id' => 'more', 'title' => 'More', 'fields' => [
						[ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ],
					] ],
				] ],
			],
		] );
		$this->assertSame( 'announce', $screen['tabs'][0]['panels'][0]['fields'][0]['depends_on']['field'] );
	}

	public function test_a_repeater_sub_field_depending_on_a_top_level_field_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
						[
							'id'     => 'days',
							'kind'   => 'repeater',
							'label'  => 'Days',
							'fields' => [
								[
									'id'         => 'label',
									'kind'       => 'text',
									'label'      => 'Label',
									'depends_on' => [ 'field' => 'name', 'value' => true ],
								],
							],
						],
					] ],
				] ],
			],
		] );
	}

	public function test_a_record_screen_cannot_use_the_reserved_publish_tab_id(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'reserved for the Publish and settings tab' );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'publish', 'label' => 'Publish', 'panels' => [] ],
			],
		] );
	}

	public function test_a_record_screen_cannot_use_a_reserved_panel_id(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'reserved for the Publish and settings tab' );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'status', 'title' => 'Status', 'fields' => [] ],
				] ],
			],
		] );
	}

	public function test_a_settings_screen_may_use_ids_reserved_for_the_publish_tab(): void {
		$screen = Schema::validate( [
			'slug'        => 'general',
			'title'       => 'General settings',
			'store'       => 'option',
			'option_name' => 'bw_general',
			'tabs'        => [
				[ 'id' => 'publish', 'label' => 'Publish', 'panels' => [
					[ 'id' => 'status', 'title' => 'Status', 'fields' => [] ],
				] ],
			],
		] );
		$this->assertSame( 'publish', $screen['tabs'][0]['id'] );
	}

	public function test_a_record_screen_cannot_use_a_reserved_field_id(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'reserved for the Publish and settings tab' );
		Schema::validate( $this->screen( [ 'id' => 'post_status', 'kind' => 'text', 'label' => 'Status' ] ) );
	}

	public function test_a_record_screen_cannot_use_a_reserved_field_id_inside_a_repeater(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'reserved for the Publish and settings tab' );
		Schema::validate( $this->screen( [
			'id'     => 'sessions',
			'kind'   => 'repeater',
			'label'  => 'Sessions',
			'fields' => [ [ 'id' => 'menu_order', 'kind' => 'number', 'label' => 'Order' ] ],
		] ) );
	}

	/**
	 * The library routes post_title and post_content to the post's own
	 * columns, so a record screen editing either declares it as an ordinary
	 * field — that is how a record gets a title at all.
	 */
	public function test_a_record_screen_may_edit_the_records_own_title_and_body(): void {
		$screen = Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'post_title', 'kind' => 'title', 'label' => 'Name' ],
						[ 'id' => 'post_content', 'kind' => 'richtext', 'label' => 'Body' ],
					] ],
				] ],
			],
		] );
		$this->assertSame( [ 'post_title', 'post_content' ], array_column( $screen['tabs'][0]['panels'][0]['fields'], 'id' ) );
	}

	/**
	 * Inside a repeater the same ids mean nothing: a row's cells are stored
	 * nested, so a cell called post_title reads as if it set the record's
	 * title and sets nothing at all.
	 */
	public function test_a_repeater_cell_cannot_be_called_post_title(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'post_title' );
		Schema::validate( $this->screen( [
			'id'     => 'sessions',
			'kind'   => 'repeater',
			'label'  => 'Sessions',
			'fields' => [ [ 'id' => 'post_title', 'kind' => 'text', 'label' => 'Title' ] ],
		] ) );
	}

	public function test_a_settings_screen_may_use_a_field_id_reserved_for_the_publish_tab(): void {
		$screen = Schema::validate( [
			'slug'        => 'general',
			'title'       => 'General settings',
			'store'       => 'option',
			'option_name' => 'bw_general',
			'tabs'        => [
				[ 'id' => 'general', 'label' => 'General', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'post_status', 'kind' => 'text', 'label' => 'Status' ],
					] ],
				] ],
			],
		] );
		$this->assertSame( 'post_status', $screen['tabs'][0]['panels'][0]['fields'][0]['id'] );
	}

	public function test_a_hideable_panel_gains_its_own_shown_switch_field(): void {
		$screen = Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'hideable' => true, 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
					] ],
				] ],
			],
		] );
		$fields = $screen['tabs'][0]['panels'][0]['fields'];
		$this->assertCount( 2, $fields );
		$this->assertSame( 'basics__shown', $fields[1]['id'] );
		$this->assertSame( 'toggle', $fields[1]['kind'] );
		$this->assertTrue( $fields[1]['panel_switch'] );
	}

	public function test_a_non_hideable_panel_gains_no_shown_switch_field(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$fields = $screen['tabs'][0]['panels'][0]['fields'];
		$this->assertCount( 1, $fields );
		$this->assertArrayNotHasKey( 'panel_switch', $fields[0] );
	}

	public function test_the_shown_switch_field_id_follows_the_panel_id(): void {
		$screen = Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'promo', 'title' => 'Promo', 'hideable' => true, 'fields' => [] ],
				] ],
			],
		] );
		$this->assertSame( 'promo__shown', $screen['tabs'][0]['panels'][0]['fields'][0]['id'] );
	}

	public function test_a_plugin_field_ending_in_shown_on_a_hideable_panel_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'reserved for a hideable panel' );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'hideable' => true, 'fields' => [
						[ 'id' => 'basics__shown', 'kind' => 'toggle', 'label' => 'Custom' ],
					] ],
				] ],
			],
		] );
	}

	public function test_a_field_ending_in_shown_on_a_non_hideable_panel_is_accepted(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'custom__shown', 'kind' => 'toggle', 'label' => 'Custom' ] ) );
		$this->assertSame( 'custom__shown', $screen['tabs'][0]['panels'][0]['fields'][0]['id'] );
	}

	public function test_a_toggle_defaults_to_false(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ] ) );
		$this->assertSame( false, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_number_defaults_to_zero(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats' ] ) );
		$this->assertSame( 0, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_tokens_default_to_an_empty_array(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'ages', 'kind' => 'tokens', 'label' => 'Ages' ] ) );
		$this->assertSame( [], $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_text_field_defaults_to_an_empty_string(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );
		$this->assertSame( '', $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_field_may_declare_its_own_default_instead_of_the_kinds(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats', 'default' => 20 ] ) );
		$this->assertSame( 20, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_the_panel_switch_field_defaults_to_shown(): void {
		$screen = Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'promo', 'title' => 'Promo', 'hideable' => true, 'fields' => [] ],
				] ],
			],
		] );
		$this->assertSame( true, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_declared_default_matching_its_kind_is_accepted(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce', 'default' => true ] ) );
		$this->assertSame( true, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_declared_default_of_the_wrong_type_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( '"announce" on the "sports" editor screen declares a default that is not a boolean, which a "toggle" field needs' );
		Schema::validate( $this->screen( [ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce', 'default' => '1' ] ) );
	}

	public function test_a_declared_default_of_the_wrong_type_is_rejected_for_an_array_kind(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'not an array, which a "tokens" field needs' );
		Schema::validate( $this->screen( [ 'id' => 'ages', 'kind' => 'tokens', 'label' => 'Ages', 'default' => '' ] ) );
	}

	public function test_a_number_fields_own_default_respects_its_declared_min(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats', 'min' => 5 ] ) );
		$this->assertSame( 5, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_range_fields_own_default_respects_a_declared_max_below_zero(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'balance', 'kind' => 'range', 'label' => 'Balance', 'max' => -3 ] ) );
		$this->assertSame( -3, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_number_fields_default_is_unaffected_by_a_range_straddling_zero(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats', 'min' => -10, 'max' => 10 ] ) );
		$this->assertSame( 0, $screen['tabs'][0]['panels'][0]['fields'][0]['default'] );
	}

	public function test_a_gantt_field_is_accepted_and_defaults_to_an_empty_list(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'timeline', 'kind' => 'gantt', 'label' => 'Project timeline' ] ) );
		$field  = $screen['tabs'][0]['panels'][0]['fields'][0];
		$this->assertSame( 'gantt', $field['kind'] );
		$this->assertSame( [], $field['default'] );
		$this->assertTrue( $field['wide'], 'a gantt is never half a row' );
	}

	public function test_a_gantt_cannot_live_inside_a_repeater(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'repeater row can only hold' );
		Schema::validate( $this->screen( [
			'id'     => 'rows',
			'kind'   => 'repeater',
			'label'  => 'Rows',
			'fields' => [ [ 'id' => 'chart', 'kind' => 'gantt', 'label' => 'Chart' ] ],
		] ) );
	}
	public function test_a_gantt_counts_its_dates_from_today_unless_given_an_origin(): void {
		$screen = Schema::validate( $this->screen( [ 'id' => 'timeline', 'kind' => 'gantt', 'label' => 'Project timeline' ] ) );
		$this->assertSame( '', $screen['tabs'][0]['panels'][0]['fields'][0]['origin'] );

		$screen = Schema::validate( $this->screen( [ 'id' => 'timeline', 'kind' => 'gantt', 'label' => 'Project timeline', 'origin' => '2026-09-01' ] ) );
		$this->assertSame( '2026-09-01', $screen['tabs'][0]['panels'][0]['fields'][0]['origin'] );
	}
	private function estimateRepeater( array $extra = [] ): array {
		return array_merge( [
			'id'     => 'items',
			'kind'   => 'repeater',
			'label'  => 'Line items',
			'fields' => [
				[ 'id' => 'title', 'kind' => 'text', 'label' => 'Work item' ],
				[ 'id' => 'phase', 'kind' => 'select', 'label' => 'Phase', 'options' => [ [ 'value' => 'discovery', 'label' => 'Discovery' ] ] ],
				[ 'id' => 'hours', 'kind' => 'number', 'label' => 'Hours' ],
			],
		], $extra );
	}

	public function test_a_repeater_may_group_by_one_of_its_own_select_cells(): void {
		$screen = Schema::validate( $this->screen( $this->estimateRepeater( [
			'group_by'    => 'phase',
			'subtotal_of' => 'hours',
		] ) ) );
		$field = $screen['tabs'][0]['panels'][0]['fields'][0];

		$this->assertSame( 'phase', $field['group_by'] );
		$this->assertSame( 'hours', $field['subtotal_of'] );
		$this->assertSame( 'Ungrouped', $field['group_empty_label'] );
		$this->assertSame( '', $field['subtotal_suffix'] );
	}

	public function test_a_repeater_that_groups_nothing_still_answers_for_the_option(): void {
		$screen = Schema::validate( $this->screen( $this->estimateRepeater() ) );
		$field  = $screen['tabs'][0]['panels'][0]['fields'][0];

		$this->assertSame( '', $field['group_by'] );
		$this->assertSame( '', $field['subtotal_of'] );
	}

	public function test_grouping_by_a_cell_that_is_not_there_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'group_by' );
		Schema::validate( $this->screen( $this->estimateRepeater( [ 'group_by' => 'nope' ] ) ) );
	}

	public function test_grouping_by_a_cell_that_is_not_a_select_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'has to be a "select" cell' );
		Schema::validate( $this->screen( $this->estimateRepeater( [ 'group_by' => 'title' ] ) ) );
	}

	public function test_subtotalling_a_cell_that_is_not_a_number_is_rejected(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'has to be a "number" cell' );
		Schema::validate( $this->screen( $this->estimateRepeater( [ 'subtotal_of' => 'title' ] ) ) );
	}
}
