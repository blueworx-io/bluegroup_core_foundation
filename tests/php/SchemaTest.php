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
		$this->expectExceptionMessage( 'toggle' );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [ [ 'id' => 'on', 'kind' => 'toggle', 'label' => 'On' ] ],
		] ) );
	}

	public function test_a_rejected_repeater_sub_field_names_what_a_row_may_hold(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'text, number' );
		Schema::validate( $this->screen( [
			'id'     => 'days',
			'kind'   => 'repeater',
			'label'  => 'Days',
			'fields' => [ [ 'id' => 'venue', 'kind' => 'select', 'label' => 'Venue', 'options' => [ [ 'value' => 'a', 'label' => 'A' ] ] ] ],
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
}
