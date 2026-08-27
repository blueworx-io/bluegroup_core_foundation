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
}
