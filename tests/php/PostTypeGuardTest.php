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
}
