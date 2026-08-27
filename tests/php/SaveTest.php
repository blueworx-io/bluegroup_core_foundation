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

	public function test_load_values_includes_every_settings_field_not_just_the_plugins_own(): void {
		$values = Editor::load( 'sports', 7 )['values'];
		$this->assertArrayHasKey( 'post_status', $values );
		$this->assertArrayHasKey( 'post_name', $values );
		$this->assertArrayHasKey( 'post_tags', $values );
		$this->assertArrayHasKey( 'featured_image', $values );
	}

	public function test_a_settings_field_round_trips_through_save_and_load(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'post_status' => 'publish' ], 7 );
		$loaded = Editor::load( 'sports', 7 );
		$this->assertSame( 'publish', $loaded['values']['post_status'] );
	}

	public function test_a_core_column_is_written_through_wp_update_post_not_meta(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'post_status' => 'publish' ], 7 );
		$this->assertArrayNotHasKey( 'bw_sport_post_status', $GLOBALS['bwpe_stub']['meta'][7] ?? [] );
		$this->assertSame( 'publish', $GLOBALS['bwpe_stub']['posts'][7]['post_status'] );
	}

	public function test_tags_and_the_featured_image_go_through_their_own_functions(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'post_tags' => [ 'Rugby', 'Union' ], 'featured_image' => 3 ], 7 );
		$this->assertSame( [ 'Rugby', 'Union' ], $GLOBALS['bwpe_stub']['terms'][7]['post_tag'] );
		$this->assertSame( 3, $GLOBALS['bwpe_stub']['thumbnails'][7] );
		$this->assertArrayNotHasKey( 'bw_sport_post_tags', $GLOBALS['bwpe_stub']['meta'][7] ?? [] );
		$this->assertArrayNotHasKey( 'bw_sport_featured_image', $GLOBALS['bwpe_stub']['meta'][7] ?? [] );
	}

	public function test_a_plugin_field_and_a_settings_field_save_together(): void {
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'post_status' => 'publish' ], 7 );
		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_name'] );
		$this->assertSame( 'publish', $GLOBALS['bwpe_stub']['posts'][7]['post_status'] );
	}

	public function test_resaving_an_unchanged_record_reports_ok(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$this->assertTrue( $result['ok'] );
	}

	public function test_one_changed_field_alongside_one_unchanged_field_reports_ok(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co' ], 7 );
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'contact' => 'other@coastalbloom.co' ], 7 );
		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'other@coastalbloom.co', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_contact'] );
	}

	public function test_a_genuine_failure_stops_at_the_first_one_and_does_not_claim_nothing_saved(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co' ], 7 );
		$GLOBALS['bwpe_stub']['fail_writes'] = true;
		$result = Editor::save( 'sports', [ 'name' => 'Hockey', 'contact' => 'other@coastalbloom.co' ], 7 );

		$this->assertFalse( $result['ok'] );
		$this->assertStringNotContainsString( 'Nothing was changed', $result['errors']['_screen'] );
		$this->assertStringContainsString( 'may not', $result['errors']['_screen'] );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][7]['bw_sport_name'], 'the write stopped before this could be overwritten' );
	}
}
