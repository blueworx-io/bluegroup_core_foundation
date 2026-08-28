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

	public function test_a_value_for_a_kept_but_locked_field_is_still_dropped(): void {
		// 'note' is shown on the screen, read-only, once capability is missing.
		// Being visible must not make it writable: a submitted value for it is
		// refused exactly like a field that never reached the browser at all.
		$values = Capabilities::filterValues( $this->screen(), [ 'name' => 'Rugby', 'note' => 'Forged' ] );
		$this->assertSame( [ 'name' => 'Rugby' ], $values );
	}

	public function test_an_empty_capability_means_the_screen_capability_governs(): void {
		$allowed = Capabilities::allowed( $this->screen() );
		$this->assertSame( [ 'name' ], $allowed );
	}

	/**
	 * Pins the three callers to one rule. The strict-superset assertion is the
	 * point: the moment the shown set and the writable set become equal, a
	 * locked field has become writable, and this says so.
	 */
	public function test_the_shown_set_and_the_writable_set_stay_in_step(): void {
		$screen = $this->screen();
		$kept   = array_column( Capabilities::filterSchema( $screen )['tabs'][0]['panels'][0]['fields'], 'id' );

		$shown    = Capabilities::visible( $screen );
		$writable = Capabilities::allowed( $screen );

		$this->assertSame( $shown, $kept, 'filterSchema() must keep exactly the fields visible() names' );
		$this->assertSame( [ 'name', 'note' ], $shown );
		$this->assertSame( [ 'name' ], $writable );
		$this->assertSame( [], array_values( array_diff( $writable, $shown ) ), 'nothing writable may be hidden from the screen' );
		$this->assertSame( [ 'note' ], array_values( array_diff( $shown, $writable ) ), 'a locked field is shown and never writable' );
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
