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
}
