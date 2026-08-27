<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Capabilities;
use Blueworx\PageEditor\v1\Schema;

final class CapabilitiesTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	private function screen(): array {
		return Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'tabs'      => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
						[ 'id' => 'fee', 'kind' => 'number', 'label' => 'Fee', 'capability' => 'manage_woocommerce' ],
						[ 'id' => 'note', 'kind' => 'text', 'label' => 'Note', 'capability' => 'edit_others_posts', 'locked_help' => 'Only an editor can change this.' ],
					] ],
				] ],
			],
		] );
	}

	public function test_a_field_the_user_cannot_change_is_removed(): void {
		$out = Capabilities::filterSchema( $this->screen() );
		$ids = array_column( $out['tabs'][0]['panels'][0]['fields'], 'id' );
		// 'fee' has no locked_help, so it is dropped entirely. 'note' has
		// locked_help, so it is kept but locked (see the next test).
		$this->assertSame( [ 'name', 'note' ], $ids );
	}

	public function test_a_field_with_locked_help_is_kept_but_locked(): void {
		$GLOBALS['bwpe_stub']['capabilities'] = [];
		$out    = Capabilities::filterSchema( $this->screen() );
		$fields = $out['tabs'][0]['panels'][0]['fields'];
		$this->assertCount( 2, $fields );
		$this->assertSame( 'note', $fields[1]['id'] );
		$this->assertTrue( $fields[1]['readonly'] );
		$this->assertSame( 'Only an editor can change this.', $fields[1]['help'] );

		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_woocommerce' ];
		$out    = Capabilities::filterSchema( $this->screen() );
		$ids    = array_column( $out['tabs'][0]['panels'][0]['fields'], 'id' );
		$this->assertSame( [ 'name', 'fee', 'note' ], $ids );
	}

	public function test_values_for_forbidden_fields_are_dropped_on_the_way_in(): void {
		$values = Capabilities::filterValues( $this->screen(), [ 'name' => 'Rugby', 'fee' => 40 ] );
		$this->assertSame( [ 'name' => 'Rugby' ], $values );
	}

	public function test_an_empty_capability_means_the_screen_capability_governs(): void {
		$allowed = Capabilities::allowed( $this->screen() );
		$this->assertSame( [ 'name' ], $allowed );
	}

	public function test_filter_schema_works_without_schema_validate_defaults(): void {
		$screen = [
			'tabs' => [
				[ 'id' => 'details', 'label' => 'Details', 'panels' => [
					[ 'id' => 'basics', 'title' => 'Basics', 'fields' => [
						[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
					] ],
				] ],
			],
		];
		$out = Capabilities::filterSchema( $screen );
		$ids = array_column( $out['tabs'][0]['panels'][0]['fields'], 'id' );
		$this->assertSame( [ 'name' ], $ids );
	}
}
