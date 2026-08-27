<?php
namespace Blueworx\PageEditor\Tests;

use PHPUnit\Framework\TestCase;
use Blueworx\PageEditor\v1\Editor;

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

	private function register( string $store = 'post' ): void {
		Editor::register( array_merge(
			[
				'slug' => 'sports', 'title' => 'Edit sport',
				'tabs' => [ [ 'id' => 'd', 'label' => 'Details', 'panels' => [
					[ 'id' => 'b', 'title' => 'Basics', 'fields' => [ [ 'id' => 'name', 'kind' => 'text', 'label' => 'Name' ] ] ],
				] ] ],
			],
			'post' === $store ? [ 'post_type' => 'bw_sport' ] : [ 'store' => 'option', 'option_name' => 'bw_x' ]
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
}
