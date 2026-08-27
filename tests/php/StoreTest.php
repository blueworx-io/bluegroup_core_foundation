<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Schema;
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
}
