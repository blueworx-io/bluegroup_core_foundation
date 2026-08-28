<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;
use Blueworx\PageEditor\v1\Settings;
use Blueworx\PageEditor\v1\Store;

final class StoreTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
	}

	private function postScreen(): array {
		return Schema::validate( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
			] ] ],
		] );
	}

	public function test_a_record_round_trips_through_post_meta(): void {
		$store = Store::for( $this->postScreen() );
		$store->write( [ 'name' => 'Rugby' ], 12 );
		$this->assertSame( [ 'name' => 'Rugby' ], $store->read( 12 ) );
		$this->assertSame( 'Rugby', $GLOBALS['bwpe_stub']['meta'][12]['bw_sport_name'] );
	}

	public function test_a_settings_screen_round_trips_through_one_option(): void {
		$screen = Schema::validate( [
			'slug' => 'club-pages', 'title' => 'Club pages', 'store' => 'option', 'option_name' => 'bw_club_pages',
			'tabs' => [ [ 'id' => 'g', 'label' => 'Global', 'panels' => [
				[ 'id' => 'h', 'title' => 'Header', 'fields' => [ [ 'id' => 'menu_label', 'kind' => 'text', 'label' => 'Menu label' ] ] ],
			] ] ],
		] );
		$store = Store::for( $screen );
		$store->write( [ 'menu_label' => 'Menu' ] );
		$this->assertSame( [ 'menu_label' => 'Menu' ], $store->read() );
	}

	public function test_a_field_never_saved_reads_back_as_empty_not_missing(): void {
		$store = Store::for( $this->postScreen() );
		$this->assertSame( [ 'name' => '' ], $store->read( 99 ) );
	}

	private function fieldScreen( array $field ): array {
		return Schema::validate( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ $field ] ],
			] ] ],
		] );
	}

	private function optionFieldScreen( array $field ): array {
		return Schema::validate( [
			'slug' => 'settings', 'title' => 'Settings', 'store' => 'option', 'option_name' => 'bw_settings',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ $field ] ],
			] ] ],
		] );
	}

	/**
	 * WordPress post meta is a text column: a bool written as post meta reads
	 * back as the string '1' or '', not the PHP bool that went in. This is
	 * the fix that stops that string being mistaken for "shown", the bug the
	 * panel switch was silently carrying.
	 */
	public function test_a_toggle_round_trips_as_a_real_boolean_not_a_string(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ] ) );

		$store->write( [ 'announce' => false ], 1 );
		$this->assertSame( false, $store->read( 1 )['announce'] );

		$store->write( [ 'announce' => true ], 1 );
		$this->assertSame( true, $store->read( 1 )['announce'] );
	}

	public function test_a_number_field_round_trips_as_a_real_integer(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats' ] ) );
		$store->write( [ 'seats' => 5 ], 1 );
		$this->assertSame( 5, $store->read( 1 )['seats'] );
	}

	public function test_a_range_field_round_trips_as_a_real_integer(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'volume', 'kind' => 'range', 'label' => 'Volume' ] ) );
		$store->write( [ 'volume' => 7 ], 1 );
		$this->assertSame( 7, $store->read( 1 )['volume'] );
	}

	public function test_a_media_field_round_trips_as_a_real_integer(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'photo', 'kind' => 'media', 'label' => 'Photo' ] ) );
		$store->write( [ 'photo' => 42 ], 1 );
		$this->assertSame( 42, $store->read( 1 )['photo'] );
	}

	public function test_a_file_field_round_trips_as_a_real_integer(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'doc', 'kind' => 'file', 'label' => 'Document' ] ) );
		$store->write( [ 'doc' => 3 ], 1 );
		$this->assertSame( 3, $store->read( 1 )['doc'] );
	}

	public function test_a_record_field_round_trips_as_a_real_integer(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'coach', 'kind' => 'record', 'label' => 'Coach' ] ) );
		$store->write( [ 'coach' => 8 ], 1 );
		$this->assertSame( 8, $store->read( 1 )['coach'] );
	}

	public function test_checkboxes_round_trip_as_a_real_array(): void {
		$field = [ 'id' => 'days', 'kind' => 'checkboxes', 'label' => 'Days', 'options' => [
			[ 'value' => 'mon', 'label' => 'Mon' ], [ 'value' => 'tue', 'label' => 'Tue' ],
		] ];
		$store = Store::for( $this->fieldScreen( $field ) );
		$store->write( [ 'days' => [ 'mon', 'tue' ] ], 1 );
		$this->assertSame( [ 'mon', 'tue' ], $store->read( 1 )['days'] );
	}

	public function test_checkboxes_never_saved_read_back_as_an_empty_array_not_an_empty_string(): void {
		$field = [ 'id' => 'days', 'kind' => 'checkboxes', 'label' => 'Days', 'options' => [
			[ 'value' => 'mon', 'label' => 'Mon' ],
		] ];
		$store = Store::for( $this->fieldScreen( $field ) );
		$this->assertSame( [], $store->read( 99 )['days'] );
	}

	public function test_scrolllist_round_trips_as_a_real_array(): void {
		$field = [ 'id' => 'venues', 'kind' => 'scrolllist', 'label' => 'Venues', 'options' => [
			[ 'value' => 'a', 'label' => 'A' ],
		] ];
		$store = Store::for( $this->fieldScreen( $field ) );
		$store->write( [ 'venues' => [ 'a' ] ], 1 );
		$this->assertSame( [ 'a' ], $store->read( 1 )['venues'] );
	}

	public function test_tokens_round_trip_as_a_real_array(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'ages', 'kind' => 'tokens', 'label' => 'Ages' ] ) );
		$store->write( [ 'ages' => [ 'under 12', 'under 14' ] ], 1 );
		$this->assertSame( [ 'under 12', 'under 14' ], $store->read( 1 )['ages'] );
	}

	public function test_a_repeater_round_trips_as_a_real_array(): void {
		$field = [ 'id' => 'sessions', 'kind' => 'repeater', 'label' => 'Sessions', 'fields' => [
			[ 'id' => 'day', 'kind' => 'text', 'label' => 'Day' ],
		] ];
		$store = Store::for( $this->fieldScreen( $field ) );
		$store->write( [ 'sessions' => [ [ 'day' => 'Monday' ] ] ], 1 );
		$this->assertSame( [ [ 'day' => 'Monday' ] ], $store->read( 1 )['sessions'] );
	}

	/**
	 * An option screen's own value is a single serialized array, which
	 * preserves nested types faithfully once it has been saved at least once
	 * — but a field never saved yet reads back from the bare '' default the
	 * same way a post meta field does, so it needs the same by-kind cast.
	 */
	public function test_a_toggle_on_an_option_screen_round_trips_as_a_real_boolean(): void {
		$store = Store::for( $this->optionFieldScreen( [ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ] ) );
		$store->write( [ 'announce' => true ] );
		$this->assertSame( true, $store->read()['announce'] );
	}

	public function test_a_toggle_on_an_option_screen_never_saved_reads_back_as_false_not_empty_string(): void {
		$store = Store::for( $this->optionFieldScreen( [ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce' ] ) );
		$this->assertSame( false, $store->read()['announce'] );
	}

	private function hideablePanelScreen(): array {
		return Schema::validate( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'promo', 'title' => 'Promo', 'hideable' => true, 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
				] ],
			] ] ],
		] );
	}

	/**
	 * A record nobody has touched has not had any panel hidden. Store::read()
	 * used to have no way to say that: it always emitted every declared key,
	 * so a value that was never saved was indistinguishable from one saved
	 * false, and both cast to false — collapsing every hideable panel on a
	 * brand-new record.
	 */
	public function test_a_never_saved_hideable_panel_switch_reads_back_shown(): void {
		$store = Store::for( $this->hideablePanelScreen() );
		$this->assertSame( true, $store->read( 99 )['promo__shown'] );
	}

	public function test_a_hideable_panel_switch_explicitly_saved_off_reads_back_hidden(): void {
		$store = Store::for( $this->hideablePanelScreen() );
		$store->write( [ 'name' => 'Rugby', 'promo__shown' => false ], 1 );
		$this->assertSame( false, $store->read( 1 )['promo__shown'] );
	}

	public function test_a_never_saved_number_reads_back_the_kinds_own_default(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats' ] ) );
		$this->assertSame( 0, $store->read( 99 )['seats'] );
	}

	public function test_a_never_saved_token_list_reads_back_an_empty_array(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'ages', 'kind' => 'tokens', 'label' => 'Ages' ] ) );
		$this->assertSame( [], $store->read( 99 )['ages'] );
	}

	public function test_a_field_declaring_its_own_default_gets_that_rather_than_the_kinds(): void {
		$store = Store::for( $this->fieldScreen( [ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats', 'default' => 20 ] ) );
		$this->assertSame( 20, $store->read( 99 )['seats'] );
	}

	/**
	 * post_parent, menu_order and featured_image are Settings::tab()'s own
	 * columns, reserved on a plugin's own screen — so this goes through the
	 * merged screen the way Editor::load() builds it, via
	 * Schema::normaliseTab(), rather than Schema::validate() on a bare
	 * plugin screen.
	 */
	private function screenWithSettingsTab(): array {
		$screen = Schema::validate( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
			] ] ],
		] );
		$screen['tabs'][] = Settings::tab( $screen );
		return $screen;
	}

	/**
	 * WP_Post hands every column back exactly as the database driver
	 * returned it: a numeric string, not an int, for post_parent and
	 * menu_order. castByKind() has to run on a post column's value too, not
	 * only on post meta.
	 */
	public function test_post_parent_and_menu_order_round_trip_as_real_integers(): void {
		$store = Store::for( $this->screenWithSettingsTab() );
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport', 'post_parent' => 4, 'menu_order' => 2 ];
		$values = $store->read( 7 );
		$this->assertSame( 4, $values['post_parent'] );
		$this->assertSame( 2, $values['menu_order'] );
	}

	public function test_a_never_set_featured_image_reads_back_as_zero_not_false(): void {
		$store = Store::for( $this->screenWithSettingsTab() );
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport' ];
		$this->assertSame( 0, $store->read( 7 )['featured_image'] );
	}

	/**
	 * Schema::validate() rejects a mismatched default at registration, but a
	 * hand-built screen (Task 12's settings tab, or any screen that never
	 * passed through Schema::validate()) can still carry one. Store::read()
	 * runs a default through castByKind() defensively, so this never reaches
	 * the browser raw.
	 */
	public function test_a_mismatched_default_on_a_hand_built_screen_is_still_cast_sanely(): void {
		$screen = [
			'slug' => 'sports', 'store' => 'post', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'announce', 'kind' => 'toggle', 'label' => 'Announce', 'default' => '1' ],
				] ],
			] ] ],
		];
		$store = Store::for( $screen );
		$this->assertSame( true, $store->read( 99 )['announce'] );
	}

	/** A hand-built screen may have no 'default' key at all — must not raise. */
	public function test_a_missing_default_key_on_a_hand_built_screen_reads_back_the_kinds_own_default(): void {
		$screen = [
			'slug' => 'sports', 'store' => 'post', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'seats', 'kind' => 'number', 'label' => 'Seats' ],
				] ],
			] ] ],
		];
		$store = Store::for( $screen );
		$this->assertSame( 0, $store->read( 99 )['seats'] );
	}

	/* --- A screen that owns its own storage ---------------------------------- */

	/**
	 * @param array<string,mixed> $held  Where the fake storage keeps its values.
	 * @param array<string,mixed> $extra Screen keys to override.
	 */
	private function callbackScreen( array &$held, array $extra = [] ): array {
		return Schema::validate( array_merge( [
			'slug'  => 'pages',
			'title' => 'Pages',
			'store' => 'option',
			'read'  => static function () use ( &$held ) {
				return $held;
			},
			'write' => static function ( array $values ) use ( &$held ) {
				$held = array_merge( $held, $values );
				return true;
			},
			'tabs'  => [ [ 'id' => 'v', 'label' => 'Visibility', 'panels' => [
				[ 'id' => 'p', 'title' => 'Pages', 'fields' => [
					[ 'id' => 'home', 'kind' => 'toggle', 'label' => 'Home' ],
					[ 'id' => 'about', 'kind' => 'toggle', 'label' => 'About' ],
				] ],
			] ] ],
		], $extra ) );
	}

	public function test_a_screen_may_read_and_write_its_own_values(): void {
		$held   = [];
		$screen = $this->callbackScreen( $held );
		$store  = Store::for( $screen );

		$this->assertTrue( $store->write( [ 'home' => true, 'about' => false ] ) );
		$this->assertSame( [ 'home' => true, 'about' => false ], $store->read() );
		$this->assertSame( [ 'home' => true, 'about' => false ], $held );
	}

	/** No option is written — the whole point is that the values live elsewhere. */
	public function test_owning_storage_writes_no_option(): void {
		$held  = [];
		$store = Store::for( $this->callbackScreen( $held ) );
		$store->write( [ 'home' => true ] );
		$this->assertSame( [], $GLOBALS['bwpe_stub']['options'] ?? [] );
	}

	/**
	 * A plugin reading a status out of WordPress hands back whatever WordPress
	 * had — 'publish', '1', an int. The field's kind still decides the shape,
	 * so an untouched screen never reads as dirty because a boolean came back
	 * as a string.
	 */
	public function test_a_value_from_the_callback_is_cast_by_its_kind(): void {
		$held  = [ 'home' => '1', 'about' => '' ];
		$store = Store::for( $this->callbackScreen( $held ) );
		$this->assertSame( [ 'home' => true, 'about' => false ], $store->read() );
	}

	public function test_a_field_the_callback_says_nothing_about_falls_back_to_its_default(): void {
		$held  = [ 'home' => true ];
		$store = Store::for( $this->callbackScreen( $held ) );
		$this->assertSame( [ 'home' => true, 'about' => false ], $store->read() );
	}

	/** A callback that does not say it worked has not worked. */
	public function test_a_write_that_does_not_return_true_is_a_failure(): void {
		$held   = [];
		$screen = $this->callbackScreen( $held, [ 'write' => static function () {
			// Returns null, the shape of a callback that forgot to answer.
		} ] );
		$this->assertFalse( Store::for( $screen )->write( [ 'home' => true ] ) );
	}

	public function test_a_record_screen_may_not_own_its_storage(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'settings screen' );
		Schema::validate( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => 'bw_sport',
			'read'      => static function () {
				return [];
			},
			'write'     => static function () {
				return true;
			},
			'tabs'      => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
			] ] ],
		] );
	}

	public function test_a_screen_supplying_only_one_half_is_refused(): void {
		$this->expectException( \InvalidArgumentException::class );
		$this->expectExceptionMessage( 'both, or neither' );
		Schema::validate( [
			'slug'  => 'pages',
			'title' => 'Pages',
			'store' => 'option',
			'read'  => static function () {
				return [];
			},
			'tabs'  => [ [ 'id' => 'v', 'label' => 'V', 'panels' => [
				[ 'id' => 'p', 'title' => 'P', 'fields' => [ [ 'id' => 'home', 'kind' => 'toggle', 'label' => 'Home' ] ] ],
			] ] ],
		] );
	}

	public function test_a_screen_owning_its_storage_needs_no_option_name(): void {
		$held = [];
		// The assertion is that this does not throw: option_name is what an
		// ordinary settings screen needs, and this one stores nothing there.
		$this->assertIsArray( $this->callbackScreen( $held ) );
	}
}
