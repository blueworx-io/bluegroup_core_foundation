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
}
