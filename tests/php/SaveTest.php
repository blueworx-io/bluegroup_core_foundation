<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class SaveTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];

		Editor::register( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name', 'required' => true ],
					[ 'id' => 'contact', 'kind' => 'text', 'label' => 'Contact email', 'format' => 'email' ],
					[ 'id' => 'fee', 'kind' => 'number', 'label' => 'Fee', 'capability' => 'manage_woocommerce' ],
				] ],
			] ] ],
		] );
	}

	public function test_a_valid_save_writes_and_reports_ok(): void {
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co' ], 7 );
		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_name'] );
	}

	public function test_an_invalid_save_writes_nothing_at_all(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$result = Editor::save( 'sports', [ 'name' => 'Hockey', 'contact' => 'dan' ], 7 );

		$this->assertFalse( $result['ok'] );
		$this->assertArrayHasKey( 'contact', $result['errors'] );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_name'], 'the earlier value must survive a failed save' );
	}

	public function test_a_value_the_user_may_not_write_is_ignored_silently(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'fee' => 40 ], 7 );
		$this->assertArrayNotHasKey( 'bw_sport_fee', $GLOBALS['bwpe_stub']['meta'][7] );
	}

	public function test_load_returns_a_schema_already_filtered_by_capability(): void {
		$loaded = Editor::load( 'sports', 7 );
		$ids    = array_column( $loaded['schema']['tabs'][0]['panels'][0]['fields'], 'id' );
		$this->assertSame( [ 'name', 'contact' ], $ids );
		$this->assertArrayNotHasKey( 'fee', $loaded['values'] );
	}

	public function test_saving_a_screen_that_is_not_ready_fails_with_its_reason(): void {
		$GLOBALS['bwpe_stub']['post_types'] = [];
		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$this->assertFalse( $result['ok'] );
		$this->assertStringContainsString( 'bw_sport', $result['errors']['_screen'] );
	}

	public function test_a_write_that_fails_reports_the_whole_save_failed(): void {
		$GLOBALS['bwpe_stub']['fail_writes'] = true;
		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$this->assertFalse( $result['ok'] );
		$this->assertArrayHasKey( '_screen', $result['errors'] );
		$this->assertStringContainsString( 'saved', $result['errors']['_screen'] );
		$this->assertArrayNotHasKey( 7, $GLOBALS['bwpe_stub']['meta'] );
	}
}
