<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

final class PostTypeGuardTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
	}

	private function register( string $post_type ): void {
		Editor::register( [
			'slug'      => 'sports',
			'title'     => 'Edit sport',
			'post_type' => $post_type,
			'tabs'      => [],
		] );
	}

	public function test_a_registered_post_type_is_ready(): void {
		$GLOBALS['bwpe_stub']['post_types'] = [ 'bw_sport' ];
		$this->register( 'bw_sport' );
		$this->assertTrue( Editor::ready( 'sports' ) );
	}

	public function test_an_unregistered_post_type_is_not_ready(): void {
		$this->register( 'bw_sport' );
		$this->assertFalse( Editor::ready( 'sports' ) );
	}

	public function test_the_reason_names_the_post_type(): void {
		$this->register( 'bw_sport' );
		Editor::ready( 'sports' );
		$this->assertStringContainsString( 'bw_sport', Editor::problem( 'sports' ) );
	}

	public function test_an_option_screen_needs_no_post_type(): void {
		Editor::register( [
			'slug'        => 'club-pages',
			'title'       => 'Club pages',
			'store'       => 'option',
			'option_name' => 'bw_club_pages',
			'tabs'        => [],
		] );
		$this->assertTrue( Editor::ready( 'club-pages' ) );
	}

	/**
	 * A capability check that only ever looks at the screen, and an id cast
	 * with nothing else, lets any user who may open the screen at all post an
	 * arbitrary id and overwrite an unrelated post's columns and meta. These
	 * tests pin the fix: the id must resolve to a real post of this screen's
	 * own post type, and the current user must be allowed to edit that
	 * specific post.
	 */
	private function registerFull(): void {
		Editor::register( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [
					[ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ],
				] ],
			] ] ],
		] );
	}

	public function test_loading_a_record_of_the_wrong_post_type_is_refused(): void {
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport', 'bw_venue' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$this->registerFull();
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_venue' ];

		$loaded = Editor::load( 'sports', 7 );

		$this->assertNull( $loaded['schema'] );
		$this->assertStringContainsString( 'could not be found', $loaded['problem'] );
	}

	public function test_saving_to_a_record_of_the_wrong_post_type_writes_nothing(): void {
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport', 'bw_venue' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$this->registerFull();
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_venue' ];

		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );

		$this->assertFalse( $result['ok'] );
		$this->assertStringContainsString( 'could not be found', $result['errors']['_screen'] );
		$this->assertArrayNotHasKey( 7, $GLOBALS['bwpe_stub']['meta'] );
	}

	public function test_a_user_without_permission_to_edit_this_specific_record_is_refused(): void {
		$GLOBALS['bwpe_stub']['post_types']    = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities']  = [ 'manage_options' ];
		$this->registerFull();
		$GLOBALS['bwpe_stub']['posts'][7]      = [ 'post_type' => 'bw_sport' ];
		$GLOBALS['bwpe_stub']['edit_posts'][7] = false;

		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );

		$this->assertFalse( $result['ok'] );
		$this->assertStringContainsString( 'permission', $result['errors']['_screen'] );
		$this->assertArrayNotHasKey( 7, $GLOBALS['bwpe_stub']['meta'] );
	}

	public function test_an_id_of_zero_on_a_post_screen_is_refused(): void {
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$this->registerFull();

		$loaded = Editor::load( 'sports' );
		$this->assertNull( $loaded['schema'] );

		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ] );
		$this->assertFalse( $result['ok'] );
	}

	public function test_an_option_screen_ignores_the_id_entirely(): void {
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		Editor::register( [
			'slug' => 'club-pages', 'title' => 'Club pages', 'store' => 'option', 'option_name' => 'bw_club_pages',
			'tabs' => [ [ 'id' => 'g', 'label' => 'Global', 'panels' => [
				[ 'id' => 'h', 'title' => 'Header', 'fields' => [ [ 'id' => 'menu_label', 'kind' => 'text', 'label' => 'Menu label' ] ] ],
			] ] ],
		] );

		$loaded = Editor::load( 'club-pages' );
		$this->assertNotNull( $loaded['schema'], 'id 0 is a normal load for an option screen, not a refusal' );

		$result = Editor::save( 'club-pages', [ 'menu_label' => 'Menu' ], 999 );
		$this->assertTrue( $result['ok'], 'a non-zero id on an option screen must be ignored, not validated' );
		$this->assertSame( 'Menu', $GLOBALS['bwpe_stub']['options']['bw_club_pages']['menu_label'] );
	}

	public function test_the_happy_path_still_loads_and_saves_a_real_record(): void {
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$this->registerFull();
		$GLOBALS['bwpe_stub']['posts'][7] = [ 'post_type' => 'bw_sport' ];

		$result = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$this->assertTrue( $result['ok'] );

		$loaded = Editor::load( 'sports', 7 );
		$this->assertNotNull( $loaded['schema'] );
		$this->assertSame( 'Rugby', $loaded['values']['name'] );
	}
}
