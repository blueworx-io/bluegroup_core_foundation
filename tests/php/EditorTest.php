<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

/**
 * Registration runs on plugins_loaded. An exception escaping it takes down
 * wp-admin and the front end together, so a mistake in a screen definition
 * has to degrade to a message on that one screen — the way an unregistered
 * post type already does — and never to a white screen.
 */
final class EditorTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		$GLOBALS['bwpe_stub']['posts'][7]     = [ 'post_type' => 'bw_sport' ];
	}

	private function screen( array $field ): array {
		return [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ $field ] ],
			] ] ],
		];
	}

	public function test_a_mistyped_field_kind_does_not_throw(): void {
		Editor::register( $this->screen( [ 'id' => 'name', 'kind' => 'txet', 'label' => 'Name' ] ) );
		$this->assertFalse( Editor::ready( 'sports' ) );
	}

	public function test_a_mistyped_field_kind_leaves_the_screen_with_a_message_naming_it(): void {
		Editor::register( $this->screen( [ 'id' => 'name', 'kind' => 'txet', 'label' => 'Name' ] ) );

		$this->assertNotNull( Editor::get( 'sports' ), 'the screen still exists, so its menu item still renders' );
		$this->assertStringContainsString( 'txet', Editor::problem( 'sports' ) );
	}

	public function test_a_screen_that_could_not_be_registered_refuses_to_load_or_save(): void {
		Editor::register( $this->screen( [ 'id' => 'name', 'kind' => 'txet', 'label' => 'Name' ] ) );

		$loaded = Editor::load( 'sports', 7 );
		$this->assertNull( $loaded['schema'] );
		$this->assertStringContainsString( 'txet', $loaded['problem'] );

		$saved = Editor::save( 'sports', [ 'name' => 'Rugby' ], 7 );
		$this->assertFalse( $saved['ok'] );
		$this->assertStringContainsString( 'txet', $saved['errors']['_screen'] );
	}

	public function test_a_tab_that_is_not_an_array_says_so_rather_than_raising_a_type_error(): void {
		Editor::register( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ 'Details' ],
		] );

		$this->assertFalse( Editor::ready( 'sports' ) );
		$this->assertStringContainsString( 'tab', Editor::problem( 'sports' ) );
		$this->assertStringNotContainsString( 'TypeError', Editor::problem( 'sports' ) );
	}

	public function test_a_panel_that_is_not_an_array_says_so(): void {
		Editor::register( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [ 'Basics' ] ] ],
		] );

		$this->assertStringContainsString( 'panel', Editor::problem( 'sports' ) );
	}

	public function test_a_field_that_is_not_an_array_says_so(): void {
		Editor::register( [
			'slug' => 'sports', 'title' => 'Edit sport', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ 'name' ] ],
			] ] ],
		] );

		$this->assertStringContainsString( 'field', Editor::problem( 'sports' ) );
	}

	/**
	 * Without a slug there is no screen to hang a message on and no menu item
	 * to show it, so nothing is registered at all. The one case that stays
	 * silent, and it is a typo the developer sees the moment they open the
	 * screen that never appeared.
	 */
	public function test_a_screen_with_no_slug_registers_nothing_and_does_not_throw(): void {
		Editor::register( [] );
		$this->assertSame( [], Editor::all() );
	}

	public function test_a_screen_registered_after_a_broken_one_is_unaffected(): void {
		Editor::register( $this->screen( [ 'id' => 'name', 'kind' => 'txet', 'label' => 'Name' ] ) );
		Editor::register( [
			'slug' => 'clubs', 'title' => 'Edit club', 'post_type' => 'bw_sport',
			'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
				[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
			] ] ],
		] );

		$this->assertTrue( Editor::ready( 'clubs' ) );
		$this->assertSame( '', Editor::problem( 'clubs' ) );
	}

	public function test_re_registering_a_screen_correctly_clears_its_problem(): void {
		Editor::register( $this->screen( [ 'id' => 'name', 'kind' => 'txet', 'label' => 'Name' ] ) );
		Editor::register( $this->screen( [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ) );

		$this->assertTrue( Editor::ready( 'sports' ) );
		$this->assertSame( '', Editor::problem( 'sports' ) );
	}
}
