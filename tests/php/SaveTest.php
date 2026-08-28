<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;
use Blueworx\PageEditor\v1\Settings;

final class SaveTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		// publish_posts, because the Publish tab's status field now asks for
		// it — wp_update_post() does no capability checking of its own, so
		// without it the screen would let anyone holding the screen's own
		// capability publish a record.
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options', 'publish_posts' ];
		// Editor::load()/save() now check the id resolves to a real post of
		// this screen's own post type before doing anything else — see
		// PostTypeGuardTest. Every test in this file edits post 7, so it
		// needs to exist as a bw_sport post for that check to pass.
		$GLOBALS['bwpe_stub']['posts'][7]    = [ 'post_type' => 'bw_sport' ];

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

	public function test_load_values_has_an_entry_for_every_field_in_the_settings_tab(): void {
		$values = Editor::load( 'sports', 7 )['values'];

		foreach ( Settings::tab( [ 'store' => 'post', 'slug' => 'sports' ] )['panels'] as $panel ) {
			foreach ( $panel['fields'] as $field ) {
				$this->assertArrayHasKey(
					$field['id'],
					$values,
					sprintf( '"%s" is on the settings tab but load() gave no value for it.', $field['id'] )
				);
			}
		}

		$this->assertArrayHasKey( 'post_author', $values, 'a locked field still needs its value on the way out' );
	}

	public function test_a_locked_field_arrives_with_its_value_on_load(): void {
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport', 'post_author' => 9 ];
		$loaded = Editor::load( 'sports', 7 );

		$this->assertSame( 9, $loaded['values']['post_author'] );
		$readonly = array_column( $loaded['schema']['tabs'][1]['panels'][0]['fields'], 'readonly', 'id' );
		$this->assertTrue( $readonly['post_author'], 'the field is shown, but read-only' );
	}

	public function test_a_locked_field_is_still_dropped_on_save(): void {
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport', 'post_author' => 9 ];
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'post_author' => 5 ], 7 );

		$this->assertTrue( $result['ok'] );
		$this->assertSame( 9, $GLOBALS['bwpe_stub']['posts'][7]['post_author'], 'a read-only field must never be written' );
		$this->assertSame( 9, $result['values']['post_author'], 'what comes back is what is stored, never what was sent' );
	}

	/**
	 * The browser replaces its whole record with whatever save() hands back,
	 * so anything missing from that reply empties on the screen. A read-only
	 * field is rightly filtered out of what gets written, but it must still
	 * come back with its value or every locked field blanks after a save —
	 * and the screen then reads clean.
	 */
	public function test_a_locked_field_still_has_its_value_in_what_save_returns(): void {
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport', 'post_author' => 9 ];
		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );

		$this->assertTrue( $result['ok'] );
		$this->assertArrayHasKey( 'post_author', $result['values'] );
		$this->assertSame( 9, $result['values']['post_author'] );
	}

	/**
	 * Values are filtered by capability before they are validated, so a field
	 * this user may not write always arrives empty. Validating it against the
	 * screen as declared makes a required one impossible to satisfy: the save
	 * fails for ever, naming a control the screen renders read-only.
	 */
	public function test_a_required_field_the_user_may_not_write_does_not_block_the_save(): void {
		Editor::register( [
			'slug' => 'gated', 'title' => 'Gated', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
					[
						'id'          => 'fee',
						'kind'        => 'text',
						'label'       => 'Fee',
						'required'    => true,
						'capability'  => 'manage_woocommerce',
						'locked_help' => 'Only a shop manager can change the fee.',
					],
				] ],
			] ] ],
		] );

		$result = Editor::save( 'gated', [ 'name' => 'Rugby' ], 7 );

		$this->assertTrue( $result['ok'], 'a field this user cannot write must not be validated against them' );
		$this->assertArrayNotHasKey( 'fee', $result['errors'] ?? [] );
	}

	/**
	 * The record's own title and body are columns on the post, not meta. A
	 * screen that declared them got neither: the values went into post meta
	 * nobody reads, and the record showed as "(no title)" in wp-admin.
	 */
	public function test_the_records_title_and_body_are_written_to_the_post_not_to_meta(): void {
		Editor::register( [
			'slug' => 'titled', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'post_title', 'kind' => 'title', 'label' => 'Name' ],
					[ 'id' => 'post_content', 'kind' => 'richtext', 'label' => 'Body' ],
				] ],
			] ] ],
		] );

		$result = Editor::save( 'titled', [ 'post_title' => 'Rugby union', 'post_content' => '<p>Every Tuesday.</p>' ], 7 );

		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'Rugby union', $GLOBALS['bwpe_stub']['posts'][7]['post_title'] );
		$this->assertSame( '<p>Every Tuesday.</p>', $GLOBALS['bwpe_stub']['posts'][7]['post_content'] );
		$this->assertArrayNotHasKey( 'bw_sport_post_title', $GLOBALS['bwpe_stub']['meta'][7] ?? [] );
		$this->assertArrayNotHasKey( 'bw_sport_post_content', $GLOBALS['bwpe_stub']['meta'][7] ?? [] );
		$this->assertSame( 'Rugby union', Editor::load( 'titled', 7 )['values']['post_title'] );
	}

	/**
	 * wp_update_post() checks nothing itself, so the only thing standing
	 * between a user holding the screen's capability and a published record
	 * is the capability the status field declares.
	 */
	public function test_a_user_who_cannot_publish_never_changes_the_status(): void {
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$GLOBALS['bwpe_stub']['posts'][7]     = [ 'post_type' => 'bw_sport', 'post_status' => 'draft' ];

		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'post_status' => 'publish' ], 7 );

		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'draft', $GLOBALS['bwpe_stub']['posts'][7]['post_status'] );
	}

	public function test_a_user_who_cannot_publish_still_sees_the_status_read_only(): void {
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$loaded   = Editor::load( 'sports', 7 );
		$tabs     = $loaded['schema']['tabs'];
		$readonly = array_column( end( $tabs )['panels'][0]['fields'], 'readonly', 'id' );

		$this->assertTrue( $readonly['post_status'] );
	}

	public function test_resaving_an_unchanged_featured_image_reports_ok(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'featured_image' => 3 ], 7 );
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'featured_image' => 3 ], 7 );

		$this->assertTrue( $result['ok'] );
		$this->assertSame( 3, $GLOBALS['bwpe_stub']['thumbnails'][7] );
	}

	public function test_comment_status_round_trips_as_a_bool_through_an_open_closed_column(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'comment_status' => true ], 7 );
		$this->assertSame( 'open', $GLOBALS['bwpe_stub']['posts'][7]['comment_status'] );
		$this->assertTrue( Editor::load( 'sports', 7 )['values']['comment_status'] );

		Editor::save( 'sports', [ 'name' => 'Rugby', 'comment_status' => false ], 7 );
		$this->assertSame( 'closed', $GLOBALS['bwpe_stub']['posts'][7]['comment_status'] );
		$this->assertFalse( Editor::load( 'sports', 7 )['values']['comment_status'] );
	}

	public function test_post_date_round_trips_through_the_mysql_format(): void {
		Editor::save( 'sports', [ 'name' => 'Rugby', 'post_date' => '2026-03-04T09:30' ], 7 );

		$this->assertSame( '2026-03-04 09:30:00', $GLOBALS['bwpe_stub']['posts'][7]['post_date'] );
		$this->assertSame( '2026-03-04T09:30', Editor::load( 'sports', 7 )['values']['post_date'] );
	}

	public function test_an_empty_post_date_leaves_the_stored_date_alone(): void {
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport', 'post_date' => '2026-03-04 09:30:00' ];
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'post_status' => 'publish', 'post_date' => '' ], 7 );

		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'publish', $GLOBALS['bwpe_stub']['posts'][7]['post_status'] );
		$this->assertSame(
			'2026-03-04 09:30:00',
			$GLOBALS['bwpe_stub']['posts'][7]['post_date'],
			'an empty date resets the publish date to now, so the key must be left out entirely'
		);
	}

	public function test_a_zeroed_post_date_reads_back_as_empty(): void {
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport', 'post_date' => '0000-00-00 00:00:00' ];
		$this->assertSame( '', Editor::load( 'sports', 7 )['values']['post_date'] );
	}

	public function test_a_term_write_that_returns_a_wp_error_is_reported_as_a_failure(): void {
		$GLOBALS['bwpe_stub']['fail_key'] = 'post_tag';
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'post_tags' => [ 'Union' ] ], 7 );

		$this->assertFalse( $result['ok'], 'wp_set_post_terms() reports failure as a WP_Error, which is truthy' );
		$this->assertArrayHasKey( '_screen', $result['errors'] );
	}

	public function test_a_settings_screen_resaved_unchanged_reports_ok(): void {
		Editor::register( [
			'slug' => 'club-pages', 'title' => 'Club pages', 'store' => 'option', 'option_name' => 'bw_club_pages',
			'tabs' => [ [ 'id' => 'g', 'label' => 'Global', 'panels' => [
				[ 'id' => 'h', 'title' => 'Header', 'fields' => [ [ 'id' => 'menu_label', 'kind' => 'text', 'label' => 'Menu label' ] ] ],
			] ] ],
		] );

		Editor::save( 'club-pages', [ 'menu_label' => 'Menu' ] );
		$result = Editor::save( 'club-pages', [ 'menu_label' => 'Menu' ] );

		$this->assertTrue( $result['ok'] );
		$this->assertSame( 'Menu', $GLOBALS['bwpe_stub']['options']['bw_club_pages']['menu_label'] );
	}

	public function test_a_failed_write_never_reaches_the_fields_after_it(): void {
		$GLOBALS['bwpe_stub']['fail_key'] = 'bw_sport_name';
		$result = Editor::save( 'sports', [ 'name' => 'Rugby', 'contact' => 'dan@coastalbloom.co' ], 7 );

		$this->assertFalse( $result['ok'] );
		$this->assertArrayNotHasKey( 'bw_sport_name', $GLOBALS['bwpe_stub']['meta'][7] ?? [] );
		$this->assertArrayNotHasKey(
			'bw_sport_contact',
			$GLOBALS['bwpe_stub']['meta'][7] ?? [],
			'the save stopped at the first failure, so the field after it was never attempted'
		);
	}

	public function test_a_hideable_panels_shown_switch_round_trips_through_save_and_load(): void {
		Editor::register( [
			'slug' => 'clubs', 'title' => 'Edit club', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'promo', 'title' => 'Promo', 'hideable' => true, 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
				] ],
			] ] ],
		] );

		$result = Editor::save( 'clubs', [ 'name' => 'Rugby', 'promo__shown' => false ], 7 );
		$this->assertTrue( $result['ok'] );
		$this->assertFalse( Editor::load( 'clubs', 7 )['values']['promo__shown'], 'the switch value must survive a save, not be dropped as an undeclared field' );

		Editor::save( 'clubs', [ 'name' => 'Rugby', 'promo__shown' => true ], 7 );
		$this->assertTrue( Editor::load( 'clubs', 7 )['values']['promo__shown'] );
	}

	/**
	 * get_post_meta() only ever hands back the text form of a bool ('1' or
	 * ''), never the PHP bool Sanitise produced, so the no-op pre-check in
	 * Store::writeMeta() has to compare against that text form too — or an
	 * unchanged toggle looks different from what is stored every time, and
	 * a resave of a value nobody changed is wrongly reported as failed.
	 */
	public function test_resaving_an_unchanged_toggle_field_reports_ok(): void {
		Editor::register( [
			'slug' => 'announce-test', 'title' => 'Announce test', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
					[ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ],
				] ],
			] ] ],
		] );

		Editor::save( 'announce-test', [ 'name' => 'Rugby', 'announce' => true ], 7 );
		$result = Editor::save( 'announce-test', [ 'name' => 'Rugby', 'announce' => true ], 7 );

		$this->assertTrue( $result['ok'] );
	}
}
