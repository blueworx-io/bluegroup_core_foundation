<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;
use Blueworx\PageEditor\v1\Settings;

final class SettingsTabTest extends TestCase {

	protected function setUp(): void {
		bwpe_stub_reset();
		Editor::reset();
		$GLOBALS['bwpe_stub']['post_types']   = [ 'bw_sport' ];
		$GLOBALS['bwpe_stub']['capabilities'] = [ 'manage_options' ];
		// Editor::load() now checks the id resolves to a real post of this
		// screen's own post type — see PostTypeGuardTest. The record-screen
		// tests here all load id 7, so it needs to exist as a bw_sport post.
		$GLOBALS['bwpe_stub']['posts'][7]     = [ 'post_type' => 'bw_sport' ];
	}

	private function register( string $store = 'post', array $extra = [] ): void {
		Editor::register( array_merge(
			[
				'slug' => 'sports', 'title' => 'Edit sport',
				'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
					[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
				] ] ],
			],
			'post' === $store ? [ 'post_type' => 'bw_sport' ] : [ 'store' => 'option', 'option_name' => 'bw_x' ],
			$extra
		) );
	}

	public function test_a_record_screen_gains_the_tab_last(): void {
		$this->register( 'post' );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$this->assertSame( 'Publish & settings', end( $tabs )['label'] );
	}

	public function test_the_tab_holds_the_three_panels_in_order(): void {
		$this->register( 'post' );
		$tabs   = Editor::load( 'sports', 7 )['schema']['tabs'];
		$panels = array_column( end( $tabs )['panels'], 'id' );
		$this->assertSame( [ 'status', 'taxonomies', 'parent' ], $panels );
	}

	public function test_the_slug_field_warns_that_links_break(): void {
		$this->register( 'post' );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$help = '';
		foreach ( end( $tabs )['panels'][0]['fields'] as $field ) {
			if ( 'slug' === $field['kind'] ) {
				$help = $field['help'];
			}
		}
		$this->assertStringContainsString( 'not redirected', $help );
	}

	public function test_a_settings_screen_does_not_gain_the_tab(): void {
		$this->register( 'option' );
		$tabs = Editor::load( 'sports' )['schema']['tabs'];
		$this->assertCount( 1, $tabs );
	}

	public function test_the_settings_fields_carry_the_same_defaults_as_any_other_field(): void {
		$this->register( 'post' );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		foreach ( end( $tabs )['panels'] as $panel ) {
			foreach ( $panel['fields'] as $field ) {
				$this->assertArrayHasKey( 'wide', $field );
				$this->assertArrayHasKey( 'required', $field );
				$this->assertArrayHasKey( 'depends_on', $field );
				$this->assertArrayHasKey( 'capability', $field );
				$this->assertArrayHasKey( 'locked_help', $field );
			}
		}
	}

	/**
	 * A custom post type with its own capabilities has its own publisher —
	 * 'publish_sports', not 'publish_posts'. Asking for the generic one locks
	 * the status field for the person who is actually allowed to publish, and
	 * still opens it to a plain Author who happens to hold publish_posts.
	 */
	public function test_the_status_field_asks_for_the_post_types_own_publish_capability(): void {
		$GLOBALS['bwpe_stub']['post_type_caps']['bw_sport'] = [ 'publish_posts' => 'publish_sports' ];

		$tab = Settings::tab( [ 'store' => 'post', 'slug' => 'sports', 'post_type' => 'bw_sport' ] );

		$this->assertSame( 'publish_sports', $this->settingsField( $tab, 'post_status' )['capability'] );
	}

	public function test_the_status_field_uses_publish_posts_for_a_type_that_maps_nothing_of_its_own(): void {
		$tab = Settings::tab( [ 'store' => 'post', 'slug' => 'sports', 'post_type' => 'bw_sport' ] );

		$this->assertSame( 'publish_posts', $this->settingsField( $tab, 'post_status' )['capability'] );
	}

	/**
	 * The tab is also built at registration, on plugins_loaded, where no post
	 * type exists yet — get_post_type_object() answers null and there is
	 * nothing to derive from.
	 */
	public function test_the_status_field_falls_back_when_the_post_type_is_not_registered_yet(): void {
		$GLOBALS['bwpe_stub']['post_types'] = [];

		$tab = Settings::tab( [ 'store' => 'post', 'slug' => 'sports', 'post_type' => 'bw_sport' ] );

		$this->assertSame( 'publish_posts', $this->settingsField( $tab, 'post_status' )['capability'] );
	}

	/* --- What a screen may leave out --------------------------------------- */

	public function test_a_screen_that_says_nothing_still_gets_everything(): void {
		$this->register( 'post' );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$ids  = [];
		foreach ( end( $tabs )['panels'] as $panel ) {
			$ids = array_merge( $ids, array_column( $panel['fields'], 'id' ) );
		}
		foreach ( [ 'post_name', 'post_excerpt', 'comment_status', 'post_tags', 'featured_image', 'post_parent', 'menu_order' ] as $id ) {
			$this->assertContains( $id, $ids );
		}
	}

	public function test_a_screen_can_leave_out_whole_panels(): void {
		$this->register( 'post', [ 'publishing' => [ 'taxonomies' => false, 'parent' => false ] ] );
		$tabs   = Editor::load( 'sports', 7 )['schema']['tabs'];
		$panels = array_column( end( $tabs )['panels'], 'id' );
		$this->assertSame( [ 'status' ], $panels );
	}

	public function test_a_screen_can_leave_out_the_excerpt_and_the_comment_switch(): void {
		$this->register( 'post', [ 'publishing' => [ 'excerpt' => false, 'comments' => false ] ] );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$ids  = array_column( end( $tabs )['panels'][0]['fields'], 'id' );
		$this->assertNotContains( 'post_excerpt', $ids );
		$this->assertNotContains( 'comment_status', $ids );
		$this->assertContains( 'post_status', $ids );
		$this->assertContains( 'post_name', $ids );
	}

	public function test_a_screen_can_show_the_slug_without_letting_anyone_change_it(): void {
		$this->register( 'post', [ 'publishing' => [ 'slug' => 'readonly' ] ] );
		$tabs = Editor::load( 'sports', 7 )['schema']['tabs'];
		$slug = $this->settingsField( [ 'panels' => end( $tabs )['panels'] ], 'post_name' );
		$this->assertTrue( $slug['readonly'] );
	}

	/**
	 * A field left out is still a field this library owns. Freeing up its id
	 * the moment it stops being drawn would mean a screen that hides the
	 * excerpt today silently writes over the real post_excerpt tomorrow —
	 * the one thing reservedFieldIds() exists to stop.
	 */
	public function test_leaving_a_field_out_does_not_free_up_its_id(): void {
		Editor::register(
			[
				'slug'       => 'sports',
				'title'      => 'Edit sport',
				'post_type'  => 'bw_sport',
				'publishing' => [ 'excerpt' => false ],
				'tabs'       => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
					[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'post_excerpt', 'kind' => 'text', 'label' => 'Blurb' ] ] ],
				] ] ],
			]
		);

		$this->assertStringContainsString( 'not ready', Editor::load( 'sports', 7 )['problem'] );
	}

	public function test_a_publishing_key_nobody_recognises_is_refused(): void {
		$this->register( 'post', [ 'publishing' => [ 'excerpts' => false ] ] );

		$this->assertStringContainsString( 'not ready', Editor::load( 'sports', 7 )['problem'] );
	}

	public function test_a_settings_screen_may_not_ask_about_a_tab_it_never_gets(): void {
		$this->register( 'option', [ 'publishing' => [ 'excerpt' => false ] ] );

		$this->assertStringContainsString( 'not ready', Editor::load( 'sports' )['problem'] );
	}

	public function test_a_slug_setting_nobody_recognises_is_refused(): void {
		$this->register( 'post', [ 'publishing' => [ 'slug' => 'maybe' ] ] );

		$this->assertStringContainsString( 'not ready', Editor::load( 'sports', 7 )['problem'] );
	}

	private function settingsField( array $tab, string $id ): array {
		foreach ( $tab['panels'] as $panel ) {
			foreach ( $panel['fields'] as $field ) {
				if ( $id === $field['id'] ) {
					return $field;
				}
			}
		}
		$this->fail( sprintf( '"%s" is not on the Publish and settings tab.', $id ) );
	}
}
